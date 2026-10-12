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

export type Pricing = (productId: string, basePrice: number) => number;

/**
 * The price function for this viewer. A client's own price from their BAF
 * price list wins; otherwise base price minus their discount. Admins see
 * base prices.
 */
export async function pricingFor(user: { id: string; isAdmin: boolean } | null): Promise<Pricing> {
  if (!user || user.isAdmin) return (_id, base) => base;
  const [u, own] = await Promise.all([
    prisma.user.findUnique({ where: { id: user.id }, select: { discountPercent: true } }),
    prisma.clientPrice.findMany({ where: { userId: user.id }, select: { productId: true, price: true } }),
  ]);
  const discount = u?.discountPercent ?? 0;
  const map = new Map(own.map((r) => [r.productId, r.price]));
  return (id, base) => map.get(id) ?? priceFor(base, discount);
}
