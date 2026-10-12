import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sessionUser } from "@/lib/adminGuard";
import { orderNumbers } from "@/lib/docNumber";
import { addDays, inDays, isDayKey, orderSubtotal, orderTotal, todayKey, windowFor } from "@/lib/adminOrders";

// GET /api/admin/orders?from=YYYY-MM-DD&to=YYYY-MM-DD
// Every client's orders placed on those Kyiv days (default: the last 30
// days), newest first, with the totals the admin list shows. The finer
// filters (status, client, BAF state, search) run in the page.
export async function GET(req: Request) {
  const me = await sessionUser();
  if (!me?.isAdmin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const url = new URL(req.url);
  const to = isDayKey(url.searchParams.get("to")) ? url.searchParams.get("to")! : todayKey();
  const from = isDayKey(url.searchParams.get("from")) ? url.searchParams.get("from")! : addDays(to, -29);
  if (from > to) return NextResponse.json({ error: "from > to" }, { status: 400 });

  const rows = await prisma.order.findMany({
    where: { createdAt: windowFor(from, to) },
    include: {
      items: { select: { id: true, quantity: true, priceAtOrder: true, product: { select: { name: true } } } },
      user: { select: { id: true, name: true, company: true, phone: true } },
      shop: { select: { id: true, name: true, address: true } },
      promoCode: { select: { code: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 3000,
  });
  const orders = rows.filter((o) => inDays(o.createdAt, from, to));
  const numbers = await orderNumbers(orders);

  return NextResponse.json({
    from,
    to,
    orders: orders.map((o) => ({
      id: o.id,
      number: numbers.get(o.id) ?? String(o.orderNumber),
      createdAt: o.createdAt,
      status: o.status,
      basStatus: o.basStatus,
      basError: o.basError,
      exportedAt: o.exportedAt,
      comment: o.comment,
      user: o.user,
      shop: o.shop,
      promoCode: o.promoCode?.code ?? null,
      discountAmount: o.discountAmount,
      positions: o.items.length,
      units: o.items.reduce((s, i) => s + i.quantity, 0),
      subtotal: orderSubtotal(o.items),
      total: orderTotal(o),
      // For search by product name inside an order.
      productNames: o.items.map((i) => i.product.name),
    })),
  });
}
