import { prisma } from "@/lib/prisma";

// Prices: Product.price is the base price from BAS; each client has a
// personal discount (User.discountPercent, also from BAS). Clients only ever
// see their own final price, never the base price or the percentage.

export function priceFor(base: number, discountPercent: number) {
  const d = Math.min(Math.max(discountPercent || 0, 0), 100);
  return Math.round(base * (1 - d / 100) * 100) / 100;
}

// The discount to apply for this viewer: admins see base prices (0).
export async function discountFor(user: { id: string; isAdmin: boolean } | null) {
  if (!user || user.isAdmin) return 0;
  const u = await prisma.user.findUnique({ where: { id: user.id }, select: { discountPercent: true } });
  return u?.discountPercent ?? 0;
}
