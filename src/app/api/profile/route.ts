import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sessionUser } from "@/lib/adminGuard";

// A client's own contacts. Read-only for clients: the data comes from BAS
// and only an admin changes it (admin/clients). Clients ask for changes
// through /api/profile/requests.
export async function GET() {
  const me = await sessionUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: me.id },
    select: { id: true, name: true, email: true, company: true, phone: true, taxCode: true, role: true },
  });
  return NextResponse.json(user);
}

export async function PATCH() {
  return NextResponse.json(
    { error: "Змінити дані може лише менеджер. Надішліть запит на зміну." },
    { status: 403 }
  );
}
