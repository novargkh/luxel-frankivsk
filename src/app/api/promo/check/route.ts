import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { validatePromoCode, computeDiscount } from "@/lib/promo";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { code, subtotal } = (await req.json()) as { code: string; subtotal: number };
  if (!code) {
    return NextResponse.json({ valid: false, error: "Введіть промокод" });
  }

  const promo = await prisma.promoCode.findUnique({
    where: { code: code.trim().toUpperCase() },
  });

  if (!promo) {
    return NextResponse.json({ valid: false, error: "Промокод не знайдено" });
  }

  const usedCount = await prisma.order.count({ where: { promoCodeId: promo.id } });
  const check = validatePromoCode(promo, usedCount);

  if (!check.ok) {
    return NextResponse.json({ valid: false, error: check.error });
  }

  const discountAmount = computeDiscount(promo, subtotal || 0);

  return NextResponse.json({
    valid: true,
    code: promo.code,
    type: promo.type,
    value: promo.value,
    discountAmount,
  });
}
