import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { categorizeProduct } from "@/lib/categorize";
import catalog from "../../../../../prisma/luxel-catalog.json";

// One-off (re-runnable, idempotent) admin action: re-derives each product's
// category using the source export's exact subcategory when available, then
// the URL/name rules for products added later. Safe to run repeatedly —
// products already in the right category are left untouched.
export const maxDuration = 60;

const UPDATE_CONCURRENCY = 10;
const SOURCE_SUBCATEGORY_BY_URL = new Map(
  catalog.map((item) => [item.sourceUrl, item.subcategory] as const)
);

export async function POST() {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (role !== "ADMIN") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const products = await prisma.product.findMany({
    select: { id: true, name: true, category: true, sourceUrl: true },
  });

  const changes = products
    .map((p) => ({
      id: p.id,
      from: p.category,
      to: categorizeProduct(
        p.name,
        p.sourceUrl,
        p.category ?? "Інше",
        p.sourceUrl ? SOURCE_SUBCATEGORY_BY_URL.get(p.sourceUrl) : undefined
      ),
    }))
    .filter((c) => c.to !== (c.from ?? "Інше"));

  for (let i = 0; i < changes.length; i += UPDATE_CONCURRENCY) {
    const chunk = changes.slice(i, i + UPDATE_CONCURRENCY);
    await Promise.all(
      chunk.map((c) => prisma.product.update({ where: { id: c.id }, data: { category: c.to } }))
    );
  }

  const byCategory: Record<string, number> = {};
  for (const c of changes) byCategory[c.to] = (byCategory[c.to] ?? 0) + 1;

  return NextResponse.json({ updated: changes.length, byCategory });
}
