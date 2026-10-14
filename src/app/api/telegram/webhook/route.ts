import crypto from "crypto";
import { NextResponse } from "next/server";
import { handleUpdate, type Update } from "@/lib/telegramBot";

export const runtime = "nodejs";
export const maxDuration = 30;

// Telegram sends every bot update here (set up from /admin/telegram). The
// secret header proves the request comes from Telegram; who may use the bot
// is decided by TelegramLink inside handleUpdate.
export async function POST(req: Request) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const got = req.headers.get("x-telegram-bot-api-secret-token") ?? "";
  if (!secret || got.length !== secret.length || !crypto.timingSafeEqual(Buffer.from(got), Buffer.from(secret))) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const update = (await req.json().catch(() => null)) as Update | null;
  if (update) {
    try {
      await handleUpdate(update);
    } catch (e) {
      // Answer 200 anyway: otherwise Telegram keeps resending the update.
      console.error("[telegram] update failed:", e);
    }
  }
  return NextResponse.json({ ok: true });
}
