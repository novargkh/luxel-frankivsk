// The admin Telegram bot: orders, availability, photo-KPI review and promo
// codes for the people linked in /admin/telegram (at most MAX_LINKS chats).
// Telegram calls /api/telegram/webhook, which passes every update here.

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { MAX_LINKS, editText, esc, sendPhoto, sendText, tg, type Keyboard } from "@/lib/telegram";
import { BAS_LABEL, STATUS_LABEL, kyivDateTime, money, orderTotal, type AdminOrderStatus } from "@/lib/adminOrders";
import { orderNumbers } from "@/lib/docNumber";
import { AVAILABILITY_LABEL, autoAvailability, availabilityOf, type Availability } from "@/lib/availability";
import { approveEntry, issuePersonalCode } from "@/lib/challenges";

type TgUser = { id: number; first_name?: string; last_name?: string; username?: string };
type TgMessage = { message_id: number; chat: { id: number; type?: string }; from?: TgUser; text?: string };
export type Update = {
  update_id: number;
  message?: TgMessage;
  callback_query?: { id: string; from: TgUser; data?: string; message?: TgMessage };
};

type State = { m: "stock" } | { m: "promo" } | { m: "reject"; id: string; msg?: number } | null;
type Link = { id: string; chatId: string; state: State };

const DAY = 86_400_000;

export async function handleUpdate(u: Update) {
  if (u.callback_query) return onCallback(u.callback_query);
  if (u.message?.text) return onMessage(u.message);
}

async function linkFor(chatId: string): Promise<Link | null> {
  const l = await prisma.telegramLink.findUnique({ where: { chatId }, select: { id: true, chatId: true, state: true } });
  return l ? { id: l.id, chatId: l.chatId!, state: (l.state as State) ?? null } : null;
}

async function setState(link: Link, state: State) {
  await prisma.telegramLink.update({ where: { id: link.id }, data: { state: state ?? Prisma.DbNull } });
}

// ── messages ───────────────────────────────────────────────────────────

async function onMessage(msg: TgMessage) {
  const chatId = String(msg.chat.id);
  const text = (msg.text ?? "").trim();

  if (text.startsWith("/start")) {
    const code = text.slice(6).trim();
    if (code) return linkChat(chatId, code, msg.from);
  }

  const link = await linkFor(chatId);
  if (!link) {
    return sendText(
      chatId,
      "Цей бот лише для адміністраторів LUXEL. Підключення: адмін-панель → Telegram → «Підключити мій Telegram»."
    );
  }

  if (text === "/start" || text === "/menu") {
    await setState(link, null);
    return sendText(chatId, "Оберіть розділ 👇", "menu");
  }
  if (text === "📦 Замовлення") {
    await setState(link, null);
    return listOrders(chatId);
  }
  if (text === "📊 Наявність") {
    await setState(link, { m: "stock" });
    return sendText(chatId, "Напишіть назву або артикул товару.");
  }
  if (text === "📸 Фото-KPI") {
    await setState(link, null);
    return listKpi(chatId);
  }
  if (text === "🎟 Промокод") {
    await setState(link, { m: "promo" });
    return sendText(chatId, "Кому видати промокод? Напишіть назву клієнта, телефон або ЄДРПОУ.");
  }

  const st = link.state;
  if (st?.m === "stock") return searchProducts(chatId, text);
  if (st?.m === "promo") return searchClients(chatId, text);
  if (st?.m === "reject") {
    await setState(link, null);
    return rejectEntry(chatId, st.id, text === "-" ? null : text, st.msg);
  }
  return sendText(chatId, "Оберіть розділ у меню 👇", "menu");
}

async function linkChat(chatId: string, code: string, from?: TgUser) {
  const already = await linkFor(chatId);
  if (already) {
    await prisma.telegramLink.deleteMany({ where: { code, chatId: null } });
    return sendText(chatId, "Цей Telegram уже підключено ✅", "menu");
  }
  const row = await prisma.telegramLink.findUnique({ where: { code } });
  if (!row || row.chatId || !row.codeUntil || row.codeUntil < new Date()) {
    return sendText(chatId, "Посилання недійсне або застаріло. Створіть нове в адмін-панелі → Telegram.");
  }
  const linked = await prisma.telegramLink.count({ where: { chatId: { not: null } } });
  if (linked >= MAX_LINKS) {
    return sendText(chatId, `До бота вже підключено ${MAX_LINKS} особи — більше не можна. Відключіть когось в адмін-панелі.`);
  }
  const name = [from?.first_name, from?.last_name].filter(Boolean).join(" ") || from?.username || null;
  await prisma.telegramLink.update({
    where: { id: row.id },
    data: { chatId, tgName: name, linkedAt: new Date(), code: null, codeUntil: null },
  });
  return sendText(
    chatId,
    "Готово ✅ Тепер сюди приходитимуть нові замовлення, повернення, фото-KPI та помилки обміну з BAF.\n\nОберіть розділ 👇",
    "menu"
  );
}

// ── callbacks ──────────────────────────────────────────────────────────

async function onCallback(q: NonNullable<Update["callback_query"]>) {
  const chatId = String(q.message?.chat.id ?? q.from.id);
  const msgId = q.message?.message_id;
  const link = await linkFor(chatId);
  if (!link) {
    return tg("answerCallbackQuery", { callback_query_id: q.id, text: "Немає доступу", show_alert: true });
  }
  const [kind, a, b] = (q.data ?? "").split(":");
  let toast = "";
  try {
    switch (kind) {
      case "ol":
        await listOrders(chatId, msgId);
        break;
      case "o":
        await showOrder(chatId, a, msgId);
        break;
      case "os":
        toast = await setOrderStatus(chatId, a, b, msgId);
        break;
      case "p":
        await showProduct(chatId, a, msgId);
        break;
      case "pa":
        toast = await setAvailability(chatId, a, b, msgId);
        break;
      case "ka":
        await approve(chatId, a, msgId);
        break;
      case "kr":
        await setState(link, { m: "reject", id: a, msg: msgId });
        await sendText(chatId, "Напишіть причину відмови — її побачить клієнт. Або «-», щоб без причини.");
        break;
      case "kp":
        await morePhotos(chatId, a);
        break;
      case "c":
        await pickTemplate(chatId, a, msgId);
        break;
      case "pt":
        await confirmPromo(chatId, a, b, msgId);
        break;
      case "pi":
        await issuePromo(chatId, a, b, msgId);
        break;
      case "x":
        if (msgId) await editText(chatId, msgId, "Скасовано.");
        break;
    }
  } catch (e) {
    console.error("[telegram] callback failed:", e);
    toast = e instanceof Error ? e.message.slice(0, 180) : "Помилка";
  }
  await tg("answerCallbackQuery", { callback_query_id: q.id, ...(toast ? { text: toast } : {}) }).catch(() => {});
}

// ── orders ─────────────────────────────────────────────────────────────

const STATUS_BUTTON: Record<string, { status: AdminOrderStatus; label: string }> = {
  C: { status: "CONFIRMED", label: "✅ Підтвердити" },
  S: { status: "SHIPPED", label: "🚚 Відвантажено" },
  X: { status: "CANCELLED", label: "✖️ Скасувати" },
  N: { status: "NEW", label: "↩️ Повернути в «Нове»" },
};

async function listOrders(chatId: string, msgId?: number) {
  const orders = await prisma.order.findMany({
    where: { createdAt: { gte: new Date(Date.now() - 7 * DAY) }, status: { not: "CANCELLED" } },
    orderBy: { createdAt: "desc" },
    take: 12,
    include: { user: { select: { name: true, company: true } }, items: { select: { quantity: true, priceAtOrder: true } } },
  });
  const nums = await orderNumbers(orders);
  const text = orders.length
    ? `<b>Замовлення за 7 днів</b> (${orders.length}${orders.length === 12 ? "+" : ""}). Натисніть, щоб відкрити:`
    : "За останні 7 днів замовлень немає.";
  const kb: Keyboard = orders.map((o) => [
    {
      text: `${o.status === "NEW" ? "🆕 " : ""}${nums.get(o.id) ?? o.orderNumber} · ${o.user.company || o.user.name} · ${money(orderTotal(o))}`,
      data: `o:${o.id}`,
    },
  ]);
  return msgId ? editText(chatId, msgId, text, kb) : sendText(chatId, text, kb);
}

async function orderCard(id: string) {
  const o = await prisma.order.findUnique({
    where: { id },
    include: {
      user: { select: { name: true, company: true, phone: true } },
      shop: { select: { name: true, address: true } },
      promoCode: { select: { code: true } },
      items: { orderBy: { id: "asc" }, include: { product: { select: { name: true } } } },
    },
  });
  if (!o) throw new Error("Замовлення не знайдено");
  const num = (await orderNumbers([o])).get(o.id) ?? String(o.orderNumber);
  const lines = o.items.slice(0, 25).map((i) => `• ${esc(i.product.name)} × ${i.quantity} = ${money(i.priceAtOrder * i.quantity)}`);
  if (o.items.length > 25) lines.push(`…ще ${o.items.length - 25} поз.`);
  const text = [
    `<b>Замовлення № ${esc(num)}</b> · ${STATUS_LABEL[o.status as AdminOrderStatus] ?? o.status}`,
    kyivDateTime(o.createdAt),
    `👤 ${esc(o.user.company || o.user.name)}${o.user.phone ? `, ${esc(o.user.phone)}` : ""}`,
    o.shop ? `📍 ${esc(o.shop.name)} — ${esc(o.shop.address)}` : "",
    o.comment ? `💬 ${esc(o.comment)}` : "",
    "",
    ...lines,
    o.discountAmount ? `Промокод ${esc(o.promoCode?.code ?? "")}: −${money(o.discountAmount)}` : "",
    `<b>Разом: ${money(orderTotal(o))}</b>`,
    `BAF: ${BAS_LABEL[o.basStatus] ?? o.basStatus}${o.basError ? ` — ${esc(o.basError)}` : ""}`,
  ]
    .filter((l) => l !== "")
    .join("\n");
  const buttons = Object.entries(STATUS_BUTTON)
    .filter(([, s]) => s.status !== o.status && !(s.status === "NEW" && o.status !== "CANCELLED"))
    .map(([k, s]) => ({ text: s.label, data: `os:${o.id}:${k}` }));
  const kb: Keyboard = [buttons.slice(0, 2), buttons.slice(2), [{ text: "« До списку", data: "ol" }]].filter((r) => r.length);
  const site = process.env.NEXTAUTH_URL || process.env.AUTH_URL;
  if (site?.startsWith("https://")) kb.push([{ text: "Відкрити в адмінці", url: `${site.replace(/\/$/, "")}/admin/orders?open=${o.id}` }]);
  return { text, kb };
}

async function showOrder(chatId: string, id: string, msgId?: number) {
  const { text, kb } = await orderCard(id);
  return msgId ? editText(chatId, msgId, text, kb) : sendText(chatId, text, kb);
}

async function setOrderStatus(chatId: string, id: string, key: string, msgId?: number) {
  const s = STATUS_BUTTON[key.replace("!", "")];
  if (!s) return "";
  // Cancelling asks once more.
  if (s.status === "CANCELLED" && !key.endsWith("!")) {
    const kb: Keyboard = [[{ text: "Так, скасувати", data: `os:${id}:X!` }, { text: "Ні", data: `o:${id}` }]];
    if (msgId) await editText(chatId, msgId, "Скасувати це замовлення? Клієнт побачить статус «Скасоване».", kb);
    return "";
  }
  // Like the admin editor: a changed order goes to BAF again.
  await prisma.order.update({ where: { id }, data: { status: s.status, basStatus: "NEW", basError: null } });
  await showOrder(chatId, id, msgId);
  return `Статус: ${STATUS_LABEL[s.status]}`;
}

// ── availability ───────────────────────────────────────────────────────

function words(q: string) {
  return q
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 2)
    .slice(0, 5);
}

async function searchProducts(chatId: string, q: string) {
  const ws = words(q);
  if (!ws.length) return sendText(chatId, "Напишіть хоча б 2 символи назви або артикулу.");
  const found = await prisma.product.findMany({
    where: {
      isActive: true,
      AND: ws.map((w) => ({ OR: [{ name: { contains: w, mode: "insensitive" as const } }, { article: { contains: w, mode: "insensitive" as const } }] })),
    },
    select: { id: true, name: true, stock: true, boxQty: true, stockOverride: true },
    take: 8,
    orderBy: { name: "asc" },
  });
  if (!found.length) return sendText(chatId, "Нічого не знайдено. Спробуйте інакше (наприклад, лише артикул).");
  const kb: Keyboard = found.map((p) => [{ text: `${DOT[availabilityOf(p)]} ${p.name}`.slice(0, 60), data: `p:${p.id}` }]);
  return sendText(chatId, "Оберіть товар (можна одразу шукати інший):", kb);
}

const DOT: Record<Availability, string> = { in: "🟢", low: "🟡", out: "🔴" };

async function productCard(id: string) {
  const p = await prisma.product.findUnique({
    where: { id },
    select: { id: true, name: true, article: true, stock: true, boxQty: true, stockOverride: true },
  });
  if (!p) throw new Error("Товар не знайдено");
  const now = availabilityOf(p);
  const auto = autoAvailability(p.stock, p.boxQty);
  const text = [
    `<b>${esc(p.name)}</b>`,
    p.article ? `Артикул: ${esc(p.article)}` : "",
    `Зараз клієнти бачать: ${DOT[now]} <b>${AVAILABILITY_LABEL[now]}</b>${p.stockOverride ? " (вручну, до завтрашньої автоперевірки)" : ""}`,
    `Автоматично: ${AVAILABILITY_LABEL[auto]} (залишок ${p.stock} шт)`,
  ]
    .filter(Boolean)
    .join("\n");
  const kb: Keyboard = [
    [
      { text: "🟢 Є", data: `pa:${p.id}:in` },
      { text: "🟡 Мало", data: `pa:${p.id}:low` },
      { text: "🔴 Немає", data: `pa:${p.id}:out` },
    ],
    ...(p.stockOverride ? [[{ text: "↩️ Як автоматично", data: `pa:${p.id}:auto` }]] : []),
  ];
  return { text, kb };
}

async function showProduct(chatId: string, id: string, msgId?: number) {
  const { text, kb } = await productCard(id);
  return msgId ? editText(chatId, msgId, text, kb) : sendText(chatId, text, kb);
}

async function setAvailability(chatId: string, id: string, v: string, msgId?: number) {
  const override = v === "in" || v === "low" || v === "out" ? v : null;
  await prisma.product.update({
    where: { id },
    data: { stockOverride: override, stockOverrideAt: override ? new Date() : null },
  });
  await showProduct(chatId, id, msgId);
  return override ? `Встановлено: ${AVAILABILITY_LABEL[override]}` : "Повернуто автоматичний статус";
}

// ── photo KPI ──────────────────────────────────────────────────────────

export async function kpiCaption(entryId: string) {
  const e = await prisma.challengeEntry.findUnique({
    where: { id: entryId },
    include: {
      challenge: { select: { title: true } },
      user: { select: { name: true, company: true } },
      _count: { select: { photos: true } },
    },
  });
  if (!e) return null;
  const caption = [
    `📸 <b>${esc(e.challenge.title)}</b>`,
    `👤 ${esc(e.user.company || e.user.name)}`,
    e.comment ? `💬 ${esc(e.comment)}` : "",
    kyivDateTime(e.createdAt),
  ]
    .filter(Boolean)
    .join("\n");
  const kb: Keyboard = [
    [
      { text: "✅ Підтвердити", data: `ka:${e.id}` },
      { text: "❌ Відхилити", data: `kr:${e.id}` },
    ],
    ...(e._count.photos > 1 ? [[{ text: `Ще фото (${e._count.photos - 1})`, data: `kp:${e.id}` }]] : []),
  ];
  return { caption, kb };
}

async function listKpi(chatId: string) {
  const entries = await prisma.challengeEntry.findMany({
    where: { status: "SUBMITTED", photos: { some: {} } },
    orderBy: { createdAt: "asc" },
    take: 5,
    select: { id: true, photos: { take: 1, orderBy: { createdAt: "asc" }, select: { mime: true, data: true } } },
  });
  const total = await prisma.challengeEntry.count({ where: { status: "SUBMITTED", photos: { some: {} } } });
  if (!entries.length) return sendText(chatId, "Фото на перевірці немає ✅");
  await sendText(chatId, `На перевірці: ${total}. ${total > 5 ? "Показую перші 5." : ""}`.trim());
  for (const e of entries) {
    const c = await kpiCaption(e.id);
    if (c && e.photos[0]) await sendPhoto(chatId, e.photos[0], c.caption, c.kb);
  }
}

async function morePhotos(chatId: string, id: string) {
  const photos = await prisma.challengePhoto.findMany({ where: { entryId: id }, orderBy: { createdAt: "asc" }, skip: 1, select: { mime: true, data: true } });
  for (const [i, p] of photos.entries()) await sendPhoto(chatId, p, `Фото ${i + 2} з ${photos.length + 1}`);
}

async function clearButtons(chatId: string, msgId?: number) {
  if (msgId) await tg("editMessageReplyMarkup", { chat_id: chatId, message_id: msgId, reply_markup: { inline_keyboard: [] } }).catch(() => {});
}

async function approve(chatId: string, id: string, msgId?: number) {
  const before = await prisma.challengeEntry.findUnique({ where: { id }, select: { status: true } });
  if (!before) throw new Error("Заявку не знайдено");
  if (before.status !== "SUBMITTED") {
    await clearButtons(chatId, msgId);
    return sendText(chatId, `Цю заявку вже розглянуто (${before.status === "APPROVED" ? "підтверджено" : "відхилено"}).`);
  }
  const entry = await approveEntry(id);
  const [user, promo] = await Promise.all([
    prisma.user.findUnique({ where: { id: entry.userId }, select: { name: true, company: true } }),
    entry.promoCodeId ? prisma.promoCode.findUnique({ where: { id: entry.promoCodeId }, select: { code: true } }) : null,
  ]);
  await clearButtons(chatId, msgId);
  return sendText(
    chatId,
    `✅ Підтверджено: ${esc(user?.company || user?.name)}.${promo ? ` Клієнту видано код <code>${esc(promo.code)}</code> — він бачить його в кабінеті.` : ""}`
  );
}

async function rejectEntry(chatId: string, id: string, reason: string | null, msgId?: number) {
  const e = await prisma.challengeEntry.findUnique({ where: { id }, select: { status: true } });
  if (!e) return sendText(chatId, "Заявку не знайдено.");
  if (e.status !== "SUBMITTED") return sendText(chatId, "Цю заявку вже розглянуто.");
  await prisma.challengeEntry.update({
    where: { id },
    data: { status: "REJECTED", reviewedAt: new Date(), adminComment: reason?.slice(0, 500) || null },
  });
  await clearButtons(chatId, msgId);
  return sendText(chatId, `❌ Відхилено${reason ? `: ${esc(reason)}` : ""}.`, "menu");
}

// ── promo codes ────────────────────────────────────────────────────────

async function searchClients(chatId: string, q: string) {
  const ws = words(q);
  const digits = q.replace(/\D/g, "");
  if (!ws.length && digits.length < 4) return sendText(chatId, "Напишіть хоча б 2 літери назви або 4 цифри телефону / ЄДРПОУ.");
  const ors: Prisma.UserWhereInput[] = [];
  if (ws.length) {
    ors.push({ AND: ws.map((w) => ({ OR: [{ company: { contains: w, mode: "insensitive" as const } }, { name: { contains: w, mode: "insensitive" as const } }] })) });
  }
  if (digits.length >= 4) ors.push({ phone: { contains: digits.slice(-9) } }, { taxCode: { contains: digits } });
  const found = await prisma.user.findMany({
    where: { role: "CLIENT", OR: ors },
    select: { id: true, name: true, company: true, phone: true },
    take: 8,
    orderBy: { company: "asc" },
  });
  if (!found.length) return sendText(chatId, "Клієнта не знайдено. Спробуйте інакше.");
  const kb: Keyboard = found.map((u) => [{ text: `${u.company || u.name}${u.phone ? ` · ${u.phone}` : ""}`.slice(0, 60), data: `c:${u.id}` }]);
  return sendText(chatId, "Оберіть клієнта:", kb);
}

function templateLabel(t: { name: string | null; code: string; type: string; value: number }) {
  const v = t.type === "PERCENT" ? `−${t.value}%` : `−${t.value.toLocaleString("uk-UA")} ₴`;
  return `${t.name || t.code}: ${v}`;
}

async function pickTemplate(chatId: string, userId: string, msgId?: number) {
  const [user, templates] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { name: true, company: true } }),
    prisma.promoCode.findMany({ where: { isTemplate: true }, orderBy: { createdAt: "desc" }, take: 10 }),
  ]);
  if (!user) throw new Error("Клієнта не знайдено");
  if (!templates.length) {
    return sendText(chatId, "Немає шаблонів промокодів. Створіть шаблон в адмінці: Промокоди → тип «Нагорода».");
  }
  const text = `Клієнт: <b>${esc(user.company || user.name)}</b>\nОберіть промокод:`;
  const kb: Keyboard = templates.map((t) => [{ text: templateLabel(t).slice(0, 60), data: `pt:${userId}:${t.id}` }]);
  return msgId ? editText(chatId, msgId, text, kb) : sendText(chatId, text, kb);
}

function expiryFor(t: { expiresAt: Date | null }) {
  // A template's own end date if it is still ahead, otherwise 30 days.
  return t.expiresAt && t.expiresAt.getTime() > Date.now() + DAY ? t.expiresAt : new Date(Date.now() + 30 * DAY);
}

async function confirmPromo(chatId: string, userId: string, templateId: string, msgId?: number) {
  const [user, t] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { name: true, company: true } }),
    prisma.promoCode.findUnique({ where: { id: templateId } }),
  ]);
  if (!user || !t) throw new Error("Не знайдено");
  const until = expiryFor(t).toLocaleDateString("uk-UA", { timeZone: "Europe/Kyiv" });
  const text = `Видати <b>${esc(user.company || user.name)}</b> промокод «${esc(templateLabel(t))}»?\nОдноразовий, діє до ${until}.`;
  const kb: Keyboard = [[{ text: "✅ Так, видати", data: `pi:${userId}:${templateId}` }, { text: "Ні", data: "x" }]];
  return msgId ? editText(chatId, msgId, text, kb) : sendText(chatId, text, kb);
}

async function issuePromo(chatId: string, userId: string, templateId: string, msgId?: number) {
  const [user, t] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { name: true, company: true } }),
    prisma.promoCode.findUnique({ where: { id: templateId }, include: { products: { select: { id: true } } } }),
  ]);
  if (!user || !t) throw new Error("Не знайдено");
  const promo = await issuePersonalCode(t, userId, `${t.name || t.code} · видано в Telegram`, expiryFor(t));
  const text = `🎟 Клієнту <b>${esc(user.company || user.name)}</b> видано код <code>${esc(promo.code)}</code> (${esc(templateLabel(t))}). Він бачить його в кабінеті.`;
  return msgId ? editText(chatId, msgId, text) : sendText(chatId, text);
}
