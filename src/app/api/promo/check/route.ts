import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { discountFor, priceFor } from "@/lib/clientPrice";
import { sessionUser } from "@/lib/adminGuard";
import { evaluatePromo } from "@/lib/promo";

// Checks a code against the client's cart: dates, limits, minimum total and
// which products it covers. Returns the discount the order will get.
export async function POST(req: Request) {
  const me = await sessionUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { code, items } = (await req.json()) as {
    code?: string;
    items?: { productId: string; quantity: number }[];
  };
  if (!code?.trim()) return NextResponse.json({ valid: false, error: "Введіть промокод" });

  const promo = await prisma.promoCode.findUnique({
    where: { code: code.trim().toUpperCase() },
    include: { clients: { select: { id: true } }, products: { select: { id: true } } },
  });
  // A code handed to specific clients works only for them.
  if (!promo || (promo.clients.length > 0 && !promo.clients.some((c) => c.id === me.id))) {
    return NextResponse.json({ valid: false, error: "Промокод не знайдено" });
  }

  const wanted = (items ?? []).filter((i) => i?.productId && Number(i.quantity) > 0);
  const products = await prisma.product.findMany({
    where: { id: { in: wanted.map((i) => i.productId) } },
    select: { id: true, price: true, category: true },
  });
  // Promo discounts apply to the client's own prices.
  const discount = await discountFor(me);
  const byId = new Map(products.map((p) => [p.id, { ...p, price: priceFor(p.price, discount) }]));
  const lines = wanted
    .filter((i) => byId.has(i.productId))
    .map((i) => {
      const p = byId.get(i.productId)!;
      return { productId: p.id, category: p.category, price: p.price, quantity: Number(i.quantity) };
    });

  const [usedCount, usedByClient] = await Promise.all([
    prisma.order.count({ where: { promoCodeId: promo.id, status: { not: "CANCELLED" } } }),
    prisma.order.count({ where: { promoCodeId: promo.id, userId: me.id, status: { not: "CANCELLED" } } }),
  ]);
  const result = evaluatePromo(promo, lines, usedCount, usedByClient);
  if (!result.ok) return NextResponse.json({ valid: false, error: result.error });

  return NextResponse.json({
    valid: true,
    code: promo.code,
    type: promo.type,
    value: promo.value,
    minTotal: promo.minTotal,
    discountAmount: result.discount,
    // The code's scope, so the cart can recount as items change: null =
    // the whole order, otherwise these products and categories.
    scope:
      promo.products.length || promo.categories.length
        ? { productIds: promo.products.map((p) => p.id), categories: promo.categories }
        : null,
    partial: result.partial,
  });
}
