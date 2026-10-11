// Forgiving text match for product names / articles: "096c55w" finds
// "(096C-55W)", "9601" finds "JAZZ (9601)". Compares both the plain
// lowercase text and a compact form with spaces and punctuation removed.

const compact = (s: string) => s.toLowerCase().replace(/[\s\-–—_()./,]+/g, "");

export function textMatches(haystack: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (haystack.toLowerCase().includes(q)) return true;
  const cq = compact(q);
  return cq.length > 0 && compact(haystack).includes(cq);
}
