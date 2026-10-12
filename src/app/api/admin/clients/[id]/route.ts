import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sessionUser } from "@/lib/adminGuard";
import { cleanClientFields, clientConflicts } from "@/lib/clientFields";

const select = {
  id: true,
  name: true,
  email: true,
  company: true,
  phone: true,
  basId: true,
  taxCode: true,
  isActive: true,
  discountPercent: true,
  passwordIssuedAt: true,
} as const;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await sessionUser();
  if (!me?.isAdmin) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await params;
  const user = await prisma.user.findFirst({ where: { id, role: "CLIENT" }, select });
  if (!user) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(user);
}

// Admin edits a client's contacts, BAS code, ЄДРПОУ, or blocks the account.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await sessionUser();
  if (!me?.isAdmin) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await params;

  const data = cleanClientFields(await req.json());
  if (data.name !== undefined && !data.name) {
    return NextResponse.json({ error: "Ім'я не може бути порожнім" }, { status: 400 });
  }
  const conflict = await clientConflicts(data, id);
  if (conflict) return NextResponse.json({ error: conflict }, { status: 400 });

  const user = await prisma.user.update({ where: { id }, data, select });
  return NextResponse.json(user);
}
