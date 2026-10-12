import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sessionUser } from "@/lib/adminGuard";
import { ensureClientAccounts, loginOf } from "@/lib/clientAccount";
import { openSecret } from "@/lib/secretBox";

export const maxDuration = 60;

// GET — every client's login and password, for the admin's list to hand out.
export async function GET() {
  const me = await sessionUser();
  if (!me?.isAdmin) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const users = await prisma.user.findMany({
    where: { role: "CLIENT" },
    select: { company: true, name: true, email: true, phone: true, basId: true, passwordEnc: true, passwordHash: true, isActive: true },
    orderBy: [{ company: "asc" }, { name: "asc" }],
  });
  return NextResponse.json(
    users.map((u) => ({
      company: u.company || u.name,
      basId: u.basId,
      login: loginOf(u),
      password: openSecret(u.passwordEnc) ?? (u.passwordHash ? "(видано раніше, не збережено — видайте новий)" : ""),
      isActive: u.isActive,
    }))
  );
}

// POST — create cabinets (passwords) for all clients who don't have one.
export async function POST() {
  const me = await sessionUser();
  if (!me?.isAdmin) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const created = await ensureClientAccounts();
  const noLogin = await prisma.user.count({ where: { role: "CLIENT", email: null, phone: null } });
  return NextResponse.json({ created, noLogin });
}
