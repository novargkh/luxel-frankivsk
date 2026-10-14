import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sessionUser } from "@/lib/adminGuard";

// The signed-in admin's own account: login email and password.

export async function GET() {
  const me = await sessionUser();
  if (!me?.isAdmin) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const u = await prisma.user.findUnique({ where: { id: me.id }, select: { name: true, email: true, passwordIssuedAt: true } });
  return NextResponse.json(u);
}

// POST { currentPassword, newPassword?, email? }
export async function POST(req: Request) {
  const me = await sessionUser();
  if (!me?.isAdmin) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { currentPassword?: string; newPassword?: string; email?: string };

  const user = await prisma.user.findUnique({ where: { id: me.id } });
  if (!user) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!body.currentPassword || !(await bcrypt.compare(body.currentPassword, user.passwordHash))) {
    return NextResponse.json({ error: "Поточний пароль невірний" }, { status: 400 });
  }

  const data: { passwordHash?: string; passwordIssuedAt?: Date; email?: string } = {};
  const pw = body.newPassword ?? "";
  if (pw) {
    if (pw.length < 10 || /\s/.test(pw)) {
      return NextResponse.json({ error: "Новий пароль: щонайменше 10 символів, без пробілів" }, { status: 400 });
    }
    if (pw === body.currentPassword || /password|123456|qwerty/i.test(pw)) {
      return NextResponse.json({ error: "Новий пароль надто простий" }, { status: 400 });
    }
    data.passwordHash = await bcrypt.hash(pw, 10);
    data.passwordIssuedAt = new Date();
  }
  const email = body.email?.trim().toLowerCase();
  if (email && email !== user.email) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "Невірний email" }, { status: 400 });
    const taken = await prisma.user.findFirst({ where: { email: { equals: email, mode: "insensitive" }, id: { not: user.id } } });
    if (taken) return NextResponse.json({ error: "Цей email уже використовується" }, { status: 400 });
    data.email = email;
  }
  if (!Object.keys(data).length) return NextResponse.json({ error: "Немає змін" }, { status: 400 });

  await prisma.user.update({ where: { id: user.id }, data });
  return NextResponse.json({ ok: true, email: data.email ?? user.email });
}
