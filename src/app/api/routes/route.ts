import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (role !== "ADMIN") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const routes = await prisma.route.findMany({
    include: {
      stops: {
        include: { orders: true },
      },
    },
    orderBy: { date: "desc" },
  });

  return NextResponse.json(routes);
}

export async function POST(req: Request) {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (role !== "ADMIN") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { date, name, orderIds } = body as {
    date: string;
    name?: string;
    orderIds: string[];
  };

  if (!date || !orderIds || orderIds.length === 0) {
    return NextResponse.json(
      { error: "Оберіть дату та хоча б одне замовлення" },
      { status: 400 }
    );
  }

  const orders = await prisma.order.findMany({
    where: { id: { in: orderIds }, routeStopOrder: null },
    include: { shop: true },
  });

  if (orders.length === 0) {
    return NextResponse.json(
      { error: "Обрані замовлення вже включені в інший маршрут" },
      { status: 400 }
    );
  }

  const missingShop = orders.find((o) => !o.shop);
  if (missingShop) {
    return NextResponse.json(
      { error: "У одного із замовлень не вказано магазин доставки" },
      { status: 400 }
    );
  }

  // Group orders by shop, preserving the order in which shops first appear
  // in the submitted orderIds list.
  const shopGroups = new Map<string, typeof orders>();
  for (const id of orderIds) {
    const order = orders.find((o) => o.id === id);
    if (!order || !order.shop) continue;
    const key = order.shop.id;
    if (!shopGroups.has(key)) shopGroups.set(key, []);
    shopGroups.get(key)!.push(order);
  }

  const route = await prisma.$transaction(async (tx) => {
    const createdRoute = await tx.route.create({
      data: {
        date: new Date(date),
        name: name || undefined,
      },
    });

    let position = 0;
    for (const [, groupOrders] of shopGroups) {
      const shop = groupOrders[0].shop!;
      const stop = await tx.routeStop.create({
        data: {
          routeId: createdRoute.id,
          position: position++,
          shopId: shop.id,
          label: shop.name,
          address: shop.address,
          contactPerson: shop.contactPerson,
          phone: shop.phone,
          lat: shop.lat,
          lng: shop.lng,
        },
      });

      for (const order of groupOrders) {
        await tx.routeStopOrder.create({
          data: { routeStopId: stop.id, orderId: order.id },
        });
      }
    }

    return tx.route.findUnique({
      where: { id: createdRoute.id },
      include: { stops: { include: { orders: true } } },
    });
  });

  return NextResponse.json(route, { status: 201 });
}
