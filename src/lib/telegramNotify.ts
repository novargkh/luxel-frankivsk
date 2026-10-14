// Event notices for the linked admin chats. Each one never throws: Telegram
// being down must not break placing an order or the BAF exchange.

import { prisma } from "@/lib/prisma";
import { botConfigured, esc, notifyAdmins, notifyAdminsPhoto, type Keyboard } from "@/lib/telegram";
import { money, orderTotal } from "@/lib/adminOrders";
import { orderNumbers, returnNumbers } from "@/lib/docNumber";
import { kpiCaption } from "@/lib/telegramBot";

function adminLink(path: string): Keyboard {
  const site = process.env.NEXTAUTH_URL || process.env.AUTH_URL;
  return site?.startsWith("https://") ? [[{ text: "Відкрити в адмінці", url: `${site.replace(/\/$/, "")}${path}` }]] : [];
}

async function safe(what: string, fn: () => Promise<unknown>) {
  if (!botConfigured()) return;
  try {
    await fn();
  } catch (e) {
    console.error(`[telegram] ${what} notice failed:`, e);
  }
}

export function notifyNewOrder(orderId: string) {
  return safe("order", async () => {
    const o = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        user: { select: { name: true, company: true } },
        shop: { select: { name: true } },
        items: { select: { quantity: true, priceAtOrder: true } },
      },
    });
    if (!o) return;
    const num = (await orderNumbers([o])).get(o.id) ?? String(o.orderNumber);
    const text = [
      `🆕 <b>Нове замовлення № ${esc(num)}</b>`,
      `👤 ${esc(o.user.company || o.user.name)}${o.shop ? ` · ${esc(o.shop.name)}` : ""}`,
      `${o.items.length} поз. · <b>${money(orderTotal(o))}</b>`,
      o.comment ? `💬 ${esc(o.comment)}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    await notifyAdmins(text, [[{ text: "Відкрити", data: `o:${o.id}` }]]);
  });
}

export function notifyReturn(returnId: string) {
  return safe("return", async () => {
    const r = await prisma.returnRequest.findUnique({
      where: { id: returnId },
      include: { user: { select: { name: true, company: true } }, _count: { select: { items: true } } },
    });
    if (!r) return;
    const num = (await returnNumbers([r])).get(r.id) ?? "";
    const text = `↩️ <b>Заявка на повернення${num ? ` № ${esc(num)}` : ""}</b>\n👤 ${esc(r.user.company || r.user.name)} · ${r._count.items} поз.\nПричина: ${esc(r.reason)}`;
    await notifyAdmins(text, adminLink("/admin/returns"));
  });
}

export function notifyProfileRequest(requestId: string) {
  return safe("profile", async () => {
    const r = await prisma.profileRequest.findUnique({
      where: { id: requestId },
      include: { user: { select: { id: true, name: true, company: true } } },
    });
    if (!r) return;
    const text = `✏️ <b>${esc(r.user.company || r.user.name)}</b> просить змінити дані:\n${esc(r.message)}`;
    await notifyAdmins(text, adminLink(`/admin/clients/${r.user.id}`));
  });
}

export function notifyKpiPhoto(entryId: string) {
  return safe("kpi", async () => {
    const photo = await prisma.challengePhoto.findFirst({
      where: { entryId },
      orderBy: { createdAt: "asc" },
      select: { mime: true, data: true },
    });
    const c = await kpiCaption(entryId);
    if (!photo || !c) return;
    await notifyAdminsPhoto(photo, `Нове фото на перевірку\n${c.caption}`, c.kb);
  });
}

/** At most one notice per 30 minutes, so a broken exchange doesn't flood the chat. */
export function notifyExchangeError(logId: string, type: string | null, mode: string | null, answer: string) {
  return safe("exchange", async () => {
    const earlier = await prisma.exchangeLog.findFirst({
      where: { id: { not: logId }, ok: false, status: { not: 0 }, at: { gte: new Date(Date.now() - 30 * 60_000) } },
      select: { id: true },
    });
    if (earlier) return;
    const what = type === "sale" ? "замовлення" : type === "catalog" ? "товари" : type ?? "?";
    const text = `⚠️ <b>Помилка обміну з BAF</b> (${esc(what)}, ${esc(mode ?? "?")})\n${esc(answer.replace(/^failure\n?/, "").slice(0, 300))}\n\nПодробиці: адмін-панель → Обмін з BAF.`;
    await notifyAdmins(text, adminLink("/admin/exchange"));
  });
}
