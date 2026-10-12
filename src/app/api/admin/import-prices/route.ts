import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sessionUser } from "@/lib/adminGuard";
import { resolveArticle } from "@/lib/onecExchange";

// Base prices from a BAS price list exported to Excel (parsed in the browser
// on admin/products and posted as rows). Matched to products by article:
// the product's own article (field or the code in brackets in its name),
// otherwise the code appearing as a separate token in the name. Each
// client then pays this base price minus their personal discount.
export const maxDuration = 60;

type Row = { article?: string; price?: number | string };

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export async function POST(req: Request) {
  const me = await sessionUser();
  if (!me?.isAdmin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { rows } = (await req.json()) as { rows?: Row[] };
  const byArticle = new Map<string, number>();
  for (const r of rows ?? []) {
    const article = String(r.article ?? "").trim().toUpperCase();
    const price = Number(String(r.price ?? "").replace(/\s/g, "").replace(",", "."));
    if (article && Number.isFinite(price) && price > 0) byArticle.set(article, Math.round(price * 100) / 100);
  }
  if (byArticle.size === 0) {
    return NextResponse.json({ error: "У файлі не знайдено рядків з артикулом і ціною" }, { status: 400 });
  }
  // Longer codes first, so "9601" isn't matched inside "96011".
  const keys = [...byArticle.keys()].filter((k) => k.length >= 3).sort((a, b) => b.length - a.length);

  const products = await prisma.product.findMany({ select: { id: true, name: true, article: true, price: true } });
  const used = new Set<string>();
  const changes: { name: string; from: number; to: number }[] = [];
  let matched = 0;
  const notInFile: string[] = [];

  for (const p of products) {
    const own = resolveArticle(p)?.toUpperCase() ?? null;
    let key = own && byArticle.has(own) ? own : null;
    if (!key) {
      const upper = p.name.toUpperCase();
      key =
        keys.find((k) => new RegExp(`(^|[^A-ZА-ЯЇІЄҐ0-9])${esc(k)}([^A-ZА-ЯЇІЄҐ0-9]|$)`, "u").test(upper)) ?? null;
    }
    if (!key) {
      notInFile.push(p.name);
      continue;
    }
    matched++;
    used.add(key);
    const price = byArticle.get(key)!;
    if (Math.abs(price - p.price) >= 0.01) {
      await prisma.product.update({ where: { id: p.id }, data: { price } });
      changes.push({ name: p.name, from: p.price, to: price });
    }
  }

  const unknown = [...byArticle.keys()].filter((k) => !used.has(k));
  return NextResponse.json({
    rows: byArticle.size,
    matched,
    changed: changes.length,
    changes: changes.slice(0, 50),
    notInFile: notInFile.length,
    notInFileSample: notInFile.slice(0, 20),
    unknownArticles: unknown.length,
    unknownSample: unknown.slice(0, 20),
  });
}
