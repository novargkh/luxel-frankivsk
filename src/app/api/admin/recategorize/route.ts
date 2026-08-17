import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { refineCategory } from "@/lib/categorize";

// One-off (re-runnable, idempotent) admin action: re-derives each product's
// category from its name using the same rules newly-synced products get,
// so existing catalog items also land in the finer-grained buckets (e.g.
// floodlights and linear luminaires split out of "LED Освітлення", sockets
// split out of "Електрофурнітура"). Safe to run repeatedly — products
// already in the right category are left untouched.
export const maxDuration = 60;

const UPDATE_CONCURRENCY = 10;

export async function POST() {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (role !== "ADMIN") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const products = await prisma.product.findMany({
    select: { id: true, name: true, category: true },
  });

  const changes = products
    .map((p) => ({ id: p.id, from: p.category, to: refineCategory(p.name, p.category ?? "Інше") }))
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
