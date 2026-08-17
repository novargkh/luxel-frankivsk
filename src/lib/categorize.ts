// Refines a broad, source-derived category bucket into a more specific one
// based on keywords in the product name, so the catalog's accordion groups
// are more useful than a handful of huge umbrella categories.
//
// Rules are intentionally narrow and order-sensitive to avoid false
// positives — e.g. extension cords ("подовжувачі") and power strips
// ("колодки") both describe their outlet count using the word "розетки"
// too, so those must NOT be pulled into the "Розетки" bucket — only
// standalone wall/panel sockets should land there.
export function refineCategory(name: string, fallback: string): string {
  const n = name.toLowerCase();

  if (n.includes("прожектор")) return "Прожектори";

  if (n.includes("лінійн") && n.includes("світильник")) return "Світильники лінійні";

  if (n.includes("розетк") && !n.includes("подовж") && !n.includes("колодк")) return "Розетки";

  return fallback;
}
