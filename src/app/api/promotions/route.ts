import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Public-safe list of currently usable promo codes (any authenticated user,
// not just admins) — used by the client-facing "Акції" page. Only exposes
// the fields a customer needs to decide whether to use a code; never
// leaks usage counts tied to other customers' orders.
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const codes = await prisma.promoCode.findMany({
    where: {
      isActive: true,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    include: { _count: { select: { orders: true } } },
    orderBy: { createdAt: "desc" },
  });

  const usable = codes
    .filter((c) => c.usageLimit == null || c._count.orders < c.usageLimit)
    .map((c) => ({
      code: c.code,
      type: c.type,
      value: c.value,
      expiresAt: c.expiresAt,
    }));

  return NextResponse.json(usable);
}
