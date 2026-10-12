import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { discountFor, priceFor } from "@/lib/clientPrice";
import { availabilityOf } from "@/lib/availability";
import {
  QuickOrderError,
  articleHints,
  vocabularyHints,
  buildIndex,
  matchLines,
  readWithAI,
  type ParsedLine,
} from "@/lib/quickOrder";

// Reading a photo or a minute of audio can take a few seconds.
export const maxDuration = 60;

const MAX_IMAGE_CHARS = 4_000_000; // ~3 MB of base64
const MAX_AUDIO_CHARS = 4_000_000;
const MAX_TEXT_CHARS = 4_000;
const AUDIO_FORMATS = new Set(["wav", "mp3", "m4a", "aac", "ogg", "flac"]);

// POST { text } | { image: "data:image/jpeg;base64,..." } | { audio: base64, format: "wav" }
// -> { items: MatchedLine[] }
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { text?: string; image?: string; audio?: string; format?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Невірний запит" }, { status: 400 });
  }

  const text = typeof body.text === "string" ? body.text.trim().slice(0, MAX_TEXT_CHARS) : "";
  const image = typeof body.image === "string" ? body.image : "";
  const audio = typeof body.audio === "string" ? body.audio : "";
  const format = typeof body.format === "string" ? body.format.toLowerCase() : "wav";

  if (!text && !image && !audio) {
    return NextResponse.json({ error: "Немає що розпізнавати" }, { status: 400 });
  }
  if (image && (!/^data:image\/(jpeg|png|webp);base64,/.test(image) || image.length > MAX_IMAGE_CHARS)) {
    return NextResponse.json({ error: "Фото завелике або в невідомому форматі" }, { status: 400 });
  }
  if (audio && (audio.length > MAX_AUDIO_CHARS || !AUDIO_FORMATS.has(format))) {
    return NextResponse.json({ error: "Запис задовгий або в невідомому форматі" }, { status: 400 });
  }

  const products = await prisma.product.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      price: true,
      stock: true,
      boxQty: true,
      stockOverride: true,
      images: { select: { url: true }, take: 1 },
    },
  });
  const sessionUser = session.user as { id?: string; role?: string };
  const discount = await discountFor(
    sessionUser.id ? { id: sessionUser.id, isAdmin: sessionUser.role === "ADMIN" } : null
  );
  // The matcher only uses stock to say "немає в наявності"; feed it the
  // effective status (admin override included) as 0 / at least 1.
  const index = buildIndex(
    products.map(({ boxQty, stockOverride, ...p }) => ({
      ...p,
      price: priceFor(p.price, discount),
      stock: availabilityOf({ stock: p.stock, boxQty, stockOverride }) === "out" ? 0 : Math.max(1, p.stock),
    }))
  );

  let lines: ParsedLine[];
  let transcript: string | null = null;
  try {
    ({ lines, transcript } = await readWithAI(
      {
        text: text || undefined,
        imageDataUrl: image || undefined,
        audioBase64: audio || undefined,
        audioFormat: format,
      },
      articleHints(index),
      vocabularyHints(index)
    ));
  } catch (e) {
    if (e instanceof QuickOrderError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("quick-order failed", e);
    return NextResponse.json({ error: "Не вдалося розпізнати. Спробуйте ще раз." }, { status: 500 });
  }

  return NextResponse.json({ items: matchLines(lines, index), transcript });
}
