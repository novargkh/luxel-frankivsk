import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { validatePromoCode } from "@/lib/promo";

// Promo codes handed out to the signed-in client: ones shown to every
// client plus the ones assigned to them personally. Includes inactive / expired ones so the
// client can see their status; `usable` says whether it can be applied now.
export async function GET() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const codes = await prisma.promoCode.findMany({
    // Shown to clients, and either handed to everyone (no clients listed)
    // or to this client in particular.
    where: {
      showToClients: true,
      OR: [{ clients: { none: {} } }, { clients: { some: { id: userId } } }],
    },
    include: { _count: { select: { orders: true } } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(
    codes.map((c) => {
      const check = validatePromoCode(c, c._count.orders);
      const expired = !!c.expiresAt && c.expiresAt.getTime() < Date.now();
      const exhausted = c.usageLimit != null && c._count.orders >= c.usageLimit;
      return {
        id: c.id,
        code: c.code,
        description: c.description,
        type: c.type,
        value: c.value,
        expiresAt: c.expiresAt,
        usageLimit: c.usageLimit,
        used: c._count.orders,
        createdAt: c.createdAt,
        status: !c.isActive ? "INACTIVE" : expired ? "EXPIRED" : exhausted ? "EXHAUSTED" : "ACTIVE",
        usable: check.ok,
      };
    })
  );
}
