import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fetchProductSpecs } from "@/lib/specsSync";

// Admin-only, re-runnable action: fetches each product's own luxel.ua page
// and stores its "Всі характеристики" spec table. Only products that (a)
// have a sourceUrl and (b) don't have specs yet are processed, so repeated
// clicks pick up where the last run left off — same capped-batch pattern as
// "Оновити з luxel.ua".
export const maxDuration = 60;

const MAX_PER_RUN = 60;
const FETCH_CONCURRENCY = 6;

export async function POST() {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (role !== "ADMIN") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Prisma's JSON-null filtering is provider-quirky, so fetch every synced
  // product's specs and filter "not yet fetched" in JS instead of in SQL.
  const candidates = await prisma.product.findMany({
    where: { sourceUrl: { not: null } },
    select: { id: true, sourceUrl: true, specs: true },
  });
  const todo = candidates.filter((p) => !!p.sourceUrl && !p.specs);

  const batch = todo.slice(0, MAX_PER_RUN);

  let updated = 0;
  let failed = 0;

  for (let i = 0; i < batch.length; i += FETCH_CONCURRENCY) {
    const chunk = batch.slice(i, i + FETCH_CONCURRENCY);
    await Promise.all(
      chunk.map(async (p) => {
        const specs = await fetchProductSpecs(p.sourceUrl!);
        if (!specs) {
          failed++;
          return;
        }
        await prisma.product.update({ where: { id: p.id }, data: { specs } });
        updated++;
      })
    );
  }

  return NextResponse.json({
    totalPending: todo.length,
    processedThisRun: batch.length,
    updated,
    failed,
    remaining: Math.max(0, todo.length - batch.length),
  });
}
