// Shared bits for the admin order screens (/admin, /admin/orders): Kyiv
// day ranges, order totals, labels. No server imports: the pages use it too.

/** "2025-10-11" for a moment in Kyiv time (same as docNumber.kyivDayKey). */
export function kyivDayKey(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Kyiv",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

const DAY = 24 * 60 * 60 * 1000;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isDayKey(s: string | null | undefined): s is string {
  return !!s && DAY_RE.test(s);
}

/** Today in Kyiv as "YYYY-MM-DD". */
export function todayKey(): string {
  return kyivDayKey(new Date());
}

/** "YYYY-MM-DD" shifted by n days (calendar arithmetic, no time zone). */
export function addDays(key: string, n: number): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/**
 * A UTC window that surely covers the Kyiv days from..to (one spare day on
 * each side); rows are then kept by their exact Kyiv day with `inDays`.
 */
export function windowFor(from: string, to: string) {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  return {
    gte: new Date(Date.UTC(fy, fm - 1, fd) - DAY),
    lte: new Date(Date.UTC(ty, tm - 1, td) + 2 * DAY),
  };
}

export function inDays(d: Date, from: string, to: string) {
  const k = kyivDayKey(d);
  return k >= from && k <= to;
}

export type OrderLine = { quantity: number; priceAtOrder: number };

export function orderSubtotal(items: OrderLine[]) {
  return Math.round(items.reduce((s, i) => s + i.quantity * i.priceAtOrder, 0) * 100) / 100;
}

export function orderTotal(o: { items: OrderLine[]; discountAmount: number }) {
  return Math.max(0, Math.round((orderSubtotal(o.items) - (o.discountAmount || 0)) * 100) / 100);
}

export const ORDER_STATUSES = ["NEW", "CONFIRMED", "SHIPPED", "CANCELLED"] as const;
export type AdminOrderStatus = (typeof ORDER_STATUSES)[number];

export const STATUS_LABEL: Record<AdminOrderStatus, string> = {
  NEW: "Нове",
  CONFIRMED: "Підтверджене",
  SHIPPED: "Відвантажене",
  CANCELLED: "Скасоване",
};

export const BAS_LABEL: Record<string, string> = {
  NEW: "Чекає обміну",
  SENDING: "Передається",
  SENT_TO_BAS: "У BAF",
  ERROR: "Помилка обміну",
};

export function money(n: number) {
  return `${n.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₴`;
}

export function kyivDateTime(d: string | Date) {
  return new Date(d).toLocaleString("uk-UA", {
    timeZone: "Europe/Kyiv",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export const STATUS_STYLE: Record<AdminOrderStatus, string> = {
  NEW: "bg-red-50 text-red-700 ring-red-200",
  CONFIRMED: "bg-blue-50 text-blue-700 ring-blue-200",
  SHIPPED: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  CANCELLED: "bg-slate-100 text-slate-500 ring-slate-200",
};

export const BAS_STYLE: Record<string, string> = {
  NEW: "text-slate-500",
  SENDING: "text-amber-600",
  SENT_TO_BAS: "text-emerald-600",
  ERROR: "text-red-600 font-medium",
};
