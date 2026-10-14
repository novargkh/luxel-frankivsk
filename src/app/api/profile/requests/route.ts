import { NextResponse, after } from "next/server";
import { notifyProfileRequest } from "@/lib/telegramNotify";
import { prisma } from "@/lib/prisma";
import { sessionUser } from "@/lib/adminGuard";

// Change requests for contacts / delivery points. A client sees and sends
// their own; an admin sees everyone's (newest first, open ones on top).
export async function GET() {
  const me = await sessionUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const requests = await prisma.profileRequest.findMany({
    where: me.isAdmin ? {} : { userId: me.id },
    include: me.isAdmin ? { user: { select: { id: true, name: true, company: true, phone: true } } } : undefined,
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const rank = (s: string) => (s === "NEW" ? 0 : 1);
  return NextResponse.json(requests.sort((a, b) => rank(a.status) - rank(b.status)));
}

export async function POST(req: Request) {
  const me = await sessionUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (me.isAdmin) return NextResponse.json({ error: "Адмін змінює дані напряму" }, { status: 400 });

  const { message } = (await req.json()) as { message?: string };
  const text = (message ?? "").trim();
  if (text.length < 5) {
    return NextResponse.json({ error: "Опишіть, що потрібно змінити" }, { status: 400 });
  }
  const created = await prisma.profileRequest.create({
    data: { userId: me.id, message: text.slice(0, 2000) },
  });
  after(() => notifyProfileRequest(created.id));
  return NextResponse.json(created, { status: 201 });
}
