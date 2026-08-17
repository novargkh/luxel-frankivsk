import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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
  const { status } = (await req.json()) as { status: string };

  const validStatuses = ["NEW", "CONFIRMED", "SHIPPED", "CANCELLED"];
  if (!validStatuses.includes(status)) {
    return NextResponse.json({ error: "invalid status" }, { status: 400 });
  }

  const order = await prisma.order.update({
    where: { id },
    data: { status: status as "NEW" | "CONFIRMED" | "SHIPPED" | "CANCELLED" },
  });

  return NextResponse.json(order);
}
