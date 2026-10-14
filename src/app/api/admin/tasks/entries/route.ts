import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sessionUser } from "@/lib/adminGuard";

// GET ?status=SUBMITTED|APPROVED|REJECTED — clients' task entries.
export async function GET(req: Request) {
  const me = await sessionUser();
  if (!me?.isAdmin) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const status = new URL(req.url).searchParams.get("status");
  const entries = await prisma.challengeEntry.findMany({
    where: status && ["SUBMITTED", "APPROVED", "REJECTED"].includes(status) ? { status: status as "SUBMITTED" } : {},
    include: {
      challenge: { select: { id: true, title: true, kind: true } },
      user: { select: { id: true, name: true, company: true, phone: true } },
      photos: { select: { id: true } },
      promoCode: { select: { code: true, orders: { select: { id: true }, take: 1 } } },
    },
    orderBy: { createdAt: status === "SUBMITTED" ? "asc" : "desc" },
    take: 300,
  });
  return NextResponse.json(entries);
}
