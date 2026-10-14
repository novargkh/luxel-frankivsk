import { NextResponse } from "next/server";
import { availabilityOf } from "@/lib/availability";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { pricingFor } from "@/lib/clientPrice";
import { evaluatePromo } from "@/lib/promo";
import { orderNumbers } from "@/lib/docNumber";
import { checkOrderChallenges } from "@/lib/challenges";

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
      // First image is used as a thumbnail in the orders table.
      items: { include: { product: { include: { images: { take: 1 } } } } },
      user: { select: { name: true, email: true, company: true } },
      shop: { select: { id: true, name: true, address: true } },
      promoCode: { select: { code: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const price = await pricingFor(userId ? { id: userId, isAdmin: role === "ADMIN" } : null);
  // Readable numbers like "11.10.25-3" (date + order of the day).
  const numbers = await orderNumbers(orders);
  return NextResponse.json(
    orders.map((o) => ({
      ...o,
      number: numbers.get(o.id) ?? null,
      items: o.items.map((i) => ({
        ...i,
        product: {
          ...i.product,
          // Clients never see the base price, only their own.
          price: price(i.product.id, i.product.price),
          availability: availabilityOf(i.product),
        },
      })),
    }))
  );
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
  const found = await prisma.product.findMany({
    where: { id: { in: productIds } },
  });
  // The client's own prices (base price minus their personal discount).
  const price = await pricingFor({ id: userId, isAdmin: false });
  const products = found.map((p) => ({ ...p, price: price(p.id, p.price) }));

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
    // No quantity cap by stock (owner's decision); only products that are
    // marked "Немає в наявності" (automatically or by an admin) cannot be ordered.
    if (availabilityOf(product) === "out") {
      return NextResponse.json(
        { error: `Товару немає в наявності: "${product.name}"` },
        { status: 400 }
      );
    }
  }

  let order;
  try {
    order = await prisma.$transaction(async (tx) => {
      let promoCodeId: string | undefined;
      let discountAmount = 0;

      if (promoCode) {
        const promo = await tx.promoCode.findUnique({
          where: { code: promoCode.trim().toUpperCase() },
          include: { clients: { select: { id: true } }, products: { select: { id: true } } },
        });
        // A code handed to specific clients works only for them.
        if (!promo || promo.isTemplate || (promo.clients.length > 0 && !promo.clients.some((c) => c.id === userId))) {
          throw new Error("Промокод не знайдено");
        }
        const [usedCount, usedByClient] = await Promise.all([
          tx.order.count({ where: { promoCodeId: promo.id, status: { not: "CANCELLED" } } }),
          tx.order.count({ where: { promoCodeId: promo.id, userId, status: { not: "CANCELLED" } } }),
        ]);
        const lines = items.map((i) => {
          const p = productMap.get(i.productId)!;
          return { productId: p.id, category: p.category, price: p.price, quantity: i.quantity };
        });
        const result = evaluatePromo(promo, lines, usedCount, usedByClient);
        if (!result.ok) {
          throw new Error(result.error);
        }
        promoCodeId = promo.id;
        discountAmount = result.discount;
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

      // Stock is not decremented here: it mirrors the luxel.ua warehouse and
      // is refreshed by the daily check (src/lib/stockSync.ts). Decrementing
      // would let one big order zero a product for every other client.

      return created;
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Не вдалося оформити замовлення" },
      { status: 400 }
    );
  }

  // Order tasks ("Замовте товари…", "Замовлення від …"): never block the order.
  await checkOrderChallenges(order.id).catch((e) => console.error("[tasks] order check failed", e));

  const numbers = await orderNumbers([order]);
  return NextResponse.json({ ...order, number: numbers.get(order.id) ?? null }, { status: 201 });
}
