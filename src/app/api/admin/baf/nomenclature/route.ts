import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sessionUser } from "@/lib/adminGuard";
import { matchNomenclature, type BafRow } from "@/lib/bafMatch";

export const maxDuration = 60;

// POST { rows } — the BAF price list parsed in the browser. Returns the
// proposed matching (nothing is saved): which site product each BAF row is,
// what needs a look, what exists only in BAF or only on the site.
export async function POST(req: Request) {
  const me = await sessionUser();
  if (!me?.isAdmin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { rows } = (await req.json().catch(() => ({}))) as { rows?: BafRow[] };
  const clean = (rows ?? [])
    .filter((r) => r && typeof r.article === "string" && typeof r.name === "string" && r.article.trim() && r.name.trim())
    .slice(0, 20000)
    .map((r) => ({
      article: r.article.trim(),
      name: r.name.trim(),
      unit: String(r.unit || "шт").trim(),
      price: typeof r.price === "number" && Number.isFinite(r.price) ? r.price : null,
      group: String(r.group || ""),
    }));
  if (clean.length === 0) {
    return NextResponse.json({ error: "У файлі не знайдено рядків з артикулом і назвою" }, { status: 400 });
  }

  const products = await prisma.product.findMany({
    select: { id: true, name: true, article: true, bafName: true, price: true, isActive: true },
  });
  const results = matchNomenclature(clean, products);
  const byId = new Map(products.map((p) => [p.id, p]));
  const used = new Set(results.map((r) => r.productId).filter(Boolean));

  return NextResponse.json({
    results: results.map((r) => {
      const p = r.productId ? byId.get(r.productId) : null;
      return {
        ...r,
        product: p ? { id: p.id, name: p.name, article: p.article, price: p.price } : null,
      };
    }),
    siteOnly: products
      .filter((p) => !used.has(p.id))
      .map((p) => ({ id: p.id, name: p.name, article: p.article, isActive: p.isActive })),
    products: products.map((p) => ({ id: p.id, name: p.name })),
  });
}
