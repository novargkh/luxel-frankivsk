import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { lastStockSync, runStockSync } from "@/lib/stockSync";

// "Оновити залишки" in the admin: same check as the daily cron, on demand.
// GET returns the latest run (for the "Останнє оновлення" line).
export const maxDuration = 300;

async function isAdmin() {
  const session = await auth();
  return (session?.user as { role?: string } | undefined)?.role === "ADMIN";
}

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return NextResponse.json(await lastStockSync());
}

export async function POST() {
  if (!(await isAdmin())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const run = await runStockSync({ trigger: "admin", budgetMs: 270_000 });
  return NextResponse.json(run);
}
