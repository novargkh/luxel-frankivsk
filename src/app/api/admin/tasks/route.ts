import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sessionUser } from "@/lib/adminGuard";
import { parseChallengeInput, type ChallengeInput } from "@/lib/challengeAdmin";
import { rewardText } from "@/lib/challenges";

export async function GET() {
  const me = await sessionUser();
  if (!me?.isAdmin) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const [tasks, templates] = await Promise.all([
    prisma.challenge.findMany({
      include: {
        products: { select: { id: true, name: true } },
        rewardTemplate: { select: { id: true, code: true, name: true, type: true, value: true, minTotal: true, categories: true, products: { select: { name: true }, take: 2 }, _count: { select: { products: true } } } },
        _count: { select: { entries: true } },
        entries: { select: { status: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.promoCode.findMany({
      where: { isTemplate: true },
      select: { id: true, code: true, name: true, type: true, value: true, minTotal: true, categories: true, products: { select: { name: true }, take: 2 }, _count: { select: { products: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  return NextResponse.json({
    tasks: tasks.map(({ entries, ...t }) => ({
      ...t,
      reward: rewardText(t.rewardTemplate),
      stats: {
        submitted: entries.filter((e) => e.status === "SUBMITTED").length,
        approved: entries.filter((e) => e.status === "APPROVED").length,
        rejected: entries.filter((e) => e.status === "REJECTED").length,
      },
    })),
    templates: templates.map((t) => ({ id: t.id, code: t.code, name: t.name, text: rewardText(t) })),
  });
}

export async function POST(req: Request) {
  const me = await sessionUser();
  if (!me?.isAdmin) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const parsed = parseChallengeInput((await req.json()) as ChallengeInput, true);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const task = await prisma.challenge.create({ data: parsed.data as Prisma.ChallengeCreateInput });
  return NextResponse.json(task, { status: 201 });
}
