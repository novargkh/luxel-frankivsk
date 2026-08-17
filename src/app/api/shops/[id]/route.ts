import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function assertOwnership(shopId: string, userId: string) {
  const shop = await prisma.shop.findUnique({ where: { id: shopId } });
  return shop && shop.userId === userId ? shop : null;
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const existing = await assertOwnership(id, userId);
  if (!existing) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const body = await req.json();
  const { name, address, contactPerson, phone, lat, lng } = body as {
    name?: string;
    address?: string;
    contactPerson?: string;
    phone?: string;
    lat?: number | null;
    lng?: number | null;
  };

  const data: Record<string, unknown> = {};
  if (name !== undefined) data.name = name;
  if (address !== undefined) data.address = address;
  if (contactPerson !== undefined) data.contactPerson = contactPerson;
  if (phone !== undefined) data.phone = phone;
  if (lat !== undefined) data.lat = lat;
  if (lng !== undefined) data.lng = lng;

  const shop = await prisma.shop.update({ where: { id }, data });
  return NextResponse.json(shop);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const existing = await assertOwnership(id, userId);
  if (!existing) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  await prisma.shop.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
