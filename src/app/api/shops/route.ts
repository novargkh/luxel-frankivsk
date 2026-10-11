import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sessionUser } from "@/lib/adminGuard";

// Delivery points. Clients see their own (read-only: changes go through a
// request to the admin); an admin reads and edits any client's via
// ?client=<id> / body.userId.
export async function GET(req: Request) {
  const me = await sessionUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const asked = new URL(req.url).searchParams.get("client");
  const userId = me.isAdmin && asked ? asked : me.id;
  const shops = await prisma.shop.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });
  return NextResponse.json(shops);
}

export async function POST(req: Request) {
  const me = await sessionUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!me.isAdmin) {
    return NextResponse.json({ error: "Додати адресу може лише менеджер. Надішліть запит на зміну." }, { status: 403 });
  }

  const body = await req.json();
  const { userId, name, address, contactPerson, phone, lat, lng, workingHours } = body as {
    userId?: string;
    name: string;
    address: string;
    contactPerson?: string;
    phone?: string;
    lat?: number | null;
    lng?: number | null;
    workingHours?: string;
  };

  if (!userId) return NextResponse.json({ error: "Не вказано клієнта" }, { status: 400 });
  if (!name || !address) {
    return NextResponse.json({ error: "Назва та адреса обов'язкові" }, { status: 400 });
  }

  const shop = await prisma.shop.create({
    data: {
      userId,
      name,
      address,
      contactPerson: contactPerson || undefined,
      phone: phone || undefined,
      lat: lat ?? undefined,
      lng: lng ?? undefined,
      workingHours: workingHours || undefined,
    },
  });

  return NextResponse.json(shop, { status: 201 });
}
