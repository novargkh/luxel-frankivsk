import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sessionUser } from "@/lib/adminGuard";
import { parsePromoInput, type PromoInput } from "@/lib/promoAdmin";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await sessionUser();
  if (!me?.isAdmin) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await params;

  const body = (await req.json()) as PromoInput;
  // The value check needs the type; take the stored one when not sent.
  if (body.value !== undefined && body.type === undefined) {
    const cur = await prisma.promoCode.findUnique({ where: { id }, select: { type: true } });
    body.type = cur?.type;
  }
  const parsed = parsePromoInput(body, false);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  try {
    const promo = await prisma.promoCode.update({ where: { id }, data: parsed.data as Prisma.PromoCodeUpdateInput });
    return NextResponse.json(promo);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json({ error: "Такий код вже існує" }, { status: 400 });
    }
    throw e;
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await sessionUser();
  if (!me?.isAdmin) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await params;
  await prisma.promoCode.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
