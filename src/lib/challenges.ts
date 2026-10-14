// Client tasks ("Завдання", KPI): a photo of a display, an order with
// certain products, or an order over a sum. When an entry is approved (by
// the admin, or at once for order tasks with autoApprove) the client gets a
// personal one-time promo code issued from the task's reward template.

import crypto from "crypto";
import type { Challenge, PromoCode } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const KIND_LABEL = {
  PHOTO: "Фото викладки",
  ORDER_PRODUCTS: "Замовити товари",
  ORDER_TOTAL: "Замовлення на суму",
} as const;

/** Tasks a client can see right now. */
export function activeWhere(now = new Date()) {
  return {
    isActive: true,
    OR: [{ startsAt: null }, { startsAt: { lte: now } }],
    AND: [{ OR: [{ endsAt: null }, { endsAt: { gte: new Date(now.getTime() - 86_400_000) } }] }],
  };
}

/** "−10% на 3 товари, від 1 000 ₴" — what the reward gives. */
export function rewardText(
  t:
    | (Pick<PromoCode, "type" | "value" | "minTotal" | "categories"> & {
        _count?: { products: number };
        products?: { name: string }[];
      })
    | null
) {
  if (!t) return "";
  const v = t.type === "PERCENT" ? `−${t.value}%` : `−${t.value.toLocaleString("uk-UA")} ₴`;
  const n = t._count?.products ?? 0;
  const names = t.products?.map((p) => p.name) ?? [];
  const scope =
    n && names.length && n <= 2
      ? ` на ${names.slice(0, n).join(", ")}`
      : n
        ? ` на ${n} ${n === 1 ? "товар" : n < 5 ? "товари" : "товарів"}`
        : t.categories.length
          ? ` на ${t.categories.join(", ")}`
          : " на замовлення";
  const min = t.minTotal ? `, від ${t.minTotal.toLocaleString("uk-UA")} ₴` : "";
  return `Промокод ${v}${scope}${min}`;
}

/** How many more times this client may complete the task. */
export async function attemptsLeft(c: Pick<Challenge, "id" | "maxPerClient">, userId: string) {
  const used = await prisma.challengeEntry.count({
    where: { challengeId: c.id, userId, status: { not: "REJECTED" } },
  });
  return Math.max(0, c.maxPerClient - used);
}

function randomSuffix(n = 5) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.randomBytes(n);
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

/**
 * Approves an entry and issues the reward: a personal promo code copied from
 * the template (one use, only for this client, shown in their cabinet).
 */
export async function approveEntry(entryId: string, adminComment?: string | null) {
  const entry = await prisma.challengeEntry.findUnique({
    where: { id: entryId },
    include: {
      challenge: { include: { rewardTemplate: { include: { products: { select: { id: true } } } } } },
    },
  });
  if (!entry) throw new Error("Заявку не знайдено");
  if (entry.status === "APPROVED") return entry;

  const t = entry.challenge.rewardTemplate;
  let promoCodeId: string | null = null;
  if (t) {
    const now = new Date();
    const days = entry.challenge.rewardValidDays;
    const expiresAt = days ? new Date(now.getTime() + days * 86_400_000) : t.expiresAt;
    const base = t.code.replace(/[^A-Z0-9А-ЯІЇЄҐ]/gi, "").slice(0, 12) || "BONUS";
    let code = "";
    for (let i = 0; i < 5; i++) {
      code = `${base}-${randomSuffix()}`.toUpperCase();
      if (!(await prisma.promoCode.findUnique({ where: { code }, select: { id: true } }))) break;
    }
    const promo = await prisma.promoCode.create({
      data: {
        code,
        name: `${t.name || t.code} · ${entry.challenge.title}`,
        type: t.type,
        value: t.value,
        minTotal: t.minTotal,
        categories: t.categories,
        products: { connect: t.products.map((p) => ({ id: p.id })) },
        description: t.description || null,
        startsAt: now,
        expiresAt,
        usageLimit: 1,
        perClientLimit: 1,
        isActive: true,
        showToClients: true,
        clients: { connect: { id: entry.userId } },
      },
    });
    promoCodeId = promo.id;
  }
  return prisma.challengeEntry.update({
    where: { id: entryId },
    data: { status: "APPROVED", reviewedAt: new Date(), promoCodeId, adminComment: adminComment ?? entry.adminComment },
  });
}

/**
 * After an order is placed: order tasks whose conditions this order meets
 * get an entry (approved at once when the task says so).
 */
export async function checkOrderChallenges(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: { select: { productId: true, quantity: true, priceAtOrder: true } } },
  });
  if (!order) return;
  const challenges = await prisma.challenge.findMany({
    where: { ...activeWhere(), kind: { in: ["ORDER_PRODUCTS", "ORDER_TOTAL"] } },
    include: { products: { select: { id: true } } },
  });
  const qty = new Map<string, number>();
  for (const i of order.items) qty.set(i.productId, (qty.get(i.productId) ?? 0) + i.quantity);
  const total = order.items.reduce((s, i) => s + i.quantity * i.priceAtOrder, 0);

  for (const c of challenges) {
    const met =
      c.kind === "ORDER_PRODUCTS"
        ? c.products.length > 0 && c.products.every((p) => (qty.get(p.id) ?? 0) >= Math.max(1, c.minQty))
        : c.minTotal != null && total >= c.minTotal;
    if (!met) continue;
    if ((await attemptsLeft(c, order.userId)) <= 0) continue;
    const entry = await prisma.challengeEntry.create({
      data: { challengeId: c.id, userId: order.userId, orderId: order.id, comment: "Виконано замовленням" },
    });
    if (c.autoApprove) await approveEntry(entry.id);
  }
}
