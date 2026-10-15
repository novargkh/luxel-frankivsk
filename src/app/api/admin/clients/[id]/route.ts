import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sessionUser } from "@/lib/adminGuard";
import { cleanClientFields, clientConflicts } from "@/lib/clientFields";
import { openSecret } from "@/lib/secretBox";
import { DeleteRefused, deleteTestClient, deletionBlocker } from "@/lib/clientDelete";

const select = {
  id: true,
  name: true,
  email: true,
  company: true,
  phone: true,
  basId: true,
  taxCode: true,
  isActive: true,
  discountPercent: true,
  passwordIssuedAt: true,
  passwordEnc: true,
} as const;

// The admin sees the client's current password (decrypted), never the hash.
function withPassword<T extends { passwordEnc: string | null }>(u: T) {
  const { passwordEnc, ...rest } = u;
  return { ...rest, password: openSecret(passwordEnc) };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await sessionUser();
  if (!me?.isAdmin) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await params;
  const user = await prisma.user.findFirst({ where: { id, role: "CLIENT" }, select });
  if (!user) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ...withPassword(user), deleteBlocker: await deletionBlocker(id) });
}

// Admin edits a client's contacts, BAS code, ЄДРПОУ, or blocks the account.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await sessionUser();
  if (!me?.isAdmin) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await params;

  const data = cleanClientFields(await req.json());
  if (data.name !== undefined && !data.name) {
    return NextResponse.json({ error: "Ім'я не може бути порожнім" }, { status: 400 });
  }
  const conflict = await clientConflicts(data, id);
  if (conflict) return NextResponse.json({ error: conflict }, { status: 400 });

  const user = await prisma.user.update({ where: { id }, data, select });
  return NextResponse.json(withPassword(user));
}

// DELETE { confirmName } removes a test client (no BAF code, nothing sent to
// BAF) with its orders.
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await sessionUser();
  if (!me?.isAdmin) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await params;
  const { confirmName } = (await req.json().catch(() => ({}))) as { confirmName?: string };
  try {
    return NextResponse.json(await deleteTestClient(id, confirmName ?? "", me.id));
  } catch (e) {
    if (e instanceof DeleteRefused) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
