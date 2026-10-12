import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sessionUser } from "@/lib/adminGuard";

// GET — the latest BAF catalog exchanges, for the admin progress bar.
export async function GET() {
  const me = await sessionUser();
  if (!me?.isAdmin) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const runs = await prisma.syncRun.findMany({ where: { kind: "baf-catalog" }, orderBy: { startedAt: "desc" }, take: 5 });
  // A run that has not finished in 2 hours was interrupted.
  const stale = (r: (typeof runs)[number]) => r.status === "running" && Date.now() - r.startedAt.getTime() > 2 * 60 * 60 * 1000;
  const archived = await prisma.product.count({ where: { archivedAt: { not: null }, isActive: false } });
  return NextResponse.json({
    runs: runs.map((r) => ({ ...r, status: stale(r) ? "error" : r.status })),
    archived,
  });
}
