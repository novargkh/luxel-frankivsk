import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Admin-only edit of a client's BAS (1C) contractor GUID — the preferred
// matching key for the CommerceML exchange (see src/lib/onecExchange.ts).
// Deliberately narrow: this endpoint only ever sets an ID an admin looked
// up in BAS themselves; the portal never creates BAS contractors.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (role !== "ADMIN") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const { basId } = body as { basId?: string };

  if (basId === undefined) {
    return NextResponse.json({ error: "Немає даних для оновлення" }, { status: 400 });
  }

  const trimmed = basId.trim();
  if (trimmed) {
    const existing = await prisma.user.findUnique({ where: { basId: trimmed } });
    if (existing && existing.id !== id) {
      return NextResponse.json(
        { error: "Цей BAS ID вже прив'язаний до іншого клієнта" },
        { status: 400 }
      );
    }
  }

  const client = await prisma.user.update({
    where: { id },
    data: { basId: trimmed || null },
    select: { id: true, name: true, email: true, company: true, phone: true, basId: true },
  });

  return NextResponse.json(client);
}
