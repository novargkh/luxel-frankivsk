import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { validatePromoCode, computeDiscount } from "@/lib/promo";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const role = (session.user as { role?: string }).role;
  const userId = (session.user as { id?: string }).id;

  const orders = await prisma.order.findMany({
    where: role === "ADMIN" ? {} : { userId },
    include: {
      items: { include: { product: true } },
      user: { select: { name: true, email: true, company: true } },
      shop: { select: { id: true, name: true, address: true } },
      promoCode: { select: { code: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(orders);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const userId = (session.user as { id?: string }).id;
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { items, comment, shopId, promoCode } = body as {
    items: { productId: string; quantity: number }[];
    comment?: string;
    shopId?: string;
    promoCode?: string;
  };

  if (!items || items.length === 0) {
    return NextResponse.json({ error: "Кошик порожній" }, { status: 400 });
  }

  if (!shopId) {
    return NextResponse.json(
      { error: "Оберіть магазин доставки — заповніть профіль" },
      { status: 400 }
    );
  }

  const shop = await prisma.shop.findUnique({ where: { id: shopId } });
  if (!shop || shop.userId !== userId) {
    return NextResponse.json({ error: "Магазин не знайдено" }, { status: 400 });
  }

  const productIds = items.map((i) => i.productId);
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
  });

  const productMap = new Map(products.map((p) => [p.id, p]));

  for (const item of items) {
    const product = productMap.get(item.productId);
    if (!product) {
      return NextResponse.json(
        { error: `Товар не знайдено: ${item.productId}` },
        { status: 400 }
      );
    }
    if (item.quantity < 1) {
      return NextResponse.json({ error: "Некоректна кількість" }, { status: 400 });
    }
    if (product.stock < item.quantity) {
      return NextResponse.json(
        { error: `Недостатньо залишку для товару "${product.name}"` },
        { status: 400 }
      );
    }
  }

  const subtotal = items.reduce(
    (sum, i) => sum + productMap.get(i.productId)!.price * i.quantity,
    0
  );

  let order;
  try {
    order = await prisma.$transaction(async (tx) => {
      let promoCodeId: string | undefined;
      let discountAmount = 0;

      if (promoCode) {
        const promo = await tx.promoCode.findUnique({
          where: { code: promoCode.trim().toUpperCase() },
        });
        if (!promo) {
          throw new Error("Промокод не знайдено");
        }
        const usedCount = await tx.order.count({ where: { promoCodeId: promo.id } });
        const check = validatePromoCode(promo, usedCount);
        if (!check.ok) {
          throw new Error(check.error);
        }
        promoCodeId = promo.id;
        discountAmount = computeDiscount(promo, subtotal);
      }

      const created = await tx.order.create({
        data: {
          userId,
          shopId,
          comment,
          promoCodeId,
          discountAmount,
          items: {
            create: items.map((i) => ({
              productId: i.productId,
              quantity: i.quantity,
              priceAtOrder: productMap.get(i.productId)!.price,
            })),
          },
        },
        include: { items: { include: { product: true } }, promoCode: true },
      });

      for (const item of items) {
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { decrement: item.quantity } },
        });
      }

      return created;
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Не вдалося оформити замовлення" },
      { status: 400 }
    );
  }

  return NextResponse.json(order, { status: 201 });
}
