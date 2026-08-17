import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Orders that are not yet included in any delivery route — candidates for
// building a new route.
export async function GET() {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (role !== "ADMIN") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const orders = await prisma.order.findMany({
    where: {
      status: { in: ["NEW", "CONFIRMED"] },
      routeStopOrder: null,
    },
    include: {
      items: { include: { product: true } },
      user: { select: { name: true, company: true } },
      shop: true,
    },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(orders);
}
