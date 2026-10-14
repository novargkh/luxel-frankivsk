// Thin client for the Telegram Bot API and the admin notifications.
// Needs TELEGRAM_BOT_TOKEN (and TELEGRAM_WEBHOOK_SECRET for the webhook).
// TELEGRAM_API_BASE exists only to point local tests at a fake API.

import { prisma } from "@/lib/prisma";

export const MAX_LINKS = Number(process.env.TELEGRAM_MAX_LINKS || 2);

export type Button = { text: string; data?: string; url?: string };
export type Keyboard = Button[][];

export function botConfigured() {
  return !!process.env.TELEGRAM_BOT_TOKEN;
}

function apiUrl(method: string) {
  const base = process.env.TELEGRAM_API_BASE || "https://api.telegram.org";
  return `${base}/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`;
}

export async function tg<T = unknown>(method: string, body: Record<string, unknown> | FormData): Promise<T> {
  if (!botConfigured()) throw new Error("TELEGRAM_BOT_TOKEN не задано");
  const res = await fetch(apiUrl(method), {
    method: "POST",
    ...(body instanceof FormData
      ? { body }
      : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(10_000),
  });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: T; description?: string };
  if (!data.ok) throw new Error(`Telegram ${method}: ${data.description ?? res.status}`);
  return data.result as T;
}

/** Text for parse_mode HTML. */
export function esc(s: string | null | undefined) {
  return (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function inline(kb: Keyboard) {
  return {
    inline_keyboard: kb.map((row) =>
      row.map((b) => (b.url ? { text: b.text, url: b.url } : { text: b.text, callback_data: b.data ?? "-" }))
    ),
  };
}

export const MENU = {
  keyboard: [
    [{ text: "📦 Замовлення" }, { text: "📊 Наявність" }],
    [{ text: "📸 Фото-KPI" }, { text: "🎟 Промокод" }],
  ],
  resize_keyboard: true,
  is_persistent: true,
};

export async function sendText(chatId: string, text: string, kb?: Keyboard | "menu") {
  return tg("sendMessage", {
    chat_id: chatId,
    text: text.slice(0, 4000),
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...(kb === "menu" ? { reply_markup: MENU } : kb ? { reply_markup: inline(kb) } : {}),
  });
}

export async function editText(chatId: string, messageId: number, text: string, kb?: Keyboard) {
  return tg("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text: text.slice(0, 4000),
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...(kb ? { reply_markup: inline(kb) } : {}),
  }).catch((e: Error) => {
    // Pressing the same button twice: Telegram refuses an identical edit.
    if (!/not modified/i.test(e.message)) throw e;
  });
}

export async function sendPhoto(chatId: string, photo: { mime: string; data: Uint8Array }, caption: string, kb?: Keyboard) {
  const form = new FormData();
  form.append("chat_id", chatId);
  form.append("caption", caption.slice(0, 1000));
  form.append("parse_mode", "HTML");
  if (kb) form.append("reply_markup", JSON.stringify(inline(kb)));
  const ext = photo.mime.split("/")[1] || "jpg";
  form.append("photo", new Blob([new Uint8Array(photo.data)], { type: photo.mime }), `photo.${ext}`);
  return tg("sendPhoto", form);
}

/** Linked chats. */
export async function adminChats() {
  const rows = await prisma.telegramLink.findMany({ where: { chatId: { not: null } }, select: { chatId: true } });
  return rows.map((r) => r.chatId!);
}

/**
 * Sends a notice to every linked chat. Never throws: a Telegram outage must
 * not break an order or an exchange.
 */
export async function notifyAdmins(text: string, kb?: Keyboard) {
  if (!botConfigured()) return;
  try {
    const chats = await adminChats();
    await Promise.all(
      chats.map((c) => sendText(c, text, kb).catch((e) => console.error("[telegram] notify failed:", e)))
    );
  } catch (e) {
    console.error("[telegram] notify failed:", e);
  }
}

export async function notifyAdminsPhoto(photo: { mime: string; data: Uint8Array }, caption: string, kb?: Keyboard) {
  if (!botConfigured()) return;
  try {
    const chats = await adminChats();
    await Promise.all(
      chats.map((c) => sendPhoto(c, photo, caption, kb).catch((e) => console.error("[telegram] notify failed:", e)))
    );
  } catch (e) {
    console.error("[telegram] notify failed:", e);
  }
}
