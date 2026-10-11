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
  const body = await req.json();
  const { isActive, showToClients, description, clientIds } = body as {
    isActive?: boolean;
    showToClients?: boolean;
    description?: string | null;
    clientIds?: string[];
  };

  const data: Record<string, unknown> = {};
  if (isActive !== undefined) data.isActive = isActive;
  if (showToClients !== undefined) data.showToClients = showToClients;
  if (description !== undefined) data.description = description?.trim() || null;
  if (clientIds !== undefined) data.clients = { set: clientIds.map((cid) => ({ id: cid })) };

  const promo = await prisma.promoCode.update({ where: { id }, data });
  return NextResponse.json(promo);
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
  await prisma.promoCode.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
