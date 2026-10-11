import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sessionUser } from "@/lib/adminGuard";
import { isExpired, notStarted, validatePromoCode } from "@/lib/promo";

// Promo codes handed out to the signed-in client: ones shown to every
// client plus the ones assigned to them personally. Includes inactive /
// expired ones so the client can see their status; `usable` says whether it
// can be applied now (the cart still checks the minimum total and products).
export async function GET() {
  const me = await sessionUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const codes = await prisma.promoCode.findMany({
    where: {
      showToClients: true,
      OR: [{ clients: { none: {} } }, { clients: { some: { id: me.id } } }],
    },
    include: {
      products: { select: { id: true, name: true }, take: 50 },
      _count: { select: { orders: true, products: true } },
      orders: { where: { userId: me.id, status: { not: "CANCELLED" } }, select: { id: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(
    codes.map((c) => {
      const usedByMe = c.orders.length;
      const check = validatePromoCode(c, c._count.orders, usedByMe);
      const exhausted =
        (c.usageLimit != null && c._count.orders >= c.usageLimit) ||
        (c.perClientLimit != null && usedByMe >= c.perClientLimit);
      return {
        id: c.id,
        code: c.code,
        description: c.description,
        type: c.type,
        value: c.value,
        startsAt: c.startsAt,
        expiresAt: c.expiresAt,
        usageLimit: c.usageLimit,
        perClientLimit: c.perClientLimit,
        used: c._count.orders,
        usedByMe,
        minTotal: c.minTotal,
        // What it covers: whole order, or these products / categories.
        scope: {
          products: c.products.map((p) => p.name),
          productCount: c._count.products,
          categories: c.categories,
        },
        createdAt: c.createdAt,
        status: !c.isActive
          ? "INACTIVE"
          : notStarted(c.startsAt)
            ? "SCHEDULED"
            : isExpired(c.expiresAt)
              ? "EXPIRED"
              : exhausted
                ? "EXHAUSTED"
                : "ACTIVE",
        usable: check.ok,
      };
    })
  );
}
