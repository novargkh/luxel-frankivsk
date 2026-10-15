// Availability an admin set by hand (Product.stockOverride) stays until the
// admin switches it back to automatic. These helpers find such products and
// the ones where luxel.ua now says something else, so the admin is reminded.

import { prisma } from "@/lib/prisma";
import { AVAILABILITY_LABEL, autoAvailability, type Availability } from "@/lib/availability";
import { esc, notifyAdmins } from "@/lib/telegram";

export async function manualStockReport() {
  const rows = await prisma.product.findMany({
    where: { stockOverride: { not: null }, isActive: true },
    select: { id: true, name: true, stock: true, boxQty: true, stockOverride: true },
    orderBy: { name: "asc" },
  });
  const differ = rows
    .map((r) => ({ ...r, auto: autoAvailability(r.stock, r.boxQty) }))
    .filter((r) => r.auto !== r.stockOverride);
  return { total: rows.length, differ };
}

/** After the morning stock check: which manual statuses disagree with luxel.ua. */
export async function notifyManualStock() {
  try {
    const { total, differ } = await manualStockReport();
    if (!differ.length) return;
    const lines = differ
      .slice(0, 10)
      .map((r) => `• ${esc(r.name)}: вручну «${AVAILABILITY_LABEL[r.stockOverride as Availability]}», luxel.ua — «${AVAILABILITY_LABEL[r.auto]}»`);
    if (differ.length > 10) lines.push(`…ще ${differ.length - 10}`);
    await notifyAdmins(
      `🔧 <b>Наявність вручну: ${total} товар(ів)</b>, у ${differ.length} з них luxel.ua зараз показує інакше:\n${lines.join("\n")}\n\nЯкщо ручний статус уже не потрібен, поверніть «Авто»: 📊 Наявність у боті або Товари → «Тільки змінені вручну».`
    );
  } catch (e) {
    console.error("[stock] manual reminder failed:", e);
  }
}
