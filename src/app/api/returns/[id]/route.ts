import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const STATUSES = ["NEW", "APPROVED", "REJECTED", "COMPLETED"] as const;

// Admin: change a return's status and/or leave a comment for the client.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (role !== "ADMIN") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = (await req.json()) as { status?: string; adminComment?: string | null };
  const data: { status?: (typeof STATUSES)[number]; adminComment?: string | null } = {};

  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status as (typeof STATUSES)[number])) {
      return NextResponse.json({ error: "invalid status" }, { status: 400 });
    }
    data.status = body.status as (typeof STATUSES)[number];
  }
  if (body.adminComment !== undefined) {
    data.adminComment = body.adminComment?.trim() || null;
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "no fields to update" }, { status: 400 });
  }

  const updated = await prisma.returnRequest.update({ where: { id }, data });
  return NextResponse.json(updated);
}
