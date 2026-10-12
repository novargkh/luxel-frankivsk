import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sessionUser } from "@/lib/adminGuard";
import { orderNumbers } from "@/lib/docNumber";
import { ORDER_STATUSES, orderSubtotal, orderTotal, type AdminOrderStatus } from "@/lib/adminOrders";

type Ctx = { params: Promise<{ id: string }> };

async function load(id: string) {
  const o = await prisma.order.findUnique({
    where: { id },
    include: {
      items: {
        orderBy: { id: "asc" },
        include: {
          product: { select: { id: true, name: true, price: true, article: true, images: { select: { url: true }, take: 1 } } },
        },
      },
      user: {
        select: {
          id: true,
          name: true,
          company: true,
          phone: true,
          email: true,
          shops: { select: { id: true, name: true, address: true }, orderBy: { name: "asc" } },
        },
      },
      shop: { select: { id: true, name: true, address: true } },
      promoCode: { select: { code: true } },
    },
  });
  if (!o) return null;
  const numbers = await orderNumbers([o]);
  return {
    ...o,
    number: numbers.get(o.id) ?? String(o.orderNumber),
    subtotal: orderSubtotal(o.items),
    total: orderTotal(o),
  };
}

export async function GET(_req: Request, { params }: Ctx) {
  const me = await sessionUser();
  if (!me?.isAdmin) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const order = await load((await params).id);
  if (!order) return NextResponse.json({ error: "Замовлення не знайдено" }, { status: 404 });
  return NextResponse.json(order);
}

type ItemInput = { id?: string; productId: string; quantity: number; priceAtOrder: number };

// PATCH: the admin edits a received order. Any of: status, comment,
// delivery shop, the full list of lines (quantities, prices, lines added
// or removed) and the promo discount. After a change the order goes to
// BAF again on the next exchange (BAF updates the same document by its
// external id), so the exchange state is reset to "waiting".
export async function PATCH(req: Request, { params }: Ctx) {
  const me = await sessionUser();
  if (!me?.isAdmin) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await params;

  const order = await prisma.order.findUnique({ where: { id }, include: { items: true } });
  if (!order) return NextResponse.json({ error: "Замовлення не знайдено" }, { status: 404 });

  let body: {
    status?: string;
    comment?: string | null;
    shopId?: string | null;
    discountAmount?: number;
    items?: ItemInput[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Невірний запит" }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (body.status !== undefined) {
    if (!ORDER_STATUSES.includes(body.status as AdminOrderStatus)) {
      return NextResponse.json({ error: "Невідомий статус" }, { status: 400 });
    }
    data.status = body.status;
  }
  if (body.comment !== undefined) {
    data.comment = typeof body.comment === "string" && body.comment.trim() ? body.comment.trim().slice(0, 2000) : null;
  }
  if (body.shopId !== undefined) {
    if (body.shopId) {
      const shop = await prisma.shop.findFirst({ where: { id: body.shopId, userId: order.userId } });
      if (!shop) return NextResponse.json({ error: "Цей магазин не належить клієнту" }, { status: 400 });
    }
    data.shopId = body.shopId || null;
  }
  if (body.discountAmount !== undefined) {
    const d = Number(body.discountAmount);
    if (!Number.isFinite(d) || d < 0) return NextResponse.json({ error: "Невірна знижка" }, { status: 400 });
    data.discountAmount = Math.round(d * 100) / 100;
  }

  let items: ItemInput[] | null = null;
  if (body.items !== undefined) {
    if (!Array.isArray(body.items) || body.items.length === 0) {
      return NextResponse.json(
        { error: "У замовленні має лишитися хоча б одна позиція. Щоб прибрати все, скасуйте замовлення." },
        { status: 400 }
      );
    }
    items = [];
    for (const raw of body.items) {
      const quantity = Math.round(Number(raw.quantity));
      const priceAtOrder = Math.round(Number(raw.priceAtOrder) * 100) / 100;
      if (!raw.productId || !Number.isFinite(quantity) || quantity < 1 || quantity > 99999) {
        return NextResponse.json({ error: "Кількість має бути від 1 до 99999" }, { status: 400 });
      }
      if (!Number.isFinite(priceAtOrder) || priceAtOrder < 0) {
        return NextResponse.json({ error: "Невірна ціна" }, { status: 400 });
      }
      items.push({ id: raw.id, productId: String(raw.productId), quantity, priceAtOrder });
    }
    const ids = [...new Set(items.map((i) => i.productId))];
    const found = await prisma.product.count({ where: { id: { in: ids } } });
    if (found !== ids.length) return NextResponse.json({ error: "Товар не знайдено" }, { status: 400 });
  }

  if (Object.keys(data).length === 0 && !items) {
    return NextResponse.json({ error: "Немає змін" }, { status: 400 });
  }

  // Send the corrected order to BAF again.
  data.basStatus = "NEW";
  data.basError = null;

  await prisma.$transaction(async (tx) => {
    if (items) {
      const keep = new Set(items.map((i) => i.id).filter((x): x is string => !!x));
      const existing = new Set(order.items.map((i) => i.id));
      await tx.orderItem.deleteMany({ where: { orderId: id, id: { notIn: [...keep] } } });
      for (const it of items) {
        if (it.id && existing.has(it.id)) {
          await tx.orderItem.update({
            where: { id: it.id },
            data: { productId: it.productId, quantity: it.quantity, priceAtOrder: it.priceAtOrder },
          });
        } else {
          await tx.orderItem.create({
            data: { orderId: id, productId: it.productId, quantity: it.quantity, priceAtOrder: it.priceAtOrder },
          });
        }
      }
    }
    await tx.order.update({ where: { id }, data });
  });

  return NextResponse.json(await load(id));
}
