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
