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

// A code handed to specific clients can only be applied by those clients.
// Codes with no assigned clients stay usable by anyone who knows them.
export function validatePromoForUser(
  promo: { clients: { id: string }[] },
  userId: string
): PromoValidationResult {
  if (promo.clients.length > 0 && !promo.clients.some((c) => c.id === userId)) {
    return { ok: false, error: "Промокод не знайдено" };
  }
  return { ok: true };
}

// Prisma filter for the codes a client sees in "Доступні промокоди":
// shown to clients, and either handed to nobody in particular (= everyone)
// or handed to this client.
export function promoVisibleToClient(userId: string) {
  return {
    showToClients: true,
    OR: [{ clients: { none: {} } }, { clients: { some: { id: userId } } }],
  };
}

export type PromoStatus = "ACTIVE" | "DISABLED" | "EXPIRED" | "USED_UP";

export function promoStatus(
  promo: { isActive: boolean; expiresAt: Date | null; usageLimit: number | null },
  usedCount: number
): PromoStatus {
  if (!promo.isActive) return "DISABLED";
  if (promo.expiresAt && promo.expiresAt.getTime() < Date.now()) return "EXPIRED";
  if (promo.usageLimit != null && usedCount >= promo.usageLimit) return "USED_UP";
  return "ACTIVE";
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
