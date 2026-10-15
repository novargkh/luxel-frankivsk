import { prisma } from "@/lib/prisma";

// Daily stock check against luxel.ua.
//
// Every product that came from luxel.ua (has a sourceUrl) gets its page
// fetched and the stock read from it:
//   - "Наявність: Немає в наявності" / schema.org OutOfStock -> stock 0
//   - in stock -> the quantity luxel.ua allows to order (the `max` of the
//     page's quantity input, #quantityInput), which is their warehouse count
//   - page gone (404/410) -> stock 0, status "Не знайдено"
//   - network error / page without the markers -> left untouched, "failed"
// A manual status an admin set (Product.stockOverride) is kept until the
// admin switches it back to automatic; the stock number is still refreshed
// so the admin can see what luxel.ua says (src/lib/manualStock.ts).
// Prices are only compared (counted and listed for the admin), never
// overwritten: portal prices can be set by hand.
//
// Runs from the Vercel cron at ~08:00 Kyiv (/api/cron/stock-sync) and from
// the "Оновити залишки" button in the admin. Products are taken oldest-
// checked first, so if a run hits its time budget the rest go first next
// time.

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const CONCURRENCY = 8;
const FETCH_TIMEOUT_MS = 20_000;
const MAX_DETAILS = 40;

export type PageStock =
  | { kind: "in"; qty: number | null; price: number | null; status: string }
  | { kind: "out"; price: number | null; status: string }
  | { kind: "gone" }
  | { kind: "failed" };

export function parseStockFromHtml(html: string): PageStock {
  const avText = html
    .match(/Наявність:\s*<\/span>\s*<span[^>]*>([^<]+)</)?.[1]
    ?.replace(/\s+/g, " ")
    .trim();
  const schema = html.match(/"availability"\s*:\s*"https?:\\?\/\\?\/schema\.org\\?\/(\w+)"/)?.[1];
  const priceRaw = html.match(/"price"\s*:\s*"([\d.]+)"/)?.[1];
  const price = priceRaw ? Number(priceRaw) : null;
  const maxRaw = html.match(/id="quantityInput"[^>]*\bmax="(\d+)"/)?.[1];

  if (!avText && !schema) return { kind: "failed" };

  const out =
    schema === "OutOfStock" ||
    schema === "Discontinued" ||
    (avText ? /немає|нема|відсутн|закінч/i.test(avText) : false);
  if (out) return { kind: "out", price, status: avText || "Немає в наявності" };

  return {
    kind: "in",
    qty: maxRaw ? Number(maxRaw) : null,
    price,
    status: avText || "В наявності",
  };
}

async function fetchPage(url: string): Promise<PageStock> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, "Accept-Language": "uk-UA,uk;q=0.9" },
      cache: "no-store",
      signal: ctrl.signal,
    });
    if (res.status === 404 || res.status === 410) return { kind: "gone" };
    if (!res.ok) return { kind: "failed" };
    return parseStockFromHtml(await res.text());
  } catch {
    return { kind: "failed" };
  } finally {
    clearTimeout(t);
  }
}

export type StockSyncSummary = {
  id: string;
  trigger: string;
  startedAt: Date;
  finishedAt: Date | null;
  checked: number;
  changed: number;
  inStock: number;
  outOfStock: number;
  notFound: number;
  failed: number;
  remaining: number;
  priceDiffs: number;
  details: unknown;
};

type Detail = { name: string; from: number; to: number; status: string };
type PriceDetail = { name: string; ours: number; site: number };

export async function runStockSync(opts: { trigger: "cron" | "admin"; budgetMs: number }) {
  const started = Date.now();
  const run = await prisma.stockSyncRun.create({ data: { trigger: opts.trigger } });

  const products = await prisma.product.findMany({
    where: { sourceUrl: { not: null } },
    select: { id: true, name: true, sourceUrl: true, stock: true, price: true },
    orderBy: [{ stockSyncedAt: { sort: "asc", nulls: "first" } }, { name: "asc" }],
  });

  const c = { checked: 0, changed: 0, inStock: 0, outOfStock: 0, notFound: 0, failed: 0, priceDiffs: 0 };
  const changes: Detail[] = [];
  const prices: PriceDetail[] = [];
  let next = 0;

  async function worker() {
    while (next < products.length && Date.now() - started < opts.budgetMs) {
      const p = products[next++];
      const page = await fetchPage(p.sourceUrl!);
      c.checked++;
      if (page.kind === "failed") {
        c.failed++;
        continue;
      }

      let stock: number;
      let status: string;
      if (page.kind === "gone") {
        stock = 0;
        status = "Не знайдено";
        c.notFound++;
      } else if (page.kind === "out") {
        stock = 0;
        status = page.status;
        c.outOfStock++;
      } else {
        // In stock but no quantity on the page: keep our number, or 100
        // (luxel.ua's own default) if we had none.
        stock = page.qty ?? (p.stock > 0 ? p.stock : 100);
        status = page.status;
        c.inStock++;
      }

      if (page.kind !== "gone" && page.price != null && Math.abs(page.price - p.price) >= 0.01) {
        c.priceDiffs++;
        if (prices.length < MAX_DETAILS) prices.push({ name: p.name, ours: p.price, site: page.price });
      }

      if (stock !== p.stock) {
        c.changed++;
        if (changes.length < MAX_DETAILS) changes.push({ name: p.name, from: p.stock, to: stock, status });
      }

      await prisma.product.update({
        where: { id: p.id },
        data: { stock, sourceStatus: status, stockSyncedAt: new Date() },
      });
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  return prisma.stockSyncRun.update({
    where: { id: run.id },
    data: {
      ...c,
      finishedAt: new Date(),
      remaining: Math.max(0, products.length - next),
      details: { changes, prices },
    },
  });
}

export function lastStockSync() {
  return prisma.stockSyncRun.findFirst({ orderBy: { startedAt: "desc" } });
}
