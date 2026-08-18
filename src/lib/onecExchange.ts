// BAS (1C) "Малий бізнес ПРОФ" CommerceML 2 exchange — "sale" direction
// only (portal -> BAS orders). BAS initiates every call; the portal never
// calls out to BAS. See docs/1c-exchange.md for the full protocol writeup.
//
// Design notes (why things are shaped this way):
//
// - No client/product auto-creation. BAS already has every real client
//   and a single warehouse; the portal only ever *matches* existing BAS
//   records, it never invents new ones. If a client or a product line
//   can't be matched, that whole order is excluded from the batch and
//   flagged `basStatus: ERROR` with a human-readable reason instead of
//   being sent with garbage/blank identity data.
//
// - Client matching: User.basId (BAS contractor GUID) if an admin has
//   filled it in, otherwise User.email + User.phone as a fallback pair
//   BAS's own exchange rule can search by. If neither is available
//   (no basId AND no phone), the order can't be matched on the BAS side
//   at all, so it's held back rather than sent.
//
// - Product matching: Product.basId if known, otherwise the article/SKU
//   (an explicit `Product.article` override, falling back to the
//   regex-extracted article already used for catalog similarity —
//   `extractAttributes()`). A line with no resolvable article at all
//   blocks the whole order the same way a client mismatch does.
//
// - Exchange state machine (`Order.basStatus`), no separate session
//   table: NEW -> SENDING (set the instant an order is included in a
//   mode=query response) -> SENT_TO_BAS (set when BAS calls
//   mode=success). If BAS never calls success within SENDING_TIMEOUT_MS
//   (e.g. the exchange run was interrupted), the next query call
//   self-heals those rows back to ERROR so they're retried on the
//   following cycle. Because query removes orders from the
//   NEW/ERROR selection the moment it sends them, repeating query mid
//   session (before success) can never return the same order twice, and
//   once SENT_TO_BAS an order is excluded forever — that's the dedup
//   guarantee, independent of whatever BAS itself does with the <Ид>.
//
// - Session cookie is a stateless signed token (issued-at + random bytes
//   + HMAC signature), not a DB row — nothing to garbage-collect, and it
//   survives serverless cold starts fine since verification is pure
//   computation against ONE_C_EXCHANGE_SECRET.

import crypto from "crypto";
import { XMLBuilder, XMLParser } from "fast-xml-parser";
import { prisma } from "@/lib/prisma";
import { extractAttributes } from "@/lib/similarity";
import type { BasExchangeStatus, Order, OrderItem, OrderStatus, Product, PromoCode, Shop, User } from "@prisma/client";

export const EXCHANGE_COOKIE_NAME = "cml_exchange_session";
const SESSION_TTL_MS = 2 * 60 * 60 * 1000; // 2h — generous for one exchange run
// If a batch gets marked SENDING but no mode=success arrives within this
// window, treat it as failed and make it retryable again. BAS polls every
// 30 min, so 3x that comfortably covers one missed/interrupted cycle
// without prematurely resending something still mid-flight.
const SENDING_TIMEOUT_MS = 90 * 60 * 1000;
// Bounds how many orders go into one mode=query response — keeps the XML
// (and the single DB transaction that flips their status) a predictable
// size. Anything left over just goes out on the next 30-minute cycle.
export const QUERY_BATCH_SIZE = Number(process.env.ONE_C_EXCHANGE_BATCH_SIZE || 50);

function getSecret(): string {
  const secret = process.env.ONE_C_EXCHANGE_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error(
      "ONE_C_EXCHANGE_SECRET (or NEXTAUTH_SECRET) is not set — cannot sign exchange session cookies"
    );
  }
  return secret;
}

function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// ---------------------------------------------------------------------
// Auth: HTTP Basic (technical login, unrelated to NextAuth) + IP allowlist
// ---------------------------------------------------------------------

export function checkBasicAuth(req: Request): boolean {
  const expectedLogin = process.env.ONE_C_EXCHANGE_LOGIN;
  const expectedPassword = process.env.ONE_C_EXCHANGE_PASSWORD;
  if (!expectedLogin || !expectedPassword) return false;

  const header = req.headers.get("authorization") || "";
  if (!header.startsWith("Basic ")) return false;

  let decoded: string;
  try {
    decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
  } catch {
    return false;
  }
  const sepIdx = decoded.indexOf(":");
  if (sepIdx === -1) return false;
  const login = decoded.slice(0, sepIdx);
  const password = decoded.slice(sepIdx + 1);

  return timingSafeEqual(login, expectedLogin) && timingSafeEqual(password, expectedPassword);
}

export function checkIpAllowed(req: Request): boolean {
  const allowlist = (process.env.ONE_C_EXCHANGE_ALLOWED_IPS || "").trim();
  if (!allowlist) return true; // not configured — no restriction
  const allowed = allowlist.split(",").map((s) => s.trim()).filter(Boolean);
  const forwardedFor = req.headers.get("x-forwarded-for") || "";
  const clientIp = forwardedFor.split(",")[0]?.trim();
  if (!clientIp) return false;
  return allowed.includes(clientIp);
}

// ---------------------------------------------------------------------
// Session cookie: stateless, signed, no DB row
// ---------------------------------------------------------------------

export function createSessionCookieValue(): string {
  const issuedAt = Date.now();
  const nonce = crypto.randomBytes(16).toString("hex");
  const payload = `${issuedAt}.${nonce}`;
  const signature = crypto.createHmac("sha256", getSecret()).update(payload).digest("hex");
  return `${payload}.${signature}`;
}

export function verifySessionCookieValue(value: string | undefined | null): boolean {
  if (!value) return false;
  const parts = value.split(".");
  if (parts.length !== 3) return false;
  const [issuedAtStr, nonce, signature] = parts;
  const payload = `${issuedAtStr}.${nonce}`;
  const expected = crypto.createHmac("sha256", getSecret()).update(payload).digest("hex");
  if (!timingSafeEqual(signature, expected)) return false;
  const issuedAt = Number(issuedAtStr);
  if (!Number.isFinite(issuedAt)) return false;
  return Date.now() - issuedAt <= SESSION_TTL_MS;
}

export function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.get("cookie") || "";
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}

// ---------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------

export type ClientMatch =
  | { ok: true; basId: string | null; email: string; phone: string }
  | { ok: false; reason: string };

export function matchClient(user: Pick<User, "basId" | "email" | "phone" | "name">): ClientMatch {
  if (user.basId) {
    return { ok: true, basId: user.basId, email: user.email, phone: user.phone ?? "" };
  }
  if (user.email && user.phone) {
    return { ok: true, basId: null, email: user.email, phone: user.phone };
  }
  return {
    ok: false,
    reason: `Клієнта "${user.name}" не можна зіставити з BAS: немає BAS ID і немає телефону для пошуку за email+телефон`,
  };
}

export function resolveArticle(product: Pick<Product, "article" | "name">): string | null {
  if (product.article && product.article.trim()) return product.article.trim();
  return extractAttributes(product.name).article;
}

export type ProductMatch =
  | { ok: true; basId: string | null; article: string }
  | { ok: false; reason: string };

export function matchProduct(product: Pick<Product, "id" | "basId" | "article" | "name">): ProductMatch {
  if (product.basId) {
    return { ok: true, basId: product.basId, article: resolveArticle(product) ?? "" };
  }
  const article = resolveArticle(product);
  if (article) {
    return { ok: true, basId: null, article };
  }
  return {
    ok: false,
    reason: `Товар "${product.name}" (${product.id}) не можна зіставити з BAS: немає BAS ID і не вдалось визначити артикул`,
  };
}

// ---------------------------------------------------------------------
// Order validation — decides whether an order is safe to include in the
// XML at all. Anything that fails stays out of the batch.
// ---------------------------------------------------------------------

export type OrderForExchange = Order & {
  user: User;
  shop: Shop | null;
  promoCode: PromoCode | null;
  items: (OrderItem & { product: Product })[];
};

export function validateOrderForExchange(order: OrderForExchange): { ok: true } | { ok: false; reason: string } {
  const clientMatch = matchClient(order.user);
  if (!clientMatch.ok) return { ok: false, reason: clientMatch.reason };

  if (order.items.length === 0) {
    return { ok: false, reason: "Замовлення без товарних рядків" };
  }

  for (const item of order.items) {
    const productMatch = matchProduct(item.product);
    if (!productMatch.ok) return { ok: false, reason: productMatch.reason };
  }

  return { ok: true };
}

// ---------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------

const KYIV_TZ = "Europe/Kyiv";

export function formatKyivDate(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: KYIV_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

export function formatKyivTime(d: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: KYIV_TZ,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(d);
}

export function formatKyivDateTimeIso(d: Date): string {
  return `${formatKyivDate(d)}T${formatKyivTime(d)}`;
}

const STATUS_LABELS: Record<OrderStatus, string> = {
  NEW: "Нове",
  CONFIRMED: "Підтверджено",
  SHIPPED: "Відправлено",
  CANCELLED: "Скасовано",
};

export function orderStatusLabel(status: OrderStatus): string {
  return STATUS_LABELS[status] ?? status;
}

function money(n: number): string {
  return n.toFixed(2);
}

// ---------------------------------------------------------------------
// XML building
// ---------------------------------------------------------------------

const builder = new XMLBuilder({
  format: true,
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  suppressEmptyNode: true,
});

export function buildOrdersXml(orders: OrderForExchange[]): string {
  const now = new Date();

  const documents = orders.map((order) => {
    const clientMatch = matchClient(order.user);
    if (!clientMatch.ok) throw new Error("buildOrdersXml called with an unvalidated order");

    const subtotal = order.items.reduce((sum, i) => sum + i.priceAtOrder * i.quantity, 0);
    const total = Math.max(0, subtotal - order.discountAmount);

    const requisites: { Наименование: string; Значение: string }[] = [];
    if (order.shop?.address) {
      requisites.push({ Наименование: "АдресаДоставки", Значение: order.shop.address });
    }
    requisites.push({
      Наименование: "СпособОплати",
      Значение: order.paymentMethod || process.env.CML_DEFAULT_PAYMENT_METHOD || "Готівка при отриманні",
    });
    requisites.push({
      Наименование: "СпособДоставки",
      Значение: order.deliveryMethod || process.env.CML_DEFAULT_DELIVERY_METHOD || "Доставка на адресу магазину",
    });
    requisites.push({ Наименование: "СтатусЗамовлення", Значение: orderStatusLabel(order.status) });
    if (order.promoCode) {
      requisites.push({ Наименование: "Промокод", Значение: order.promoCode.code });
    }
    if (order.discountAmount > 0) {
      requisites.push({ Наименование: "Знижка", Значение: money(order.discountAmount) });
    }

    return {
      Ид: order.id,
      Номер: String(order.orderNumber),
      Дата: formatKyivDate(order.createdAt),
      Время: formatKyivTime(order.createdAt),
      ХозОперация: "Заказ товара",
      Роль: "Продавец",
      Валюта: "UAH",
      Сумма: money(total),
      ...(order.comment ? { Комментарий: order.comment } : {}),
      Контрагенты: {
        Контрагент: {
          ...(clientMatch.basId ? { Ид: clientMatch.basId } : {}),
          Роль: "Покупатель",
          Наименование: order.user.company || order.user.name,
          ПолноеНаименование: order.user.company || order.user.name,
          Контакты: {
            Контакт: [
              ...(clientMatch.email ? [{ Тип: "Почта", Значение: clientMatch.email }] : []),
              ...(clientMatch.phone ? [{ Тип: "Телефон", Значение: clientMatch.phone }] : []),
            ],
          },
          ...(order.user.name ? { ЗначенияРеквизитов: { ЗначениеРеквизита: { Наименование: "КонтактнаОсоба", Значение: order.user.name } } } : {}),
        },
      },
      Значения: { ЗначениеРеквизита: requisites },
      Товары: {
        Товар: order.items.map((item) => {
          const productMatch = matchProduct(item.product);
          if (!productMatch.ok) throw new Error("buildOrdersXml called with an unvalidated item");
          return {
            Ид: productMatch.basId || productMatch.article,
            Артикул: productMatch.article,
            Наименование: item.product.name,
            БазоваяЕдиница: item.product.unit || "шт",
            ЦенаЗаЕдиницу: money(item.priceAtOrder),
            Количество: String(item.quantity),
            Сумма: money(item.priceAtOrder * item.quantity),
          };
        }),
      },
    };
  });

  const xmlBody = builder.build({
    КоммерческаяИнформация: {
      "@_ВерсияСхемы": "2.05",
      "@_ДатаФормирования": formatKyivDateTimeIso(now),
      Документ: documents,
    },
  });

  return `<?xml version="1.0" encoding="UTF-8"?>\n${xmlBody}`;
}

// ---------------------------------------------------------------------
// Order selection + state transitions for mode=query / mode=success
// ---------------------------------------------------------------------

const ORDER_INCLUDE = {
  user: true,
  shop: true,
  promoCode: true,
  items: { include: { product: true } },
} as const;

// Reverts any batch that's been stuck in SENDING past the timeout back to
// ERROR so it gets picked up again — self-healing for interrupted runs
// where mode=success never arrived.
async function healStaleSendingOrders(): Promise<void> {
  const cutoff = new Date(Date.now() - SENDING_TIMEOUT_MS);
  await prisma.order.updateMany({
    where: { basStatus: "SENDING", basSentAt: { lt: cutoff } },
    data: {
      basStatus: "ERROR",
      basError: "Не отримано підтвердження від BAS (mode=success) протягом очікуваного часу — повторна спроба",
    },
  });
}

export async function buildQueryResponse(): Promise<{ xml: string; sentCount: number; skippedCount: number }> {
  await healStaleSendingOrders();

  const candidates = (await prisma.order.findMany({
    where: {
      basStatus: { in: ["NEW", "ERROR"] },
      status: { not: "CANCELLED" },
    },
    include: ORDER_INCLUDE,
    orderBy: { createdAt: "asc" },
    take: QUERY_BATCH_SIZE,
  })) as OrderForExchange[];

  const sendable: OrderForExchange[] = [];
  const invalid: { id: string; reason: string }[] = [];

  for (const order of candidates) {
    const check = validateOrderForExchange(order);
    if (check.ok) {
      sendable.push(order);
    } else {
      invalid.push({ id: order.id, reason: check.reason });
    }
  }

  if (invalid.length > 0) {
    await prisma.$transaction(
      invalid.map(({ id, reason }) =>
        prisma.order.update({ where: { id }, data: { basStatus: "ERROR", basError: reason } })
      )
    );
  }

  if (sendable.length === 0) {
    return { xml: "", sentCount: 0, skippedCount: invalid.length };
  }

  await prisma.order.updateMany({
    where: { id: { in: sendable.map((o) => o.id) } },
    data: { basStatus: "SENDING", basSentAt: new Date(), basError: null },
  });

  return { xml: buildOrdersXml(sendable), sentCount: sendable.length, skippedCount: invalid.length };
}

export async function confirmSuccess(): Promise<number> {
  const result = await prisma.order.updateMany({
    where: { basStatus: "SENDING" },
    data: { basStatus: "SENT_TO_BAS", basConfirmedAt: new Date() },
  });
  return result.count;
}

// Exported for the parse side of the (currently unused) reverse channel /
// for tests that want to sanity-check XML round-trips.
export const xmlParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
