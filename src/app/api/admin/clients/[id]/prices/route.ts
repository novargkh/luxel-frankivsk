import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sessionUser } from "@/lib/adminGuard";
import { matchNomenclature, normCode, type BafRow } from "@/lib/bafMatch";

export const maxDuration = 60;
type Ctx = { params: Promise<{ id: string }> };

// A client's own price list from BAF (same Excel layout as the BAF price
// list, exported with that client's price type).

export async function GET(_req: Request, { params }: Ctx) {
  const me = await sessionUser();
  if (!me?.isAdmin) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await params;
  const agg = await prisma.clientPrice.aggregate({ where: { userId: id }, _count: true, _max: { updatedAt: true } });
  return NextResponse.json({ count: agg._count, updatedAt: agg._max.updatedAt });
}

// POST { rows } — replaces the client's price list.
export async function POST(req: Request, { params }: Ctx) {
  const me = await sessionUser();
  if (!me?.isAdmin) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await params;
  const user = await prisma.user.findUnique({ where: { id }, select: { id: true } });
  if (!user) return NextResponse.json({ error: "Клієнта не знайдено" }, { status: 404 });

  const { rows } = (await req.json().catch(() => ({}))) as { rows?: BafRow[] };
  const priced = (rows ?? []).filter(
    (r) => r?.article?.trim() && typeof r.price === "number" && Number.isFinite(r.price) && r.price > 0
  );
  if (priced.length === 0) {
    return NextResponse.json({ error: "У файлі не знайдено рядків з артикулом і ціною" }, { status: 400 });
  }

  const products = await prisma.product.findMany({ select: { id: true, name: true, article: true, bafName: true } });
  // First by the BAF article already stored on products, then the matcher
  // (only sure matches) for anything not linked yet.
  const byArticle = new Map(products.filter((p) => p.article).map((p) => [normCode(p.article!), p.id]));
  const prices = new Map<string, number>();
  const rest: BafRow[] = [];
  for (const r of priced) {
    const pid = byArticle.get(normCode(r.article));
    if (pid) prices.set(pid, Math.round(r.price! * 100) / 100);
    else rest.push({ ...r, unit: r.unit || "шт", group: r.group || "" });
  }
  const unmatched: string[] = [];
  if (rest.length) {
    for (const m of matchNomenclature(rest, products)) {
      if (m.status === "exact" && m.productId && !prices.has(m.productId)) prices.set(m.productId, Math.round(m.row.price! * 100) / 100);
      else unmatched.push(`${m.row.article} ${m.row.name}`);
    }
  }

  await prisma.$transaction([
    prisma.clientPrice.deleteMany({ where: { userId: id } }),
    prisma.clientPrice.createMany({ data: [...prices].map(([productId, price]) => ({ userId: id, productId, price })) }),
  ]);
  return NextResponse.json({ saved: prices.size, total: priced.length, unmatched: unmatched.slice(0, 100), unmatchedCount: unmatched.length });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const me = await sessionUser();
  if (!me?.isAdmin) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await params;
  const r = await prisma.clientPrice.deleteMany({ where: { userId: id } });
  return NextResponse.json({ deleted: r.count });
}
