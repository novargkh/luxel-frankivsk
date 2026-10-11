import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { sessionUser } from "@/lib/adminGuard";
import { generatePassword } from "@/lib/clientAccount";

// Issues a new password to a client (replacing any old one) and returns it
// ONCE so the admin can pass it on. Only the hash is stored.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await sessionUser();
  if (!me?.isAdmin) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await params;

  const user = await prisma.user.findFirst({ where: { id, role: "CLIENT" }, select: { email: true, phone: true } });
  if (!user) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!user.email && !user.phone) {
    return NextResponse.json(
      { error: "Спочатку вкажіть клієнту email або телефон: це його логін для входу" },
      { status: 400 }
    );
  }

  const password = generatePassword();
  await prisma.user.update({
    where: { id },
    data: { passwordHash: await bcrypt.hash(password, 10), passwordIssuedAt: new Date() },
  });
  const login = [user.email, user.phone].filter(Boolean).join(" або ");
  return NextResponse.json({ password, login });
}
