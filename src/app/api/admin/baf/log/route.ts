import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sessionUser } from "@/lib/adminGuard";

// GET ?only=errors — the BAF exchange journal: every request BAF made to
// the site, with the site's answer.
export async function GET(req: Request) {
  const me = await sessionUser();
  if (!me?.isAdmin) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const onlyErrors = new URL(req.url).searchParams.get("only") === "errors";

  const [rows, lastOk, lastFail, configured] = await Promise.all([
    prisma.exchangeLog.findMany({ where: onlyErrors ? { ok: false } : {}, orderBy: { at: "desc" }, take: 300 }),
    prisma.exchangeLog.findFirst({ where: { ok: true, mode: "checkauth" }, orderBy: { at: "desc" } }),
    prisma.exchangeLog.findFirst({ where: { ok: false }, orderBy: { at: "desc" } }),
    Promise.resolve(!!process.env.ONE_C_EXCHANGE_LOGIN?.trim() && !!process.env.ONE_C_EXCHANGE_PASSWORD?.trim()),
  ]);
  return NextResponse.json({
    configured,
    login: process.env.ONE_C_EXCHANGE_LOGIN?.trim() || null,
    lastOk: lastOk?.at ?? null,
    lastFail,
    rows,
  });
}
