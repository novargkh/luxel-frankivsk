import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sessionUser } from "@/lib/adminGuard";
import { approveEntry } from "@/lib/challenges";

// PATCH { action: "approve" | "reject", adminComment } — moderation.
// Approve issues the client's personal promo code from the reward template.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await sessionUser();
  if (!me?.isAdmin) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await params;
  const { action, adminComment } = (await req.json().catch(() => ({}))) as { action?: string; adminComment?: string };
  const comment = adminComment?.trim().slice(0, 500) || null;
  try {
    if (action === "approve") return NextResponse.json(await approveEntry(id, comment));
    if (action === "reject") {
      const entry = await prisma.challengeEntry.update({
        where: { id },
        data: { status: "REJECTED", reviewedAt: new Date(), adminComment: comment },
      });
      return NextResponse.json(entry);
    }
    return NextResponse.json({ error: "Невідома дія" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Помилка" }, { status: 400 });
  }
}
