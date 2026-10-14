import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sessionUser } from "@/lib/adminGuard";
import { categorizeProduct } from "@/lib/categorize";

export const maxDuration = 60;

type Link = { productId: string; article: string; name: string; unit?: string; price?: number | null };
type Create = { article: string; name: string; unit?: string; price?: number | null; group?: string };

// POST { links, create, updatePrices } — saves the matching the admin
// confirmed: BAF article and name on each product (orders then go to BAF
// with them), the BAF base price if asked, and optionally adds BAF items the
// site doesn't have yet (no photo until one appears on luxel.ua).
export async function POST(req: Request) {
  const me = await sessionUser();
  if (!me?.isAdmin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { links?: Link[]; create?: Create[]; updatePrices?: boolean };
  const links = (body.links ?? []).filter((l) => l.productId && l.article?.trim());
  const create = (body.create ?? []).filter((c) => c.article?.trim() && c.name?.trim());
  const updatePrices = body.updatePrices !== false;

  const now = new Date();
  const current = new Map(
    (await prisma.product.findMany({ where: { id: { in: links.map((l) => l.productId) } }, select: { id: true, price: true } })).map(
      (p) => [p.id, p.price]
    )
  );
  const rows = links
    .filter((l) => current.has(l.productId))
    .map((l) => {
      const price = typeof l.price === "number" && l.price > 0 ? Math.round(l.price * 100) / 100 : null;
      const setPrice = updatePrices && price !== null && Math.abs(price - (current.get(l.productId) ?? 0)) >= 0.01;
      return { id: l.productId, article: l.article.trim(), bafName: l.name.trim(), unit: (l.unit || "шт").trim(), price: setPrice ? price : null };
    });

  // One statement for all rows: per-row updates (~900) outran the function
  // time limit on a remote database and the whole save rolled back.
  await prisma.$transaction([
    // The same article must not end up on two products: clear it elsewhere.
    prisma.product.updateMany({
      where: { article: { in: rows.map((r) => r.article) }, id: { notIn: rows.map((r) => r.id) } },
      data: { article: null },
    }),
    prisma.$executeRawUnsafe(
      `UPDATE "Product" AS p SET
         "article" = u.article, "bafName" = u.bafname, "unit" = u.unit,
         "price" = COALESCE(u.price, p."price"), "bafSyncedAt" = $6, "updatedAt" = $6
       FROM UNNEST($1::text[], $2::text[], $3::text[], $4::text[], $5::float8[])
         AS u(id, article, bafname, unit, price)
       WHERE p.id = u.id`,
      rows.map((r) => r.id),
      rows.map((r) => r.article),
      rows.map((r) => r.bafName),
      rows.map((r) => r.unit),
      rows.map((r) => r.price),
      now
    ),
  ]);

  const taken = new Set(
    (await prisma.product.findMany({ where: { article: { in: create.map((c) => c.article.trim()) } }, select: { article: true } })).map(
      (p) => p.article
    )
  );
  const fresh = create.filter((c) => !taken.has(c.article.trim()));
  const { count: created } = await prisma.product.createMany({
    data: fresh.map((c) => ({
      name: c.name.trim(),
      bafName: c.name.trim(),
      article: c.article.trim(),
      unit: (c.unit || "шт").trim(),
      price: typeof c.price === "number" && c.price > 0 ? Math.round(c.price * 100) / 100 : 0,
      category: categorizeProduct(c.name, null, c.group || "Інше"),
      stock: 0,
      bafSyncedAt: now,
    })),
  });

  return NextResponse.json({ linked: rows.length, pricesChanged: rows.filter((r) => r.price !== null).length, created });
}
