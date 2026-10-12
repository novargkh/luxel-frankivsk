import { prisma } from "@/lib/prisma";

// Phones are compared by their last 9 digits, so "+380 50 968 11 19",
// "0509681119" and "50-968-11-19" are the same number.
export function phoneKey(phone: string | null | undefined): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  return digits.length >= 9 ? digits.slice(-9) : null;
}

// Login accepts an email or a phone number.
export async function findUserByLogin(login: string) {
  const value = login.trim();
  if (!value) return null;
  if (value.includes("@")) {
    return prisma.user.findFirst({ where: { email: { equals: value, mode: "insensitive" } } });
  }
  const key = phoneKey(value);
  if (!key) return null;
  // Phones are stored as typed ("050 968 11 19"), so compare in code.
  const withPhone = await prisma.user.findMany({
    where: { phone: { not: null } },
    select: { id: true, phone: true },
  });
  const matches = withPhone.filter((u) => phoneKey(u.phone) === key);
  // Two accounts on one phone: ambiguous, ask for the email instead.
  if (matches.length !== 1) return null;
  return prisma.user.findUnique({ where: { id: matches[0].id } });
}

// Readable one-time password: no look-alike characters (0/O, 1/l/I).
export function generatePassword(length = 10) {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

/**
 * Sets a client's password (a new random one, or the admin's own) and keeps
 * it readable for the admin. Returns the password.
 */
export async function setClientPassword(userId: string, custom?: string): Promise<string> {
  const { default: bcrypt } = await import("bcryptjs");
  const { sealSecret } = await import("@/lib/secretBox");
  const password = custom?.trim() || generatePassword();
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await bcrypt.hash(password, 10), passwordEnc: sealSecret(password), passwordIssuedAt: new Date() },
  });
  return password;
}

/** The login a client types: email if there is one, else the phone. */
export function loginOf(u: { email: string | null; phone: string | null }) {
  return u.email || u.phone || "";
}

/**
 * Gives a password (a client cabinet) to every client who can log in
 * (has an email or phone) but has none yet. Returns how many were created.
 */
export async function ensureClientAccounts(): Promise<number> {
  const users = await prisma.user.findMany({
    where: { role: "CLIENT", passwordHash: "", OR: [{ email: { not: null } }, { phone: { not: null } }] },
    select: { id: true },
  });
  for (let i = 0; i < users.length; i += 8) {
    await Promise.all(users.slice(i, i + 8).map((u) => setClientPassword(u.id)));
  }
  return users.length;
}
