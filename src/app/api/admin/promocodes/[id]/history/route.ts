import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sessionUser } from "@/lib/adminGuard";
import { orderNumbers } from "@/lib/docNumber";

// "Історія": orders placed with this code.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await sessionUser();
  if (!me?.isAdmin) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await params;

  const orders = await prisma.order.findMany({
    where: { promoCodeId: id },
    select: {
      id: true,
      createdAt: true,
      status: true,
      discountAmount: true,
      user: { select: { name: true, company: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  const numbers = await orderNumbers(orders);
  return NextResponse.json(orders.map((o) => ({ ...o, number: numbers.get(o.id) ?? null })));
}
