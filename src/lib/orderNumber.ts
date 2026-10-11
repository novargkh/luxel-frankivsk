// Human-friendly order numbers: the order date plus the client's running
// number for that day, e.g. "11.10.25-2" = the client's second order on
// 11 October 2025. Days follow Kyiv time. The number is derived (not
// stored), so it is the same for the client and for the admin.

const TZ = "Europe/Kyiv";

const dayKeyFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const labelFmt = new Intl.DateTimeFormat("uk-UA", {
  timeZone: TZ,
  day: "2-digit",
  month: "2-digit",
  year: "2-digit",
});

export function orderDayKey(date: Date): string {
  return dayKeyFmt.format(date); // YYYY-MM-DD in Kyiv time
}

export function formatOrderNumber(date: Date, seq: number): string {
  return `${labelFmt.format(date)}-${seq}`;
}

// Adds `displayNumber` to every order. Expects all of a client's orders for
// the days involved to be present (true for both the client's and the
// admin's order lists, which load everything).
export function withDisplayNumbers<
  T extends { userId: string; createdAt: Date; orderNumber: number },
>(orders: T[]): (T & { displayNumber: string })[] {
  const sorted = [...orders].sort((a, b) => a.orderNumber - b.orderNumber);
  const counters = new Map<string, number>();
  const numbers = new Map<number, string>();
  for (const o of sorted) {
    const key = `${o.userId}|${orderDayKey(o.createdAt)}`;
    const seq = (counters.get(key) ?? 0) + 1;
    counters.set(key, seq);
    numbers.set(o.orderNumber, formatOrderNumber(o.createdAt, seq));
  }
  return orders.map((o) => ({ ...o, displayNumber: numbers.get(o.orderNumber)! }));
}
