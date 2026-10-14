import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sessionUser } from "@/lib/adminGuard";
import { pricingFor } from "@/lib/clientPrice";
import { activeWhere, rewardText } from "@/lib/challenges";
import { availabilityOf } from "@/lib/availability";

// GET — tasks the client can do now, with their own progress.
export async function GET() {
  const me = await sessionUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const [tasks, price] = await Promise.all([
    prisma.challenge.findMany({
      where: activeWhere(),
      include: {
        products: { select: { id: true, name: true, price: true, isActive: true, stock: true, boxQty: true, stockOverride: true, images: { select: { url: true }, take: 1 } } },
        rewardTemplate: { select: { type: true, value: true, minTotal: true, categories: true, products: { select: { name: true }, take: 2 }, _count: { select: { products: true } } } },
        entries: {
          where: { userId: me.id },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            status: true,
            adminComment: true,
            createdAt: true,
            reviewedAt: true,
            promoCode: { select: { code: true, expiresAt: true } },
            _count: { select: { photos: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    pricingFor(me),
  ]);

  return NextResponse.json(
    tasks.map((t) => {
      const used = t.entries.filter((e) => e.status !== "REJECTED").length;
      return {
        id: t.id,
        title: t.title,
        description: t.description,
        kind: t.kind,
        minQty: t.minQty,
        minTotal: t.minTotal,
        endsAt: t.endsAt,
        autoApprove: t.autoApprove,
        maxPerClient: t.maxPerClient,
        reward: rewardText(t.rewardTemplate),
        products: t.products
          .filter((p) => p.isActive)
          .map((p) => ({ id: p.id, name: p.name, price: price(p.id, p.price), image: p.images[0]?.url ?? null, out: availabilityOf(p) === "out" })),
        entries: t.entries,
        left: Math.max(0, t.maxPerClient - used),
        pending: t.entries.some((e) => e.status === "SUBMITTED"),
      };
    })
  );
}
