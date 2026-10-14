import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sessionUser } from "@/lib/adminGuard";
import { parsePromoInput, type PromoInput } from "@/lib/promoAdmin";

export async function GET() {
  const me = await sessionUser();
  if (!me?.isAdmin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  // Codes issued as task rewards are listed on the tasks page, not here.
  const codes = await prisma.promoCode.findMany({
    where: { rewardEntry: { is: null } },
    include: {
      _count: { select: { orders: { where: { status: { not: "CANCELLED" } } } } },
      clients: { select: { id: true, name: true, company: true } },
      products: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(codes);
}

export async function POST(req: Request) {
  const me = await sessionUser();
  if (!me?.isAdmin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const parsed = parsePromoInput((await req.json()) as PromoInput, true);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  try {
    const promo = await prisma.promoCode.create({ data: parsed.data as Prisma.PromoCodeCreateInput });
    return NextResponse.json(promo, { status: 201 });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json({ error: "Такий код вже існує" }, { status: 400 });
    }
    throw e;
  }
}
