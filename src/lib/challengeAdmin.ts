// Parses the admin task form into Challenge data (or an error message).

export type ChallengeInput = {
  title?: string;
  description?: string | null;
  kind?: "PHOTO" | "ORDER_PRODUCTS" | "ORDER_TOTAL";
  productIds?: string[];
  minQty?: number | string;
  minTotal?: number | string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  isActive?: boolean;
  autoApprove?: boolean;
  maxPerClient?: number | string;
  rewardTemplateId?: string | null;
  rewardValidDays?: number | string | null;
};

const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));

export function parseChallengeInput(b: ChallengeInput, creating: boolean) {
  const d: Record<string, unknown> = {};
  if (b.title !== undefined || creating) {
    const t = (b.title ?? "").trim();
    if (!t) return { error: "Вкажіть назву завдання" };
    d.title = t.slice(0, 200);
  }
  if (b.description !== undefined) d.description = b.description?.trim() || null;
  if (b.kind !== undefined || creating) {
    if (!["PHOTO", "ORDER_PRODUCTS", "ORDER_TOTAL"].includes(b.kind ?? "")) return { error: "Оберіть тип завдання" };
    d.kind = b.kind;
  }
  if (b.minQty !== undefined) d.minQty = Math.max(1, Math.floor(num(b.minQty) ?? 1));
  if (b.minTotal !== undefined) {
    const m = num(b.minTotal);
    d.minTotal = m && m > 0 ? m : null;
  }
  if (b.startsAt !== undefined) d.startsAt = b.startsAt ? new Date(b.startsAt) : null;
  if (b.endsAt !== undefined) d.endsAt = b.endsAt ? new Date(b.endsAt) : null;
  if (b.isActive !== undefined) d.isActive = !!b.isActive;
  if (b.autoApprove !== undefined) d.autoApprove = !!b.autoApprove;
  if (b.maxPerClient !== undefined) d.maxPerClient = Math.max(1, Math.floor(num(b.maxPerClient) ?? 1));
  if (b.rewardValidDays !== undefined) {
    const n = num(b.rewardValidDays);
    d.rewardValidDays = n && n > 0 ? Math.floor(n) : null;
  }
  if (b.rewardTemplateId !== undefined) {
    d.rewardTemplate = b.rewardTemplateId ? { connect: { id: b.rewardTemplateId } } : creating ? undefined : { disconnect: true };
  }
  if (b.productIds !== undefined) {
    const ids = [...new Set(b.productIds)].map((id) => ({ id }));
    d.products = creating ? { connect: ids } : { set: ids };
  }
  const kind = (b.kind ?? d.kind) as string | undefined;
  if (kind === "ORDER_PRODUCTS" && b.productIds !== undefined && b.productIds.length === 0) {
    return { error: "Оберіть товари, які треба замовити" };
  }
  if (kind === "ORDER_TOTAL" && (b.minTotal !== undefined || creating) && !d.minTotal) {
    return { error: "Вкажіть суму замовлення" };
  }
  const s = d.startsAt as Date | null | undefined;
  const e = d.endsAt as Date | null | undefined;
  if (s && e && s > e) return { error: "Дата початку пізніше за дату завершення" };
  return { data: d };
}
