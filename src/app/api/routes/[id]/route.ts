import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (role !== "ADMIN") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const route = await prisma.route.findUnique({
    where: { id },
    include: {
      stops: {
        orderBy: { position: "asc" },
        include: {
          orders: {
            include: {
              order: {
                include: {
                  items: { include: { product: true } },
                  user: { select: { name: true, company: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!route) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  return NextResponse.json(route);
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (role !== "ADMIN") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const { stopOrder, name, markDelivered } = body as {
    stopOrder?: string[];
    name?: string;
    markDelivered?: boolean;
  };

  if (stopOrder) {
    await prisma.$transaction(
      stopOrder.map((stopId, index) =>
        prisma.routeStop.update({ where: { id: stopId }, data: { position: index } })
      )
    );
  }

  if (name !== undefined) {
    await prisma.route.update({ where: { id }, data: { name } });
  }

  if (markDelivered) {
    const route = await prisma.route.findUnique({
      where: { id },
      include: { stops: { include: { orders: true } } },
    });
    const orderIds = route?.stops.flatMap((s) => s.orders.map((o) => o.orderId)) ?? [];
    if (orderIds.length > 0) {
      await prisma.order.updateMany({
        where: { id: { in: orderIds } },
        data: { status: "SHIPPED" },
      });
    }
  }

  const updated = await prisma.route.findUnique({
    where: { id },
    include: { stops: { orderBy: { position: "asc" }, include: { orders: true } } },
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (role !== "ADMIN") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { id } = await params;
  await prisma.route.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
