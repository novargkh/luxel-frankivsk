import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sessionUser } from "@/lib/adminGuard";
import { phoneKey } from "@/lib/clientAccount";

// Import of clients (контрагенти) exported from BAS to Excel. The sheet is
// parsed in the browser (admin/clients page) and posted here as rows.
// BAS is the source of truth: a row with a known BAS code (or ЄДРПОУ)
// updates that client's contacts, an unknown one creates a client with no
// password (the admin issues it later). Delivery points are only created
// for clients that have none yet; after that the admin manages them.
export const maxDuration = 60;

type Row = {
  code?: string;
  company?: string;
  contactPerson?: string;
  taxCode?: string;
  phone?: string;
  email?: string;
  address?: string;
  discount?: string;
};

const s = (v: unknown) => {
  const t = String(v ?? "").replace(/\s+/g, " ").trim();
  return t || null;
};

export async function POST(req: Request) {
  const me = await sessionUser();
  if (!me?.isAdmin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = (await req.json()) as { rows?: Row[] };
  const rows = Array.isArray(body.rows) ? body.rows.slice(0, 5000) : [];
  if (rows.length === 0) return NextResponse.json({ error: "Файл порожній" }, { status: 400 });

  const users = await prisma.user.findMany({
    select: { id: true, basId: true, taxCode: true, email: true, phone: true, role: true, _count: { select: { shops: true } } },
  });
  const byCode = new Map(users.filter((u) => u.basId).map((u) => [u.basId!, u]));
  const byTax = new Map(users.filter((u) => u.taxCode).map((u) => [u.taxCode!, u]));
  const emailOwner = new Map(users.filter((u) => u.email).map((u) => [u.email!.toLowerCase(), u.id]));
  const phoneOwner = new Map<string, string>();
  for (const u of users) {
    const k = phoneKey(u.phone);
    if (k) phoneOwner.set(k, u.id);
  }

  let created = 0;
  let updated = 0;
  const skipped: string[] = [];
  const notes: string[] = [];

  for (const [i, r] of rows.entries()) {
    const code = s(r.code);
    const company = s(r.company);
    const taxCode = s(r.taxCode)?.replace(/\s/g, "") ?? null;
    const label = company ?? code ?? `рядок ${i + 2}`;
    if (!company) {
      skipped.push(`${label}: немає назви`);
      continue;
    }
    if (!code && !taxCode) {
      skipped.push(`${label}: немає коду BAS і ЄДРПОУ`);
      continue;
    }

    const existing = (code && byCode.get(code)) || (taxCode && byTax.get(taxCode)) || null;
    if (existing && existing.role !== "CLIENT") {
      skipped.push(`${label}: цей код належить адміністратору`);
      continue;
    }
    const selfId = existing?.id;

    let email = s(r.email)?.toLowerCase() ?? null;
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) email = null;
    if (email && emailOwner.has(email) && emailOwner.get(email) !== selfId) {
      notes.push(`${label}: email ${email} вже є в іншого клієнта, не змінено`);
      email = null;
    }
    let phone = s(r.phone);
    const pk = phoneKey(phone);
    if (pk && phoneOwner.has(pk) && phoneOwner.get(pk) !== selfId) {
      notes.push(`${label}: телефон ${phone} вже є в іншого клієнта, не змінено`);
      phone = null;
    }

    const dRaw = s(r.discount);
    const dNum = dRaw ? Number(dRaw.replace(",", ".").replace(/[%\s]/g, "")) : NaN;
    const data = {
      company,
      ...(Number.isFinite(dNum) ? { discountPercent: Math.min(Math.max(Math.abs(dNum), 0), 100) } : {}),
      name: s(r.contactPerson) ?? company,
      ...(code ? { basId: code } : {}),
      ...(taxCode ? { taxCode } : {}),
      ...(email ? { email } : {}),
      ...(phone ? { phone } : {}),
    };
    const address = s(r.address);

    if (existing) {
      await prisma.user.update({ where: { id: existing.id }, data });
      if (address && existing._count.shops === 0) {
        await prisma.shop.create({ data: { userId: existing.id, name: company, address } });
      }
      updated++;
    } else {
      const u = await prisma.user.create({
        data: {
          ...data,
          role: "CLIENT",
          ...(address ? { shops: { create: { name: company, address } } } : {}),
        },
        select: { id: true },
      });
      const rec = { id: u.id, basId: code, taxCode, email, phone, role: "CLIENT" as const, _count: { shops: address ? 1 : 0 } };
      if (code) byCode.set(code, rec);
      if (taxCode) byTax.set(taxCode, rec);
      created++;
    }
    if (email) emailOwner.set(email, selfId ?? "new");
    if (pk && phone) phoneOwner.set(pk, selfId ?? "new");
  }

  return NextResponse.json({ total: rows.length, created, updated, skipped, notes: notes.slice(0, 50) });
}
