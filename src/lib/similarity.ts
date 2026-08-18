// Heuristic product-attribute extraction and similarity scoring.
//
// The catalog has no structured spec fields (series, article/SKU, socket
// count, cable length, lamp base, bulb shape) — that data only exists
// embedded in the free-text product name, as scraped from luxel.ua. This
// module pulls those attributes out with regexes so "similar products" can
// be ranked by real technical match instead of just sharing a category.

export type ProductAttributes = {
  article: string | null; // model/SKU, usually the last "(...)" group
  series: string | null; // e.g. JAZZ, PRIMERA — an ALL-CAPS brand line name
  base: string | null; // цоколь — E27, E14, GU10, ...
  bulbShape: string | null; // колба — A60, G45, C37, ...
  wattage: number | null;
  colorTempK: number | null;
  lengthM: number | null; // метраж — cable/extension-cord length
  gangCount: number | null; // кількість гнізд/клавіш — sockets or switch keys
  color: string | null; // колір — білий, чорний, кремовий, ...
};

const BASE_TOKENS = [
  "E12", "E14", "E27", "E40", "G4", "G9", "G13", "GU4", "GU5.3", "GU10",
  "B15", "B22", "R7S",
];
const BASE_RE = new RegExp(`\\b(${BASE_TOKENS.join("|").replace(/\./g, "\\.")})\\b`, "i");

// Bulb-shape codes: a letter prefix + two digits, restricted to the
// well-known LED shape families so this doesn't collide with base codes
// like G9/G4 (small numbers) — shapes always carry a two-digit size.
const BULB_SHAPE_RE = /\b(A[4-8]\d|G[4-9]\d|C3[0-9]|C5[0-9]|P4[0-5]|R[5-8]\d|MR11|MR16|T[2-4]\d|BXS)\b/i;

// Color/finish words seen across color-variant product lines (OPERA, JAZZ,
// ...) — masculine and feminine adjective endings both map to one canonical
// color name so "білий вимикач" and "біла розетка" are recognized as the
// same color.
const COLOR_CANONICAL: Record<string, string> = {
  "білий": "білий",
  "біла": "білий",
  "чорний": "чорний",
  "чорна": "чорний",
  "кремовий": "кремовий",
  "кремова": "кремовий",
  "теракотовий": "теракотовий",
  "теракотова": "теракотовий",
  "бронзовий": "бронзовий",
  "бронзова": "бронзовий",
  "графітовий": "графітовий",
  "графітова": "графітовий",
  "вишневий": "вишневий",
  "вишнева": "вишневий",
  "сосна": "сосна",
};
const COLOR_RE = new RegExp(`\\b(${Object.keys(COLOR_CANONICAL).join("|")})\\b`, "iu");

const GANG_WORDS: [RegExp, number][] = [
  [/\bодн(?:а|о|оклавіш\w*|омісн\w*)\b/i, 1],
  [/\b(?:дв[іо]|подвійн\w*|двоклавіш\w*|двомісн\w*)\b/i, 2],
  [/\b(?:три|потрійн\w*|триклавіш\w*|трьохмісн\w*)\b/i, 3],
  [/\b(?:чотири|чотирьохклавіш\w*|чотиримісн\w*)\b/i, 4],
];

export function extractAttributes(name: string): ProductAttributes {
  let article: string | null = null;
  const parenMatches = [...name.matchAll(/\(([^()]+)\)/g)];
  if (parenMatches.length > 0) {
    article = parenMatches[parenMatches.length - 1][1].trim();
  }

  // Work on the name with parenthesized article stripped out, so series
  // detection doesn't pick up codes like "CL04R-72" from inside "(...)".
  const withoutArticle = name.replace(/\([^()]+\)/g, " ");

  let series: string | null = null;
  const seriesMatches = withoutArticle.match(/\b[A-Z]{3,}\b/g);
  if (seriesMatches) {
    // Ignore common all-caps noise that isn't a product series.
    const ignore = new Set(["LED", "IP20", "IP44", "IP65", "USB", "LUXEL"]);
    const candidate = seriesMatches.find((s) => !ignore.has(s));
    if (candidate) series = candidate;
  }

  const base = name.match(BASE_RE)?.[1]?.toUpperCase() ?? null;
  const bulbShape = name.match(BULB_SHAPE_RE)?.[1]?.toUpperCase() ?? null;

  const wattageMatch = name.match(/(\d+(?:[.,]\d+)?)\s*w\b/i);
  const wattage = wattageMatch ? parseFloat(wattageMatch[1].replace(",", ".")) : null;

  const colorTempMatch = name.match(/\b(\d{4})\s*k\b/i);
  const colorTempK = colorTempMatch ? parseInt(colorTempMatch[1], 10) : null;

  const lengthMatch = name.match(/(\d+(?:[.,]\d+)?)\s*м\b/u);
  const lengthM = lengthMatch ? parseFloat(lengthMatch[1].replace(",", ".")) : null;

  let gangCount: number | null = null;
  const digitGang = name.match(/\b(\d+)[-\s]?(?:гнізд\w*|місн\w*|клавіш\w*)/iu);
  if (digitGang) {
    gangCount = parseInt(digitGang[1], 10);
  } else {
    for (const [re, count] of GANG_WORDS) {
      if (re.test(name)) {
        gangCount = count;
        break;
      }
    }
  }

  const colorMatch = name.match(COLOR_RE)?.[1]?.toLowerCase() ?? null;
  const color = colorMatch ? COLOR_CANONICAL[colorMatch] ?? null : null;

  return { article, series, base, bulbShape, wattage, colorTempK, lengthM, gangCount, color };
}

// Extracts the leading numeric value from an article/SKU string, e.g.
// "2007" -> 2007, "CL08R-72" -> 8, "0722" -> 722. Used to order products
// within a series so color/variant blocks (which luxel.ua allocates as
// contiguous article ranges) stay grouped instead of interleaving.
// Missing/unparseable articles sort last.
export function articleNumeric(article: string | null): number {
  if (!article) return Number.POSITIVE_INFINITY;
  const m = article.match(/\d+/);
  if (!m) return Number.POSITIVE_INFINITY;
  return parseInt(m[0], 10);
}

export function similarityScore(a: ProductAttributes, b: ProductAttributes): number {
  let score = 0;
  if (a.article && b.article && a.article.toLowerCase() === b.article.toLowerCase()) score += 12;
  if (a.series && b.series && a.series === b.series) score += 6;
  if (a.base && b.base && a.base === b.base) score += 4;
  if (a.bulbShape && b.bulbShape && a.bulbShape === b.bulbShape) score += 4;
  if (a.wattage != null && b.wattage != null && Math.abs(a.wattage - b.wattage) <= 1) score += 3;
  if (a.colorTempK != null && b.colorTempK != null && a.colorTempK === b.colorTempK) score += 3;
  if (a.lengthM != null && b.lengthM != null && Math.abs(a.lengthM - b.lengthM) <= 0.5) score += 3;
  if (a.gangCount != null && b.gangCount != null && a.gangCount === b.gangCount) score += 3;
  if (a.color && b.color && a.color === b.color) score += 5;
  else if (a.color && b.color && a.color !== b.color) score -= 5;
  return score;
}
