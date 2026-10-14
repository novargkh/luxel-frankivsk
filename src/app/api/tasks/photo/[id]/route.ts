import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sessionUser } from "@/lib/adminGuard";

// A task photo: for the admin or the client who sent it.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await sessionUser();
  if (!me) return new NextResponse("unauthorized", { status: 401 });
  const { id } = await params;
  const photo = await prisma.challengePhoto.findUnique({
    where: { id },
    select: { mime: true, data: true, entry: { select: { userId: true } } },
  });
  if (!photo || (!me.isAdmin && photo.entry.userId !== me.id)) return new NextResponse("not found", { status: 404 });
  return new NextResponse(Buffer.from(photo.data), {
    headers: { "Content-Type": photo.mime, "Cache-Control": "private, max-age=86400" },
  });
}
