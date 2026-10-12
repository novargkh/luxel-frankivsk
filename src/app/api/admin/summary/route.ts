import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sessionUser } from "@/lib/adminGuard";
import { kyivDayKey, orderNumbers } from "@/lib/docNumber";
import { addDays, orderTotal, todayKey, windowFor } from "@/lib/adminOrders";

// GET /api/admin/summary — numbers for the admin overview and the badges in
// the admin sidebar.
export async function GET() {
  const me = await sessionUser();
  if (!me?.isAdmin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const today = todayKey();
  const weekFrom = addDays(today, -6);

  const [newOrders, newReturns, openRequests, basErrors, recent, latestNew] = await Promise.all([
    prisma.order.count({ where: { status: "NEW" } }),
    prisma.returnRequest.count({ where: { status: "NEW" } }),
    prisma.profileRequest.count({ where: { status: "NEW" } }),
    prisma.order.count({ where: { basStatus: "ERROR", status: { not: "CANCELLED" } } }),
    prisma.order.findMany({
      where: { createdAt: windowFor(weekFrom, today) },
      select: {
        createdAt: true,
        status: true,
        userId: true,
        discountAmount: true,
        items: { select: { quantity: true, priceAtOrder: true } },
      },
    }),
    prisma.order.findMany({
      where: { status: "NEW" },
      orderBy: { createdAt: "desc" },
      take: 8,
      include: {
        user: { select: { name: true, company: true } },
        shop: { select: { name: true } },
        items: { select: { quantity: true, priceAtOrder: true } },
      },
    }),
  ]);

  // Last 7 days, oldest first, cancelled orders left out of the sums.
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekFrom, i));
  const byDay = new Map(days.map((d) => [d, { day: d, count: 0, total: 0 }]));
  const clients = new Set<string>();
  for (const o of recent) {
    const k = kyivDayKey(o.createdAt);
    const d = byDay.get(k);
    if (!d || o.status === "CANCELLED") continue;
    d.count++;
    d.total = Math.round((d.total + orderTotal(o)) * 100) / 100;
    clients.add(o.userId);
  }
  const week = [...byDay.values()];
  const todayRow = byDay.get(today)!;
  const numbers = await orderNumbers(latestNew);

  return NextResponse.json({
    today: { count: todayRow.count, total: todayRow.total },
    week: {
      count: week.reduce((s, d) => s + d.count, 0),
      total: Math.round(week.reduce((s, d) => s + d.total, 0) * 100) / 100,
      clients: clients.size,
      days: week,
    },
    newOrders,
    newReturns,
    openRequests,
    basErrors,
    latestNew: latestNew.map((o) => ({
      id: o.id,
      number: numbers.get(o.id) ?? String(o.orderNumber),
      createdAt: o.createdAt,
      client: o.user.company || o.user.name,
      shop: o.shop?.name ?? null,
      positions: o.items.length,
      total: orderTotal(o),
    })),
  });
}
