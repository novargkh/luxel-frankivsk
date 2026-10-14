import { NextResponse, after } from "next/server";
import { notifyKpiPhoto } from "@/lib/telegramNotify";
import { prisma } from "@/lib/prisma";
import { sessionUser } from "@/lib/adminGuard";
import { activeWhere, attemptsLeft } from "@/lib/challenges";

export const maxDuration = 30;
const MAX_PHOTOS = 5;
const MAX_PHOTO_BYTES = 2_500_000;

// POST { photos: dataURL[], comment } — a client sends photos for a photo
// task; the admin reviews them.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await sessionUser();
  if (!me || me.isAdmin) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await params;

  const task = await prisma.challenge.findFirst({ where: { id, ...activeWhere() } });
  if (!task) return NextResponse.json({ error: "Завдання не знайдено або вже завершилось" }, { status: 404 });
  if (task.kind !== "PHOTO") {
    return NextResponse.json({ error: "Це завдання виконується замовленням, фото не потрібні" }, { status: 400 });
  }
  if ((await attemptsLeft(task, me.id)) <= 0) {
    return NextResponse.json({ error: "Ви вже виконали це завдання" }, { status: 400 });
  }
  const pending = await prisma.challengeEntry.count({ where: { challengeId: id, userId: me.id, status: "SUBMITTED" } });
  if (pending) return NextResponse.json({ error: "Попередні фото ще на перевірці" }, { status: 400 });

  const body = (await req.json().catch(() => ({}))) as { photos?: string[]; comment?: string };
  const photos = (body.photos ?? []).slice(0, MAX_PHOTOS).map((d) => {
    const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(d ?? "");
    return m ? { mime: m[1], data: Buffer.from(m[2], "base64") } : null;
  });
  if (!photos.length || photos.some((p) => !p || p.data.length > MAX_PHOTO_BYTES)) {
    return NextResponse.json({ error: "Додайте від 1 до 5 фото (JPEG/PNG)" }, { status: 400 });
  }

  const entry = await prisma.challengeEntry.create({
    data: {
      challengeId: id,
      userId: me.id,
      comment: body.comment?.trim().slice(0, 1000) || null,
      photos: { create: photos.map((p) => ({ mime: p!.mime, data: new Uint8Array(p!.data) })) },
    },
    select: { id: true, status: true, createdAt: true },
  });
  after(() => notifyKpiPhoto(entry.id));
  return NextResponse.json(entry, { status: 201 });
}
