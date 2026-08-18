import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, company: true, phone: true, role: true },
  });

  return NextResponse.json(user);
}

export async function PATCH(req: Request) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { name, company, phone } = body as { name?: string; company?: string; phone?: string };

  const data: Record<string, unknown> = {};
  if (name !== undefined) data.name = name;
  if (company !== undefined) data.company = company;
  // Contact phone — also used as the fallback client-matching key (with
  // email) for the BAS exchange when no basId has been set yet, so keep
  // it editable here rather than only via an admin screen.
  if (phone !== undefined) data.phone = phone || null;

  const user = await prisma.user.update({
    where: { id: userId },
    data,
    select: { id: true, name: true, email: true, company: true, phone: true },
  });

  return NextResponse.json(user);
}
