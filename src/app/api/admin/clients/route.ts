import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sessionUser } from "@/lib/adminGuard";
import { cleanClientFields, clientConflicts } from "@/lib/clientFields";

// Clients come from BAS (Excel import) or are added here by an admin; there
// is no self-registration. Passwords are issued separately
// (POST /api/admin/clients/[id]/password).
export async function GET() {
  const me = await sessionUser();
  if (!me?.isAdmin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const clients = await prisma.user.findMany({
    where: { role: "CLIENT" },
    select: {
      id: true,
      name: true,
      email: true,
      company: true,
      phone: true,
      basId: true,
      taxCode: true,
      isActive: true,
      passwordHash: true,
      passwordIssuedAt: true,
      createdAt: true,
      shops: { select: { id: true, name: true, address: true } },
      _count: { select: { orders: true } },
      profileRequests: { where: { status: "NEW" }, select: { id: true } },
    },
    orderBy: [{ company: "asc" }, { name: "asc" }],
  });

  return NextResponse.json(
    clients.map(({ passwordHash, profileRequests, ...c }) => ({
      ...c,
      hasPassword: !!passwordHash,
      openRequests: profileRequests.length,
    }))
  );
}

export async function POST(req: Request) {
  const me = await sessionUser();
  if (!me?.isAdmin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const data = cleanClientFields(await req.json());
  if (!data.name && !data.company) {
    return NextResponse.json({ error: "Вкажіть назву компанії або ім'я" }, { status: 400 });
  }
  const conflict = await clientConflicts(data);
  if (conflict) return NextResponse.json({ error: conflict }, { status: 400 });

  const user = await prisma.user.create({
    data: { ...data, name: data.name || data.company || "", role: "CLIENT" },
    select: { id: true },
  });
  return NextResponse.json(user, { status: 201 });
}
