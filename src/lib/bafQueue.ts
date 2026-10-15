// BAF runs on an office computer and takes orders only while it is on, so
// orders can wait on the site for hours. This tells how many wait and when
// BAF was last seen, and reminds the Telegram admins when the wait is long.

import { prisma } from "@/lib/prisma";
import { botConfigured, notifyAdmins } from "@/lib/telegram";

const HOUR = 3600_000;
const WAIT_HOURS = Number(process.env.BAF_WAIT_ALERT_HOURS || 4);
const ALERT_KEY = "bafQueueAlertAt";

const waitingWhere = { basStatus: { in: ["NEW", "SENDING"] as ("NEW" | "SENDING")[] }, status: { not: "CANCELLED" as const } };

export async function bafQueueState() {
  const [waiting, oldest, lastSeen] = await Promise.all([
    prisma.order.count({ where: waitingWhere }),
    prisma.order.findFirst({ where: waitingWhere, orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
    prisma.exchangeLog.findFirst({ where: { ok: true }, orderBy: { at: "desc" }, select: { at: true } }),
  ]);
  return { waiting, oldestAt: oldest?.createdAt ?? null, lastExchangeAt: lastSeen?.at ?? null };
}

export function hoursAgo(d: Date | string | null) {
  return d ? (Date.now() - new Date(d).getTime()) / HOUR : Infinity;
}

function kyivHour() {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Kyiv", hour: "2-digit", hour12: false }).format(new Date()));
}

function when(d: Date | null) {
  if (!d) return "ще не було";
  return d.toLocaleString("uk-UA", { timeZone: "Europe/Kyiv", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/**
 * Sends "orders wait for BAF" when the oldest waiting order and the last
 * exchange are both older than WAIT_HOURS. At most once per WAIT_HOURS, not
 * at night. Called on new orders, admin pages and the daily cron; never throws.
 */
export async function maybeAlertBafQueue() {
  if (!botConfigured()) return;
  try {
    const h = kyivHour();
    if (h < 7 || h >= 21) return;
    const s = await bafQueueState();
    if (!s.waiting || hoursAgo(s.oldestAt) < WAIT_HOURS || hoursAgo(s.lastExchangeAt) < WAIT_HOURS) return;
    const last = await prisma.appState.findUnique({ where: { key: ALERT_KEY } });
    if (last && hoursAgo(new Date(last.value)) < WAIT_HOURS) return;
    await prisma.appState.upsert({
      where: { key: ALERT_KEY },
      create: { key: ALERT_KEY, value: new Date().toISOString() },
      update: { value: new Date().toISOString() },
    });
    const waitH = Math.floor(hoursAgo(s.oldestAt));
    await notifyAdmins(
      `⏳ <b>${s.waiting} замовл. чекають BAF</b>, найстаріше — ${waitH} год.\nОстанній обмін: ${when(s.lastExchangeAt)}.\n\nУвімкніть комп'ютер з BAF і запустіть обмін.`
    );
  } catch (e) {
    console.error("[baf-queue] alert failed:", e);
  }
}
