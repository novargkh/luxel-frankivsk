import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { promoStatus, promoVisibleToClient } from "@/lib/promo";

const STATUS_ORDER = { ACTIVE: 0, USED_UP: 1, EXPIRED: 2, DISABLED: 3 } as const;

// Promo codes the signed-in client can see in their cabinet ("Доступні
// промокоди") and pick from in the cart. Inactive ones are included too,
// with their status, so a client understands why a code no longer works.
export async function GET() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const codes = await prisma.promoCode.findMany({
    where: promoVisibleToClient(userId),
    include: { _count: { select: { orders: true } } },
    orderBy: { createdAt: "desc" },
  });

  const result = codes
    .map((c) => ({
      id: c.id,
      code: c.code,
      description: c.description,
      type: c.type,
      value: c.value,
      usageLimit: c.usageLimit,
      usedCount: c._count.orders,
      expiresAt: c.expiresAt,
      createdAt: c.createdAt,
      status: promoStatus(c, c._count.orders),
    }))
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);

  return NextResponse.json(result);
}
