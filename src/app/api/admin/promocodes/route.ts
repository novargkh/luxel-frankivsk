import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (role !== "ADMIN") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const codes = await prisma.promoCode.findMany({
    include: { _count: { select: { orders: true } } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(codes);
}

export async function POST(req: Request) {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (role !== "ADMIN") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { code, type, value, usageLimit, expiresAt } = body as {
    code: string;
    type: "PERCENT" | "FIXED";
    value: number;
    usageLimit?: number | null;
    expiresAt?: string | null;
  };

  if (!code || !type || value === undefined) {
    return NextResponse.json(
      { error: "Код, тип і розмір знижки обов'язкові" },
      { status: 400 }
    );
  }

  if (type === "PERCENT" && (value <= 0 || value > 100)) {
    return NextResponse.json(
      { error: "Відсоток знижки має бути від 1 до 100" },
      { status: 400 }
    );
  }
  if (type === "FIXED" && value <= 0) {
    return NextResponse.json(
      { error: "Сума знижки має бути більшою за 0" },
      { status: 400 }
    );
  }

  const normalizedCode = code.trim().toUpperCase();

  const existing = await prisma.promoCode.findUnique({ where: { code: normalizedCode } });
  if (existing) {
    return NextResponse.json({ error: "Такий промокод вже існує" }, { status: 400 });
  }

  const promo = await prisma.promoCode.create({
    data: {
      code: normalizedCode,
      type,
      value: Number(value),
      usageLimit: usageLimit || null,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    },
  });

  return NextResponse.json(promo, { status: 201 });
}
