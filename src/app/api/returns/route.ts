import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withDisplayNumbers } from "@/lib/orderNumber";

const returnInclude = {
  user: { select: { name: true, email: true, company: true } },
  items: {
    include: {
      orderItem: {
        include: {
          product: { select: { id: true, name: true, article: true, images: { take: 1 } } },
          order: { select: { id: true, userId: true, createdAt: true, orderNumber: true } },
        },
      },
    },
  },
} as const;

// Client: their own return requests. Admin: everyone's.
export async function GET() {
  const session = await auth();
  const user = session?.user as { id?: string; role?: string } | undefined;
  if (!user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const isAdmin = user.role === "ADMIN";
  const returns = await prisma.returnRequest.findMany({
    where: isAdmin ? {} : { userId: user.id },
    include: returnInclude,
    orderBy: { createdAt: "desc" },
  });

  // Show the same date-based order numbers as the orders page.
  const userIds = [...new Set(returns.map((r) => r.userId))];
  const orders = userIds.length
    ? await prisma.order.findMany({
        where: { userId: { in: userIds } },
        select: { userId: true, createdAt: true, orderNumber: true },
      })
    : [];
  const numbers = new Map(withDisplayNumbers(orders).map((o) => [o.orderNumber, o.displayNumber]));

  return NextResponse.json(
    returns.map((r) => ({
      ...r,
      items: r.items.map((i) => ({
        ...i,
        orderNumber: numbers.get(i.orderItem.order.orderNumber) ?? null,
      })),
    }))
  );
}

// Client submits a return: positions from their own orders + a reason.
// Quantities can't exceed what was ordered minus what is already in other
// (not rejected) returns.
export async function POST(req: Request) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { reason, items } = (await req.json()) as {
    reason?: string;
    items?: { orderItemId: string; quantity: number }[];
  };

  if (!reason?.trim()) {
    return NextResponse.json({ error: "Вкажіть причину повернення" }, { status: 400 });
  }
  const picked = (items ?? []).filter((i) => i && i.quantity > 0);
  if (picked.length === 0) {
    return NextResponse.json({ error: "Оберіть хоча б одну позицію" }, { status: 400 });
  }

  const orderItems = await prisma.orderItem.findMany({
    where: { id: { in: picked.map((i) => i.orderItemId) } },
    include: {
      order: { select: { userId: true, status: true } },
      product: { select: { name: true } },
      returnItems: { where: { request: { status: { not: "REJECTED" } } }, select: { quantity: true } },
    },
  });
  const byId = new Map(orderItems.map((oi) => [oi.id, oi]));

  for (const p of picked) {
    const oi = byId.get(p.orderItemId);
    if (!oi || oi.order.userId !== userId) {
      return NextResponse.json({ error: "Позицію не знайдено у ваших замовленнях" }, { status: 400 });
    }
    if (oi.order.status === "CANCELLED") {
      return NextResponse.json(
        { error: `Замовлення з товаром "${oi.product.name}" скасовано` },
        { status: 400 }
      );
    }
    const alreadyReturned = oi.returnItems.reduce((s, r) => s + r.quantity, 0);
    const available = oi.quantity - alreadyReturned;
    if (!Number.isInteger(p.quantity) || p.quantity > available) {
      return NextResponse.json(
        { error: `Для "${oi.product.name}" можна повернути не більше ${Math.max(0, available)} шт` },
        { status: 400 }
      );
    }
  }

  const created = await prisma.returnRequest.create({
    data: {
      userId,
      reason: reason.trim(),
      items: { create: picked.map((p) => ({ orderItemId: p.orderItemId, quantity: p.quantity })) },
    },
  });

  return NextResponse.json(created, { status: 201 });
}
