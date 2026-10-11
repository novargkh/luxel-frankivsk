// Parses the admin promo form (admin/promocodes) into PromoCode data.
// Returns an error message for the admin instead of data when invalid.

export type PromoInput = {
  name?: string | null;
  code?: string;
  type?: "PERCENT" | "FIXED";
  value?: number | string;
  minTotal?: number | string | null;
  productIds?: string[];
  categories?: string[];
  startsAt?: string | null;
  expiresAt?: string | null;
  usageLimit?: number | string | null;
  perClientLimit?: number | string | null;
  isActive?: boolean;
  description?: string | null;
  showToClients?: boolean;
  clientIds?: string[];
};

const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));
const intOrNull = (v: unknown) => {
  const n = num(v);
  // 0 means "no limit", like OpenCart.
  return n && n > 0 ? Math.floor(n) : null;
};
const date = (v: unknown) => (v ? new Date(String(v)) : null);

export function parsePromoInput(body: PromoInput, creating: boolean) {
  const data: Record<string, unknown> = {};

  if (body.code !== undefined || creating) {
    const code = (body.code ?? "").trim().toUpperCase();
    if (!code) return { error: "Вкажіть код" };
    if (!/^[A-Z0-9А-ЯІЇЄҐ_-]{3,32}$/.test(code)) {
      return { error: "Код: 3–32 символи, літери, цифри, «-» або «_», без пробілів" };
    }
    data.code = code;
  }
  if (body.type !== undefined || creating) {
    if (body.type !== "PERCENT" && body.type !== "FIXED") return { error: "Оберіть тип знижки" };
    data.type = body.type;
  }
  if (body.value !== undefined || creating) {
    const v = num(body.value);
    if (v == null || !(v > 0)) return { error: "Вкажіть розмір знижки" };
    if ((body.type ?? "PERCENT") === "PERCENT" && v > 100) return { error: "Відсоток не може бути більше 100" };
    data.value = v;
  }
  if (body.name !== undefined) data.name = body.name?.trim() || null;
  if (body.minTotal !== undefined) {
    const m = num(body.minTotal);
    data.minTotal = m && m > 0 ? m : null;
  }
  if (body.categories !== undefined) data.categories = [...new Set(body.categories.filter(Boolean))];
  if (body.startsAt !== undefined) data.startsAt = date(body.startsAt);
  if (body.expiresAt !== undefined) data.expiresAt = date(body.expiresAt);
  if (body.usageLimit !== undefined) data.usageLimit = intOrNull(body.usageLimit);
  if (body.perClientLimit !== undefined) data.perClientLimit = intOrNull(body.perClientLimit);
  if (body.isActive !== undefined) data.isActive = !!body.isActive;
  if (body.description !== undefined) data.description = body.description?.trim() || null;
  if (body.showToClients !== undefined) data.showToClients = !!body.showToClients;

  const s = data.startsAt as Date | null | undefined;
  const e = data.expiresAt as Date | null | undefined;
  if (s && e && s > e) return { error: "Дата початку пізніше за дату завершення" };

  if (body.productIds !== undefined) {
    const ids = [...new Set(body.productIds)].map((id) => ({ id }));
    data.products = creating ? { connect: ids } : { set: ids };
  }
  if (body.clientIds !== undefined) {
    const ids = [...new Set(body.clientIds)].map((id) => ({ id }));
    data.clients = creating ? { connect: ids } : { set: ids };
  }
  return { data };
}
