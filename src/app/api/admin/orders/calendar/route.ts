import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sessionUser } from "@/lib/adminGuard";
import { kyivDayKey } from "@/lib/docNumber";
import { addDays, orderTotal, todayKey, windowFor } from "@/lib/adminOrders";

// GET /api/admin/orders/calendar?month=YYYY-MM
// Per Kyiv day of that month: how many orders came in, how many are still
// new, how many were cancelled and their total (cancelled not counted).
export async function GET(req: Request) {
  const me = await sessionUser();
  if (!me?.isAdmin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const raw = new URL(req.url).searchParams.get("month");
  const month = raw && /^\d{4}-\d{2}$/.test(raw) ? raw : todayKey().slice(0, 7);
  const from = `${month}-01`;
  const to = addDays(addDays(from, 31).slice(0, 7) + "-01", -1);

  const rows = await prisma.order.findMany({
    where: { createdAt: windowFor(from, to) },
    select: { createdAt: true, status: true, discountAmount: true, items: { select: { quantity: true, priceAtOrder: true } } },
  });

  const days: Record<string, { count: number; newCount: number; cancelled: number; total: number }> = {};
  for (const o of rows) {
    const k = kyivDayKey(o.createdAt);
    if (k < from || k > to) continue;
    const d = (days[k] ??= { count: 0, newCount: 0, cancelled: 0, total: 0 });
    d.count++;
    if (o.status === "NEW") d.newCount++;
    if (o.status === "CANCELLED") d.cancelled++;
    else d.total = Math.round((d.total + orderTotal(o)) * 100) / 100;
  }
  return NextResponse.json({ month, from, to, days });
}
