import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (role !== "ADMIN") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const clients = await prisma.user.findMany({
    where: { role: "CLIENT" },
    select: {
      id: true,
      name: true,
      email: true,
      company: true,
      createdAt: true,
      shops: { select: { id: true, name: true, address: true } },
      _count: { select: { orders: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(clients);
}

export async function POST(req: Request) {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (role !== "ADMIN") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { name, email, password, company } = body as {
    name: string;
    email: string;
    password: string;
    company?: string;
  };

  if (!name || !email || !password) {
    return NextResponse.json(
      { error: "Ім'я, email та пароль обов'язкові" },
      { status: 400 }
    );
  }
  if (password.length < 6) {
    return NextResponse.json(
      { error: "Пароль має містити щонайменше 6 символів" },
      { status: 400 }
    );
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json(
      { error: "Клієнт з таким email вже існує" },
      { status: 400 }
    );
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const client = await prisma.user.create({
    data: {
      name,
      email,
      company: company || undefined,
      passwordHash,
      role: "CLIENT",
    },
    select: { id: true, name: true, email: true, company: true, createdAt: true },
  });

  return NextResponse.json(client, { status: 201 });
}
