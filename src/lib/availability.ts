// What clients see instead of the warehouse count: "В наявності",
// "Закінчується" or "Немає в наявності".
//
// The automatic status comes from the stock number (refreshed daily from
// luxel.ua, see src/lib/stockSync.ts): out at 0, "low" below one shipping
// box (or ≤ LOW_STOCK when the box size is unknown). An admin can override
// it (Product.stockOverride); the override stays until the admin switches it
// back to automatic, and daily checks only refresh the stock number.

export type Availability = "in" | "low" | "out";

export const LOW_STOCK = 20;

export const AVAILABILITY_LABEL: Record<Availability, string> = {
  in: "В наявності",
  low: "Закінчується",
  out: "Немає в наявності",
};

export function isAvailability(v: unknown): v is Availability {
  return v === "in" || v === "low" || v === "out";
}

export function autoAvailability(stock: number, boxQty?: number | null): Availability {
  if (stock <= 0) return "out";
  const limit = boxQty && boxQty > 0 ? boxQty : LOW_STOCK;
  return stock < limit || stock <= LOW_STOCK ? "low" : "in";
}

export function availabilityOf(p: {
  stock: number;
  boxQty?: number | null;
  stockOverride?: string | null;
}): Availability {
  return isAvailability(p.stockOverride) ? p.stockOverride : autoAvailability(p.stock, p.boxQty);
}
