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
  const body = (await req.json()) as { status?: string; exported?: boolean };
  const data: Record<string, unknown> = {};

  if (body.status !== undefined) {
    const validStatuses = ["NEW", "CONFIRMED", "SHIPPED", "CANCELLED"];
    if (!validStatuses.includes(body.status)) {
      return NextResponse.json({ error: "invalid status" }, { status: 400 });
    }
    data.status = body.status as "NEW" | "CONFIRMED" | "SHIPPED" | "CANCELLED";
  }

  if (body.exported !== undefined) {
    data.exportedAt = body.exported ? new Date() : null;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "no fields to update" }, { status: 400 });
  }

  const order = await prisma.order.update({ where: { id }, data });

  return NextResponse.json(order);
}
