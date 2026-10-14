// BAF -> site catalog exchange (CommerceML 2, type=catalog): goods with BAF
// articles and names (import.xml) and prices (offers.xml).
//
// Why it is fast:
// - BAF sends one zip (zip=yes) instead of plain XML: ~10x less to upload.
// - Pictures inside the upload are skipped (photos come from luxel.ua).
// - The site compares every item with what it already has and writes only
//   the rows that changed, in a few batched SQL statements instead of one
//   query per product. A repeat exchange with nothing new writes nothing.
// - When BAF is set to send only changes, the files themselves are small.
// - Long imports are split across calls with the protocol's "progress"
//   answer, so a slow database never hits the function time limit.
//
// A full upload (СодержитТолькоИзменения = false) is also the list of what
// BAF sells: active products missing from it are hidden from the catalog
// (isActive=false, archivedAt set) and come back when BAF sends them again.

import { XMLParser } from "fast-xml-parser";
import { prisma } from "@/lib/prisma";
import { readZip } from "@/lib/zipRead";
import { matchNomenclature, normCode, type BafRow } from "@/lib/bafMatch";
import { categorizeProduct } from "@/lib/categorize";

const KIND = "baf-catalog";
const BATCH = 400;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseTagValue: false,
  trimValues: true,
  isArray: (name) => ["Товар", "Группа", "Предложение", "Цена", "ТипЦены", "Ид", "Склад", "Остаток"].includes(name),
});

type Obj = Record<string, unknown>;
const text = (v: unknown): string => {
  if (v == null) return "";
  if (typeof v === "string" || typeof v === "number") return String(v).trim();
  if (Array.isArray(v)) return text(v[0]);
  if (typeof v === "object") return text((v as Obj)["#text"]);
  return "";
};
const list = <T = Obj>(v: unknown): T[] => (v == null ? [] : Array.isArray(v) ? (v as T[]) : [v as T]);
const baseId = (id: string) => id.split("#")[0];

// ── session bookkeeping ────────────────────────────────────────────────

export async function currentRun() {
  const run = await prisma.syncRun.findFirst({ where: { kind: KIND }, orderBy: { startedAt: "desc" } });
  if (run && run.status === "running") return run;
  return prisma.syncRun.create({ data: { kind: KIND, stage: "Отримання файлів" } });
}

/** mode=init: a new exchange session starts. */
export async function catalogInit() {
  await prisma.syncRun.updateMany({
    where: { kind: KIND, status: "running" },
    data: { status: "error", message: "Обмін перервано: BAF почав новий", finishedAt: new Date() },
  });
  await prisma.exchangeFile.deleteMany({});
  await prisma.syncRun.create({ data: { kind: KIND, stage: "Отримання файлів" } });
}

const isPicture = (name: string) => /\.(jpe?g|png|gif|bmp|webp|tiff?)$/i.test(name) || /(^|\/)import_files\//i.test(name);

/** mode=file: one chunk of an uploaded file. Pictures are not kept. */
export async function catalogFile(filename: string, body: Buffer) {
  const run = await currentRun();
  await prisma.syncRun.update({ where: { id: run.id }, data: { bytes: { increment: body.length }, stage: "Отримання файлів" } });
  if (!filename || isPicture(filename) || body.length === 0) return;
  // Append: BAF splits big files into file_limit-sized chunks.
  await prisma.$executeRaw`
    INSERT INTO "ExchangeFile" (name, data, "updatedAt") VALUES (${filename}, ${body}, now())
    ON CONFLICT (name) DO UPDATE SET data = "ExchangeFile".data || EXCLUDED.data, "updatedAt" = now()`;
}

async function unpackZips() {
  const zips = await prisma.exchangeFile.findMany({ where: { name: { endsWith: ".zip" } } });
  for (const z of zips) {
    const entries = readZip(Buffer.from(z.data), (n) => n.toLowerCase().endsWith(".xml"));
    for (const e of entries) {
      const name = e.name.split("/").pop()!;
      await prisma.exchangeFile.upsert({
        where: { name },
        create: { name, data: new Uint8Array(e.data) },
        update: { data: new Uint8Array(e.data) },
      });
    }
    await prisma.exchangeFile.delete({ where: { name: z.name } });
  }
}

async function finish(runId: string, message?: string) {
  await prisma.syncRun.update({
    where: { id: runId },
    data: { status: "done", stage: "Готово", finishedAt: new Date(), ...(message ? { message } : {}) },
  });
}

/** mode=complete / deactivate: BAF says the session is over. */
export async function catalogComplete() {
  const run = await prisma.syncRun.findFirst({ where: { kind: KIND, status: "running" }, orderBy: { startedAt: "desc" } });
  if (run) await finish(run.id);
}

// ── import ─────────────────────────────────────────────────────────────

/**
 * mode=import: process one uploaded file. Returns the protocol answer:
 * "success", "progress\n<what>" (call again) or "failure\n<why>".
 */
export async function catalogImport(filename: string, budgetMs = 25_000): Promise<string> {
  const started = Date.now();
  const run = await currentRun();
  try {
    await unpackZips();

    const short = filename.split("/").pop() ?? filename;
    const file =
      (await prisma.exchangeFile.findUnique({ where: { name: filename } })) ??
      (await prisma.exchangeFile.findUnique({ where: { name: short } }));
    if (!file) return "success"; // a picture or a file we did not keep

    const xml = Buffer.from(file.data).toString("utf8");
    const doc = parser.parse(xml) as Obj;
    const root = (doc["КоммерческаяИнформация"] ?? {}) as Obj;

    if (root["Каталог"]) {
      const done = await importGoods(run.id, root, started, budgetMs);
      return done ? "success" : `progress\nТовари: оброблено частину, продовжую`;
    }
    if (root["ПакетПредложений"]) {
      const done = await importOffers(run.id, root, started, budgetMs);
      return done ? "success" : `progress\nЦіни: оброблено частину, продовжую`;
    }
    return "success";
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Помилка обробки файлу";
    await prisma.syncRun.update({ where: { id: run.id }, data: { status: "error", message: msg, finishedAt: new Date() } });
    console.error("[1c-exchange] catalog import failed:", e);
    return `failure\n${msg}`;
  }
}

function groupNames(root: Obj): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (groups: unknown) => {
    for (const g of list<Obj>((groups as Obj | undefined)?.["Группа"])) {
      out.set(text(g["Ид"]), text(g["Наименование"]));
      walk(g["Группы"]);
    }
  };
  walk((root["Классификатор"] as Obj | undefined)?.["Группы"]);
  return out;
}

function onlyChanges(node: Obj): boolean {
  const v = node["@_СодержитТолькоИзменения"] ?? node["СодержитТолькоИзменения"];
  return text(v).toLowerCase() === "true";
}

type Product = {
  id: string;
  name: string;
  article: string | null;
  bafName: string | null;
  basId: string | null;
  unit: string;
  isActive: boolean;
  archivedAt: Date | null;
};

async function importGoods(runId: string, root: Obj, started: number, budgetMs: number): Promise<boolean> {
  const catalog = root["Каталог"] as Obj;
  const full = !onlyChanges(catalog);
  const groups = groupNames(root);
  const goods = list<Obj>((catalog["Товары"] as Obj | undefined)?.["Товар"])
    .map((t) => ({
      basId: baseId(text(t["Ид"])),
      article: text(t["Артикул"]),
      name: text(t["Наименование"]),
      unit: text(t["БазоваяЕдиница"]) || "шт",
      group: groups.get(text((t["Группы"] as Obj | undefined)?.["Ид"])) ?? "",
      deleted: text(t["ПометкаУдаления"]).toLowerCase() === "true" || text(t["Статус"]) === "Удален",
    }))
    .filter((g) => g.basId && g.name);

  await prisma.syncRun.update({
    where: { id: runId },
    data: { stage: "Товари", total: goods.length, full },
  });

  const products: Product[] = await prisma.product.findMany({
    select: { id: true, name: true, article: true, bafName: true, basId: true, unit: true, isActive: true, archivedAt: true },
  });
  const byBasId = new Map(products.filter((p) => p.basId).map((p) => [p.basId!, p]));
  const byArticle = new Map(products.filter((p) => p.article).map((p) => [normCode(p.article!), p]));

  // 1) by BAF id, 2) by the BAF article already on the product (from an
  // earlier exchange or the Excel import), 3) the article matcher.
  const matched = new Map<number, Product>();
  const rest: { i: number; row: BafRow }[] = [];
  goods.forEach((g, i) => {
    const p = byBasId.get(g.basId) ?? (g.article ? byArticle.get(normCode(g.article)) : undefined);
    if (p) matched.set(i, p);
    else if (g.article) rest.push({ i, row: { article: g.article, name: g.name, unit: g.unit, price: null, group: g.group } });
  });
  if (rest.length) {
    const taken = new Set([...matched.values()].map((p) => p.id));
    const free = products.filter((p) => !taken.has(p.id));
    const res = matchNomenclature(rest.map((r) => r.row), free);
    res.forEach((m, k) => {
      if (m.status === "exact" && m.productId) matched.set(rest[k].i, free.find((p) => p.id === m.productId)!);
    });
  }

  const now = new Date();
  const updates: { id: string; article: string | null; bafName: string; basId: string; unit: string; active: boolean }[] = [];
  const creates: { name: string; bafName: string; article: string | null; basId: string; unit: string; category: string }[] = [];
  let unchanged = 0;
  const seen = new Set<string>();
  goods.forEach((g, i) => {
    const p = matched.get(i);
    if (!p) {
      if (!g.deleted) {
        creates.push({
          name: g.name,
          bafName: g.name,
          article: g.article || null,
          basId: g.basId,
          unit: g.unit,
          category: categorizeProduct(g.name, null, g.group || "Інше"),
        });
      }
      return;
    }
    seen.add(p.id);
    const active = !g.deleted;
    const same =
      (p.article ?? null) === (g.article || p.article || null) &&
      p.bafName === g.name &&
      p.basId === g.basId &&
      p.unit === g.unit &&
      p.isActive === active &&
      (active ? p.archivedAt === null : true);
    if (same) unchanged++;
    else updates.push({ id: p.id, article: g.article || p.article, bafName: g.name, basId: g.basId, unit: g.unit, active });
  });

  // A basId may only sit on one product: free it on any other product first.
  const movingIds = updates.map((u) => u.basId);
  if (movingIds.length) {
    await prisma.product.updateMany({
      where: { basId: { in: movingIds }, id: { notIn: updates.map((u) => u.id) } },
      data: { basId: null },
    });
  }

  let written = 0;
  for (let k = 0; k < updates.length; k += BATCH) {
    if (Date.now() - started > budgetMs) {
      await prisma.syncRun.update({ where: { id: runId }, data: { processed: unchanged + written } });
      return false;
    }
    const part = updates.slice(k, k + BATCH);
    await prisma.$executeRawUnsafe(
      `UPDATE "Product" AS p SET
         "article" = u.article, "bafName" = u.bafname, "basId" = u.basid, "unit" = u.unit,
         "isActive" = u.active, "archivedAt" = CASE WHEN u.active THEN NULL ELSE COALESCE(p."archivedAt", $7) END,
         "bafSyncedAt" = $7, "updatedAt" = $7
       FROM UNNEST($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::bool[])
         AS u(id, article, bafname, basid, unit, active)
       WHERE p.id = u.id`,
      part.map((u) => u.id),
      part.map((u) => u.article),
      part.map((u) => u.bafName),
      part.map((u) => u.basId),
      part.map((u) => u.unit),
      part.map((u) => u.active),
      now
    );
    written += part.length;
    await prisma.syncRun.update({ where: { id: runId }, data: { processed: unchanged + written } });
  }

  if (creates.length) {
    await prisma.product.createMany({
      data: creates.map((c) => ({ ...c, price: 0, stock: 0, bafSyncedAt: now })),
      skipDuplicates: true,
    });
  }

  // Full upload = the whole list of what BAF sells. Safety: if it matched
  // under half of the active catalog, it is probably a partial upload
  // (one group), so nothing is hidden.
  let archived = 0;
  let note: string | undefined;
  if (full) {
    const active = products.filter((p) => p.isActive);
    const covered = active.filter((p) => seen.has(p.id)).length;
    if (active.length === 0 || covered / active.length >= 0.5) {
      const r = await prisma.product.updateMany({
        where: { isActive: true, id: { notIn: [...seen] }, OR: [{ basId: null }, { basId: { notIn: goods.map((g) => g.basId) } }] },
        data: { isActive: false, archivedAt: now },
      });
      archived = r.count;
    } else {
      note = `Файл схожий на часткове вивантаження (${covered} з ${active.length} товарів): нічого не приховано`;
    }
  }

  await prisma.syncRun.update({
    where: { id: runId },
    data: {
      processed: goods.length,
      created: { increment: creates.length },
      updated: { increment: written },
      unchanged: { increment: unchanged },
      archived: { increment: archived },
      stage: "Товари оброблено",
      ...(note ? { message: note } : {}),
    },
  });
  return true;
}

function basePriceType(root: Obj): string | null {
  const types = list<Obj>(((root["ПакетПредложений"] as Obj)["ТипыЦен"] as Obj | undefined)?.["ТипЦены"]).map((t) => ({
    id: text(t["Ид"]),
    name: text(t["Наименование"]),
  }));
  if (!types.length) return null;
  const wanted = process.env.CML_PRICE_TYPE?.toLowerCase();
  return (
    (wanted && types.find((t) => t.name.toLowerCase().includes(wanted))) ||
    types.find((t) => /баз/i.test(t.name)) ||
    types.find((t) => /роздр/i.test(t.name)) ||
    types[0]
  ).id;
}

async function importOffers(runId: string, root: Obj, started: number, budgetMs: number): Promise<boolean> {
  const pack = root["ПакетПредложений"] as Obj;
  const typeId = basePriceType(root);
  const offers = list<Obj>((pack["Предложения"] as Obj | undefined)?.["Предложение"]).map((o) => {
    const prices = list<Obj>((o["Цены"] as Obj | undefined)?.["Цена"]);
    const price = prices.find((p) => !typeId || text(p["ИдТипаЦены"]) === typeId) ?? prices[0];
    const value = price ? Number(text(price["ЦенаЗаЕдиницу"]).replace(",", ".")) : NaN;
    return { basId: baseId(text(o["Ид"])), article: text(o["Артикул"]), price: Number.isFinite(value) ? Math.round(value * 100) / 100 : null };
  });

  await prisma.syncRun.update({ where: { id: runId }, data: { stage: "Ціни", total: offers.length, processed: 0 } });

  const products = await prisma.product.findMany({ select: { id: true, basId: true, article: true, price: true } });
  const byBasId = new Map(products.filter((p) => p.basId).map((p) => [p.basId!, p]));
  const byArticle = new Map(products.filter((p) => p.article).map((p) => [normCode(p.article!), p]));
  const changes: { id: string; price: number }[] = [];
  let unchanged = 0;
  for (const o of offers) {
    const p = byBasId.get(o.basId) ?? (o.article ? byArticle.get(normCode(o.article)) : undefined);
    if (!p || o.price === null || o.price <= 0) continue;
    if (Math.abs(p.price - o.price) < 0.005) unchanged++;
    else changes.push({ id: p.id, price: o.price });
  }

  let written = 0;
  for (let k = 0; k < changes.length; k += BATCH) {
    if (Date.now() - started > budgetMs) {
      await prisma.syncRun.update({ where: { id: runId }, data: { processed: unchanged + written } });
      return false;
    }
    const part = changes.slice(k, k + BATCH);
    await prisma.$executeRawUnsafe(
      `UPDATE "Product" AS p SET "price" = u.price, "updatedAt" = now()
       FROM UNNEST($1::text[], $2::float8[]) AS u(id, price) WHERE p.id = u.id`,
      part.map((c) => c.id),
      part.map((c) => c.price)
    );
    written += part.length;
    await prisma.syncRun.update({ where: { id: runId }, data: { processed: unchanged + written } });
  }

  await prisma.syncRun.update({
    where: { id: runId },
    data: { processed: offers.length, updated: { increment: written }, unchanged: { increment: unchanged } },
  });
  await finish(runId);
  return true;
}
