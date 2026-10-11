// Human-friendly document numbers in which the date can be read directly:
// "11.10.25-3" = the 3rd order (or return) placed on 11 October 2025,
// counted across the whole portal in Kyiv time. They are derived from
// creation time, so no database column is needed and old documents get
// numbers too.

import { prisma } from "@/lib/prisma";

const TZ = "Europe/Kyiv";

/** "2025-10-11" for a moment in Kyiv time. */
export function kyivDayKey(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export function formatDocNumber(dayKey: string, seq: number): string {
  const [y, m, d] = dayKey.split("-");
  return `${d}.${m}.${y.slice(2)}-${seq}`;
}

/**
 * Given rows with id + createdAt (all rows of that kind that exist on the
 * relevant days), returns id -> number, numbering within each Kyiv day by
 * creation time.
 */
export function numberByDay(rows: { id: string; createdAt: Date }[]): Map<string, string> {
  const sorted = [...rows].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id)
  );
  const counters = new Map<string, number>();
  const out = new Map<string, string>();
  for (const r of sorted) {
    const key = kyivDayKey(r.createdAt);
    const seq = (counters.get(key) ?? 0) + 1;
    counters.set(key, seq);
    out.set(r.id, formatDocNumber(key, seq));
  }
  return out;
}

// Window that safely covers whole Kyiv days around the given dates.
function dayWindow(dates: Date[]) {
  const min = Math.min(...dates.map((d) => d.getTime()));
  const max = Math.max(...dates.map((d) => d.getTime()));
  const DAY = 24 * 60 * 60 * 1000;
  return { gte: new Date(min - DAY), lte: new Date(max + DAY) };
}

/** Numbers for the given orders (counting all clients' orders per day). */
export async function orderNumbers(orders: { createdAt: Date }[]): Promise<Map<string, string>> {
  if (orders.length === 0) return new Map();
  const all = await prisma.order.findMany({
    where: { createdAt: dayWindow(orders.map((o) => o.createdAt)) },
    select: { id: true, createdAt: true },
  });
  return numberByDay(all);
}

/** Numbers for the given return requests (counting all per day). */
export async function returnNumbers(rows: { createdAt: Date }[]): Promise<Map<string, string>> {
  if (rows.length === 0) return new Map();
  const all = await prisma.returnRequest.findMany({
    where: { createdAt: dayWindow(rows.map((r) => r.createdAt)) },
    select: { id: true, createdAt: true },
  });
  return numberByDay(all);
}
