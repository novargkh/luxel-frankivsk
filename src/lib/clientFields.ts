import { prisma } from "@/lib/prisma";
import { phoneKey } from "@/lib/clientAccount";

// Contact fields an admin may set on a client (they normally come from BAS).
export type ClientFields = {
  name?: string;
  company?: string | null;
  email?: string | null;
  phone?: string | null;
  basId?: string | null;
  taxCode?: string | null;
  isActive?: boolean;
  discountPercent?: number;
};

const opt = (v: unknown) => {
  if (v === undefined) return undefined;
  const s = String(v ?? "").trim();
  return s ? s : null;
};

export function cleanClientFields(body: Record<string, unknown>): ClientFields {
  const out: ClientFields = {};
  if (body.name !== undefined) out.name = String(body.name ?? "").trim();
  for (const k of ["company", "email", "phone", "basId", "taxCode"] as const) {
    const v = opt(body[k]);
    if (v !== undefined) out[k] = v;
  }
  if (out.email) out.email = out.email.toLowerCase();
  if (body.isActive !== undefined) out.isActive = Boolean(body.isActive);
  if (body.discountPercent !== undefined) {
    const d = Number(String(body.discountPercent ?? "").replace(",", ".").replace("%", ""));
    out.discountPercent = Number.isFinite(d) ? Math.min(Math.max(d, 0), 100) : 0;
  }
  return out;
}

// Email, BAS ID and phone must point at one client only (they are logins
// and matching keys). Returns a message for the admin, or null.
export async function clientConflicts(data: ClientFields, selfId?: string) {
  const notSelf = selfId ? { id: { not: selfId } } : {};
  if (data.email) {
    const other = await prisma.user.findFirst({
      where: { email: { equals: data.email, mode: "insensitive" }, ...notSelf },
      select: { name: true },
    });
    if (other) return `Email ${data.email} вже використовує клієнт «${other.name}»`;
  }
  if (data.basId) {
    const other = await prisma.user.findFirst({ where: { basId: data.basId, ...notSelf }, select: { name: true } });
    if (other) return `Код BAS ${data.basId} вже прив'язаний до клієнта «${other.name}»`;
  }
  const key = phoneKey(data.phone);
  if (key) {
    const withPhone = await prisma.user.findMany({
      where: { phone: { not: null }, ...notSelf },
      select: { name: true, phone: true },
    });
    const other = withPhone.find((u) => phoneKey(u.phone) === key);
    if (other) return `Телефон ${data.phone} вже має клієнт «${other.name}» (телефон є логіном для входу)`;
  }
  return null;
}
