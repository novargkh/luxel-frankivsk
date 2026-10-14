import { NextResponse, after } from "next/server";
import { notifyReturn } from "@/lib/telegramNotify";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { orderNumbers, returnNumbers } from "@/lib/docNumber";

const include = {
  user: { select: { name: true, company: true, email: true } },
  items: {
    include: {
      orderItem: {
        include: {
          product: { select: { id: true, name: true } },
          order: { select: { id: true, createdAt: true } },
        },
      },
    },
  },
} as const;

// Quantity already claimed per order line (rejected requests don't count).
async function returnedByOrderItem(userId?: string) {
  const rows = await prisma.returnItem.groupBy({
    by: ["orderItemId"],
    where: {
      request: { status: { not: "REJECTED" }, ...(userId ? { userId } : {}) },
    },
    _sum: { quantity: true },
  });
  return Object.fromEntries(rows.map((r) => [r.orderItemId, r._sum.quantity ?? 0]));
}

export async function GET() {
  const session = await auth();
  const user = session?.user as { id?: string; role?: string } | undefined;
  if (!user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const isAdmin = user.role === "ADMIN";

  const requests = await prisma.returnRequest.findMany({
    where: isAdmin ? {} : { userId: user.id },
    include,
    orderBy: { createdAt: "desc" },
  });

  const rNums = await returnNumbers(requests);
  const orders = requests.flatMap((r) => r.items.map((i) => i.orderItem.order));
  const oNums = await orderNumbers(orders);

  return NextResponse.json({
    requests: requests.map((r) => ({
      ...r,
      number: rNums.get(r.id) ?? null,
      items: r.items.map((i) => ({
        ...i,
        orderItem: {
          ...i.orderItem,
          order: { ...i.orderItem.order, number: oNums.get(i.orderItem.order.id) ?? null },
        },
      })),
    })),
    returned: await returnedByOrderItem(isAdmin ? undefined : user.id),
  });
}

export async function POST(req: Request) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as {
    reason?: string;
    items?: { orderItemId: string; quantity: number }[];
  };
  const reason = body.reason?.trim() ?? "";
  const items = (body.items ?? []).filter((i) => i && i.orderItemId && Number(i.quantity) > 0);

  if (reason.length < 3) {
    return NextResponse.json({ error: "Опишіть причину повернення" }, { status: 400 });
  }
  if (items.length === 0) {
    return NextResponse.json({ error: "Оберіть хоча б одну позицію" }, { status: 400 });
  }

  // Only lines from this client's own, not cancelled, orders.
  const lines = await prisma.orderItem.findMany({
    where: {
      id: { in: items.map((i) => i.orderItemId) },
      order: { userId, status: { not: "CANCELLED" } },
    },
    include: { product: { select: { name: true } } },
  });
  const lineMap = new Map(lines.map((l) => [l.id, l]));
  const returned = await returnedByOrderItem(userId);

  for (const i of items) {
    const line = lineMap.get(i.orderItemId);
    if (!line) {
      return NextResponse.json({ error: "Позицію не знайдено у ваших замовленнях" }, { status: 400 });
    }
    const left = line.quantity - (returned[line.id] ?? 0);
    if (Math.floor(Number(i.quantity)) > left) {
      return NextResponse.json(
        { error: `Можна повернути не більше ${left} шт: ${line.product.name}` },
        { status: 400 }
      );
    }
  }

  const created = await prisma.returnRequest.create({
    data: {
      userId,
      reason,
      items: {
        create: items.map((i) => ({ orderItemId: i.orderItemId, quantity: Math.floor(Number(i.quantity)) })),
      },
    },
  });
  after(() => notifyReturn(created.id));
  const nums = await returnNumbers([created]);
  return NextResponse.json({ ...created, number: nums.get(created.id) ?? null }, { status: 201 });
}
