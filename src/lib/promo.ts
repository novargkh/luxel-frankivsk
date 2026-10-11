import { normalizeCategory } from "@/lib/categorize";

// Promo code rules (admin/promocodes), modelled on OpenCart coupons:
// percent or fixed discount, optional minimum order total, optional list of
// products and/or categories the discount applies to, start / end dates,
// a total usage limit and a per-client limit.

export type PromoRules = {
  isActive: boolean;
  type: "PERCENT" | "FIXED";
  value: number;
  startsAt: Date | null;
  expiresAt: Date | null;
  usageLimit: number | null;
  perClientLimit?: number | null;
  minTotal?: number | null;
  categories?: string[];
  products?: { id: string }[];
};

export type PromoLine = { productId: string; category: string | null; price: number; quantity: number };

export type PromoValidationResult = { ok: true } | { ok: false; error: string };

const DAY = 86_400_000;

// The end date is inclusive: a code "до 31.10" works all of 31 October.
export function isExpired(expiresAt: Date | null, now = Date.now()) {
  return !!expiresAt && expiresAt.getTime() + DAY <= now;
}

export function notStarted(startsAt: Date | null, now = Date.now()) {
  return !!startsAt && startsAt.getTime() > now;
}

// Code-level checks (no cart needed): on/off, dates, usage limits.
export function validatePromoCode(
  promo: Pick<PromoRules, "isActive" | "startsAt" | "expiresAt" | "usageLimit" | "perClientLimit">,
  usedCount: number,
  usedByClient = 0
): PromoValidationResult {
  if (!promo.isActive) return { ok: false, error: "Промокод неактивний" };
  if (notStarted(promo.startsAt)) {
    return {
      ok: false,
      error: `Промокод діє з ${promo.startsAt!.toLocaleDateString("uk-UA", { timeZone: "Europe/Kyiv" })}`,
    };
  }
  if (isExpired(promo.expiresAt)) return { ok: false, error: "Термін дії промокоду закінчився" };
  if (promo.usageLimit != null && usedCount >= promo.usageLimit) {
    return { ok: false, error: "Ліміт використань промокоду вичерпано" };
  }
  if (promo.perClientLimit != null && usedByClient >= promo.perClientLimit) {
    return { ok: false, error: "Ви вже використали цей промокод максимальну кількість разів" };
  }
  return { ok: true };
}

// Which cart lines the code applies to. No products and no categories set =
// every line.
export function eligibleLines<T extends PromoLine>(promo: Pick<PromoRules, "products" | "categories">, lines: T[]) {
  const ids = new Set((promo.products ?? []).map((p) => p.id));
  const cats = new Set(promo.categories ?? []);
  if (ids.size === 0 && cats.size === 0) return lines;
  return lines.filter((l) => ids.has(l.productId) || cats.has(normalizeCategory(l.category)));
}

export function computeDiscount(promo: Pick<PromoRules, "type" | "value">, eligibleSubtotal: number): number {
  if (eligibleSubtotal <= 0) return 0;
  if (promo.type === "PERCENT") {
    return Math.round(eligibleSubtotal * (promo.value / 100) * 100) / 100;
  }
  return Math.min(promo.value, eligibleSubtotal);
}

// Everything at once for a cart: the checks, the lines it covers and the
// discount. Used by the cart check and by order placement.
export function evaluatePromo<T extends PromoLine>(
  promo: PromoRules,
  lines: T[],
  usedCount: number,
  usedByClient: number
):
  | { ok: true; discount: number; eligibleIds: string[]; partial: boolean }
  | { ok: false; error: string } {
  const check = validatePromoCode(promo, usedCount, usedByClient);
  if (!check.ok) return check;

  const subtotal = lines.reduce((s, l) => s + l.price * l.quantity, 0);
  if (promo.minTotal && subtotal < promo.minTotal) {
    return {
      ok: false,
      error: `Промокод діє від суми ${promo.minTotal.toLocaleString("uk-UA")} ₴ (зараз ${subtotal.toLocaleString("uk-UA")} ₴)`,
    };
  }
  const eligible = eligibleLines(promo, lines);
  if (eligible.length === 0) {
    return { ok: false, error: "Промокод не діє на товари у вашому кошику" };
  }
  const eligibleSubtotal = eligible.reduce((s, l) => s + l.price * l.quantity, 0);
  return {
    ok: true,
    discount: computeDiscount(promo, eligibleSubtotal),
    eligibleIds: eligible.map((l) => l.productId),
    partial: eligible.length < lines.length,
  };
}
