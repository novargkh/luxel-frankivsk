import { NextResponse } from "next/server";
import { runStockSync } from "@/lib/stockSync";

// Daily stock check, called by Vercel Cron (see vercel.json).
// If CRON_SECRET is set in Vercel, Vercel sends it as a Bearer token and we
// require it. Without it, only requests carrying Vercel's cron user agent
// are accepted (enough here: the worst a stray call can do is an extra
// stock refresh).
export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const authz = req.headers.get("authorization");
  const ua = req.headers.get("user-agent") ?? "";
  const ok = secret ? authz === `Bearer ${secret}` : ua.startsWith("vercel-cron/");
  if (!ok) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const run = await runStockSync({ trigger: "cron", budgetMs: 270_000 });
  return NextResponse.json(run);
}
