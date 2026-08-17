import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const shops = await prisma.shop.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(shops);
}

export async function POST(req: Request) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { name, address, contactPerson, phone, lat, lng } = body as {
    name: string;
    address: string;
    contactPerson?: string;
    phone?: string;
    lat?: number | null;
    lng?: number | null;
  };

  if (!name || !address) {
    return NextResponse.json(
      { error: "Назва та адреса обов'язкові" },
      { status: 400 }
    );
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
    },
  });

  return NextResponse.json(shop, { status: 201 });
}
