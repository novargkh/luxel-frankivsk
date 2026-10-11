export type PromoValidationResult = { ok: true } | { ok: false; error: string };

export function validatePromoCode(
  promo: { isActive: boolean; expiresAt: Date | null; usageLimit: number | null },
  usedCount: number
): PromoValidationResult {
  if (!promo.isActive) {
    return { ok: false, error: "Промокод неактивний" };
  }
  if (promo.expiresAt && promo.expiresAt.getTime() < Date.now()) {
    return { ok: false, error: "Термін дії промокоду закінчився" };
  }
  if (promo.usageLimit != null && usedCount >= promo.usageLimit) {
    return { ok: false, error: "Ліміт використань промокоду вичерпано" };
  }
  return { ok: true };
}

export function computeDiscount(
  promo: { type: "PERCENT" | "FIXED"; value: number },
  subtotal: number
): number {
  if (subtotal <= 0) return 0;
  if (promo.type === "PERCENT") {
    return Math.round(subtotal * (promo.value / 100) * 100) / 100;
  }
  return Math.min(promo.value, subtotal);
}
