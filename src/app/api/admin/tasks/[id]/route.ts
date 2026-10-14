import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sessionUser } from "@/lib/adminGuard";
import { parseChallengeInput, type ChallengeInput } from "@/lib/challengeAdmin";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const me = await sessionUser();
  if (!me?.isAdmin) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await params;
  const parsed = parseChallengeInput((await req.json()) as ChallengeInput, false);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const task = await prisma.challenge.update({ where: { id }, data: parsed.data as Prisma.ChallengeUpdateInput });
  return NextResponse.json(task);
}

// Deleting a task keeps the codes already issued (they stay with clients).
export async function DELETE(_req: Request, { params }: Ctx) {
  const me = await sessionUser();
  if (!me?.isAdmin) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await params;
  await prisma.challenge.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
