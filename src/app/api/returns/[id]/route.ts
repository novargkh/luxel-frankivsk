import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const STATUSES = ["NEW", "APPROVED", "REJECTED", "COMPLETED"] as const;
type Status = (typeof STATUSES)[number];

// Admin: change the status of a return request and/or reply to the client.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (role !== "ADMIN") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const { status, adminComment } = (await req.json()) as { status?: Status; adminComment?: string | null };
  const data: { status?: Status; adminComment?: string | null } = {};
  if (status !== undefined) {
    if (!STATUSES.includes(status)) {
      return NextResponse.json({ error: "Невірний статус" }, { status: 400 });
    }
    data.status = status;
  }
  if (adminComment !== undefined) data.adminComment = adminComment?.trim() || null;
  const updated = await prisma.returnRequest.update({ where: { id }, data });
  return NextResponse.json(updated);
}
