import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sessionUser } from "@/lib/adminGuard";

// Only an admin edits or removes delivery points (clients send a change
// request instead).
async function adminShop(shopId: string) {
  const me = await sessionUser();
  if (!me) return { error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  if (!me.isAdmin) {
    return {
      error: NextResponse.json(
        { error: "Змінити адресу може лише менеджер. Надішліть запит на зміну." },
        { status: 403 }
      ),
    };
  }
  const shop = await prisma.shop.findUnique({ where: { id: shopId } });
  if (!shop) return { error: NextResponse.json({ error: "not found" }, { status: 404 }) };
  return { shop };
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const guard = await adminShop(id);
  if (guard.error) return guard.error;

  const body = await req.json();
  const { name, address, contactPerson, phone, lat, lng, workingHours } = body as {
    name?: string;
    address?: string;
    contactPerson?: string;
    phone?: string;
    lat?: number | null;
    lng?: number | null;
    workingHours?: string;
  };

  const data: Record<string, unknown> = {};
  if (name !== undefined) data.name = name;
  if (address !== undefined) data.address = address;
  if (contactPerson !== undefined) data.contactPerson = contactPerson;
  if (phone !== undefined) data.phone = phone;
  if (lat !== undefined) data.lat = lat;
  if (lng !== undefined) data.lng = lng;
  if (workingHours !== undefined) data.workingHours = workingHours;

  const shop = await prisma.shop.update({ where: { id }, data });
  return NextResponse.json(shop);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const guard = await adminShop(id);
  if (guard.error) return guard.error;

  await prisma.shop.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
