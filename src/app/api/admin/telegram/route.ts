import crypto from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sessionUser } from "@/lib/adminGuard";
import { MAX_LINKS, botConfigured, sendText, tg } from "@/lib/telegram";

// Admin → Telegram: bot status, connecting the bot to the site (webhook),
// one-time links to connect a person's Telegram, and disconnecting.

async function botUsername(): Promise<string | null> {
  try {
    return (await tg<{ username?: string }>("getMe", {})).username ?? null;
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  const me = await sessionUser();
  if (!me?.isAdmin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const configured = botConfigured();
  const secretSet = !!process.env.TELEGRAM_WEBHOOK_SECRET;
  const expectedUrl = `${new URL(req.url).origin}/api/telegram/webhook`;
  let bot: string | null = null;
  let webhook: { url: string; pending: number; lastError: string | null } | null = null;
  if (configured) {
    bot = await botUsername();
    try {
      const w = await tg<{ url: string; pending_update_count: number; last_error_message?: string }>("getWebhookInfo", {});
      webhook = { url: w.url, pending: w.pending_update_count, lastError: w.last_error_message ?? null };
    } catch {
      webhook = null;
    }
  }
  const links = await prisma.telegramLink.findMany({
    where: { chatId: { not: null } },
    orderBy: { linkedAt: "asc" },
    select: { id: true, tgName: true, linkedAt: true, user: { select: { name: true, email: true } } },
  });
  return NextResponse.json({ configured, secretSet, bot, webhook, expectedUrl, links, max: MAX_LINKS });
}

// POST { action: "webhook" } — points the bot at this site.
// POST { action: "link" } — a one-time link (15 min) to connect a Telegram.
export async function POST(req: Request) {
  const me = await sessionUser();
  if (!me?.isAdmin) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!botConfigured()) return NextResponse.json({ error: "На сайті не задано TELEGRAM_BOT_TOKEN" }, { status: 400 });
  const { action } = (await req.json().catch(() => ({}))) as { action?: string };

  try {
    if (action === "webhook") {
      const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
      if (!secret) return NextResponse.json({ error: "На сайті не задано TELEGRAM_WEBHOOK_SECRET" }, { status: 400 });
      const url = `${new URL(req.url).origin}/api/telegram/webhook`;
      await tg("setWebhook", {
        url,
        secret_token: secret,
        allowed_updates: ["message", "callback_query"],
        drop_pending_updates: true,
      });
      await tg("setMyCommands", { commands: [{ command: "menu", description: "Меню" }] });
      return NextResponse.json({ ok: true, url });
    }

    if (action === "link") {
      const linked = await prisma.telegramLink.count({ where: { chatId: { not: null } } });
      if (linked >= MAX_LINKS) {
        return NextResponse.json({ error: `Уже підключено ${MAX_LINKS} особи. Спочатку відключіть когось.` }, { status: 400 });
      }
      const bot = await botUsername();
      if (!bot) return NextResponse.json({ error: "Не вдалося зв'язатися з Telegram. Перевірте TELEGRAM_BOT_TOKEN." }, { status: 400 });
      // Old unused codes are no use to anyone.
      await prisma.telegramLink.deleteMany({ where: { chatId: null, codeUntil: { lt: new Date() } } });
      const code = crypto.randomBytes(12).toString("hex");
      await prisma.telegramLink.create({
        data: { userId: me.id, code, codeUntil: new Date(Date.now() + 15 * 60_000) },
      });
      return NextResponse.json({ url: `https://t.me/${bot}?start=${code}` });
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Помилка Telegram" }, { status: 400 });
  }
  return NextResponse.json({ error: "Невідома дія" }, { status: 400 });
}

// DELETE ?id= — disconnects a chat from the bot.
export async function DELETE(req: Request) {
  const me = await sessionUser();
  if (!me?.isAdmin) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const id = new URL(req.url).searchParams.get("id");
  const link = id ? await prisma.telegramLink.findUnique({ where: { id } }) : null;
  if (!link) return NextResponse.json({ error: "Не знайдено" }, { status: 404 });
  await prisma.telegramLink.delete({ where: { id: link.id } });
  if (link.chatId && botConfigured()) {
    await sendText(link.chatId, "Вас відключено від бота LUXEL.").catch(() => {});
  }
  return NextResponse.json({ ok: true });
}
