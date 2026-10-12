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

  // The same article must not end up on two products: clear it elsewhere.
  const articles = links.map((l) => l.article.trim());
  const now = new Date();
  let linked = 0;
  let pricesChanged = 0;

  await prisma.$transaction(
    async (tx) => {
      await tx.product.updateMany({
        where: { article: { in: articles }, id: { notIn: links.map((l) => l.productId) } },
        data: { article: null },
      });
      const current = new Map(
        (await tx.product.findMany({ where: { id: { in: links.map((l) => l.productId) } }, select: { id: true, price: true } })).map(
          (p) => [p.id, p.price]
        )
      );
      for (const l of links) {
        if (!current.has(l.productId)) continue;
        const price = typeof l.price === "number" && l.price > 0 ? Math.round(l.price * 100) / 100 : null;
        const setPrice = updatePrices && price !== null && Math.abs(price - (current.get(l.productId) ?? 0)) >= 0.01;
        await tx.product.update({
          where: { id: l.productId },
          data: {
            article: l.article.trim(),
            bafName: l.name.trim(),
            unit: (l.unit || "шт").trim(),
            bafSyncedAt: now,
            ...(setPrice ? { price: price! } : {}),
          },
        });
        linked++;
        if (setPrice) pricesChanged++;
      }
    },
    { timeout: 60_000 }
  );

  let created = 0;
  for (const c of create) {
    const exists = await prisma.product.findFirst({ where: { article: c.article.trim() }, select: { id: true } });
    if (exists) continue;
    await prisma.product.create({
      data: {
        name: c.name.trim(),
        bafName: c.name.trim(),
        article: c.article.trim(),
        unit: (c.unit || "шт").trim(),
        price: typeof c.price === "number" && c.price > 0 ? Math.round(c.price * 100) / 100 : 0,
        category: categorizeProduct(c.name, null, c.group || "Інше"),
        stock: 0,
        bafSyncedAt: now,
      },
    });
    created++;
  }

  return NextResponse.json({ linked, pricesChanged, created });
}
