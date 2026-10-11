import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sessionUser } from "@/lib/adminGuard";

const STATUSES = ["NEW", "DONE", "REJECTED"];

// Admin closes a change request (after editing the client) and can leave
// a reply the client sees.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await sessionUser();
  if (!me?.isAdmin) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await params;
  const body = (await req.json()) as { status?: string; adminComment?: string };

  const data: { status?: string; adminComment?: string | null } = {};
  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status)) return NextResponse.json({ error: "invalid status" }, { status: 400 });
    data.status = body.status;
  }
  if (body.adminComment !== undefined) data.adminComment = body.adminComment.trim() || null;

  const updated = await prisma.profileRequest.update({ where: { id }, data });
  return NextResponse.json(updated);
}
