// Matching the BAF nomenclature (price list exported from BAF) with the
// products on the site, which came from luxel.ua and carry luxel.ua's
// article spelling. Pure functions, used by the server routes and safe to
// import in the browser (parsing the Excel file).
//
// Typical differences the matcher absorbs:
//   BAF "9101Р"  (накладка, Cyrillic Р)   site "(9101)"
//   BAF "7303"                             site "(7303A)"
//   BAF "LX 600SC-36"                      site "(LX 600SC-36W)"
//   BAF "T8-0.6-10-C"                      site "(T8-0,6-10-C (двохст,)"
//   BAF "030-N"                            site "(030-N 7W)"
//   BAF "2054K" (Latin K) / "2054К" (Cyrillic) — the same code
// When one code fits several site products, wattage and colour temperature
// from the names decide; anything still uncertain goes to manual review.

export type BafRow = { article: string; name: string; unit: string; price: number | null; group: string };

export type SiteProduct = { id: string; name: string; article: string | null; bafName?: string | null };

export type MatchStatus = "exact" | "review" | "none";

export type MatchResult = {
  row: BafRow;
  status: MatchStatus;
  /** Chosen product (exact) or best guess (review). */
  productId: string | null;
  /** Why: "артикул", "артикул без суфікса", "за потужністю"... */
  how: string;
  /** Up to 5 candidates for the admin to pick from. */
  candidates: { id: string; name: string; score: number }[];
};

// Cyrillic letters that look like Latin ones in codes.
const LOOK: Record<string, string> = {
  А: "A", В: "B", С: "C", Е: "E", Н: "H", І: "I", К: "K", М: "M", О: "O", Р: "P", Т: "T", Х: "X", У: "Y",
  а: "A", в: "B", с: "C", е: "E", н: "H", і: "I", к: "K", м: "M", о: "O", р: "P", т: "T", х: "X", у: "Y",
};

export function normCode(s: string): string {
  return s
    .replace(/[А-Яа-яІі]/g, (ch) => LOOK[ch] ?? ch)
    .toUpperCase()
    .replace(/[\s\-_./,()*]/g, "");
}

const SPEC = /^(\d+([.,]\d+)?(W|V|K|M|MM|LM|AH|A|ВТ|Г)|E\d\d|GU\d+([.,]\d)?|G\d+|IP\d\d|\d+X\d+(X\d+)?(MM)?|\d+)$/i;

function codeTokens(text: string): string[] {
  return text
    .split(/[\s+]+/)
    .map((t) => t.replace(/^[(,]+|[),]+$/g, ""))
    .filter((t) => /\d/.test(t) && t.length >= 3 && !SPEC.test(normCode(t)));
}

function watts(s: string): Set<string> {
  const out = new Set<string>();
  for (const m of s.matchAll(/(\d+(?:[.,]\d+)?)\s*(?:W|Вт|w|вт)(?![A-Za-zА-Яа-я])/g)) out.add(m[1].replace(",", "."));
  return out;
}

function kelvin(s: string): Set<string> {
  const out = new Set<string>();
  for (const m of s.matchAll(/(\d{4})\s*[KК](?![A-Za-zА-Яа-я])/g)) out.add(m[1]);
  return out;
}

/** Codes under which a site product can be found. */
export function siteKeys(p: SiteProduct): { strong: Set<string>; weak: Set<string> } {
  const strong = new Set<string>();
  const weak = new Set<string>();
  if (p.article) strong.add(normCode(p.article));
  // Bracketed code, tolerating a missing closing bracket: "(T8-0,6-10-C (двохст,)".
  const open = p.name.indexOf("(");
  if (open >= 0) {
    const inner = p.name.slice(open + 1).replace(/\).*$/, "");
    const first = inner.split("(")[0].trim();
    strong.add(normCode(first));
    // Without a trailing wattage: "030-N 7W" -> 030-N, "LX 600SC-36W" -> LX 600SC-36.
    strong.add(normCode(first.replace(/\s+\d+([.,]\d+)?\s*W\b.*$/i, "")));
    strong.add(normCode(first).replace(/(\d)W$/, "$1"));
    // "ECO 048-CE 10W": the first token with digits.
    const tok = first.split(/\s+/).find((t) => /\d/.test(t));
    if (tok) strong.add(normCode(tok));
  }
  for (const t of codeTokens(p.name)) weak.add(normCode(t));
  // A bare number at the very end: "Перехідник Luxel універсальний 1039".
  const tail = p.name.trim().match(/\s(\d{4,5})$/);
  if (tail) weak.add(tail[1]);
  // "LED-LPES-20C 20W" on the site is "LPES-20C" in BAF.
  for (const k of [...strong]) if (k.startsWith("LED") && k.length > 5) strong.add(k.slice(3));
  strong.delete("");
  weak.delete("");
  return { strong, weak };
}

/** Variants of a BAF code to look up, most specific first. */
function bafVariants(row: BafRow): { key: string; how: string }[] {
  const a = normCode(row.article);
  const firstWord = normCode(row.name.split(/\s+/)[0] ?? "");
  // "045-NE Multipack*5" is the set "ECO 045-MP" on the site, never the
  // single lamp 045-NE.
  if (/MULTIPA/.test(a)) return [{ key: a.replace(/[A-Z]*MULTIPA[CK]+\d*$/, "MP"), how: "набір (MP)" }];
  const out = [
    { key: a, how: "артикул" },
    { key: firstWord, how: "код у назві" },
    { key: a.replace(/NEW$/, ""), how: "артикул без NEW" },
    { key: a.replace(/P$/, ""), how: "артикул без суфікса Р" },
    { key: firstWord.replace(/P$/, ""), how: "артикул без суфікса Р" },
  ];
  // "091-C" with 27W in the name is "091C-27W" on the site.
  for (const w of watts(row.name)) out.push({ key: a + w.replace(".", ""), how: "артикул + потужність" });
  const seen = new Set<string>();
  return out.filter((v) => v.key.length >= 2 && !seen.has(v.key) && seen.add(v.key));
}

function words(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-zа-яіїєґ0-9]+/gi, " ")
      .split(" ")
      .filter((w) => w.length >= 3 && w !== "luxel")
  );
}

function similarity(a: string, b: string): number {
  const wa = words(a);
  const wb = words(b);
  if (!wa.size || !wb.size) return 0;
  let hit = 0;
  for (const w of wa) if (wb.has(w)) hit++;
  return hit / Math.max(wa.size, wb.size);
}

/**
 * Matches every BAF row to at most one site product and every site product
 * to at most one BAF row.
 */
export function matchNomenclature(rows: BafRow[], products: SiteProduct[]): MatchResult[] {
  const strongIdx = new Map<string, SiteProduct[]>();
  const weakIdx = new Map<string, SiteProduct[]>();
  const strippedIdx = new Map<string, SiteProduct[]>();
  const add = (m: Map<string, SiteProduct[]>, k: string, p: SiteProduct) => {
    const list = m.get(k) ?? [];
    if (!list.includes(p)) list.push(p);
    m.set(k, list);
  };
  for (const p of products) {
    const { strong, weak } = siteKeys(p);
    for (const k of strong) {
      add(strongIdx, k, p);
      // "7303A" on the site is "7303" in BAF.
      const s = k.replace(/(\d)[AP]$/, "$1");
      if (s !== k) add(strippedIdx, s, p);
    }
    for (const k of weak) add(weakIdx, k, p);
  }

  type Pick = { p: SiteProduct; how: string; certain: boolean };
  const picks: (Pick | null)[] = rows.map((row) => {
    let found: SiteProduct[] = [];
    let how = "";
    let certain = true;
    for (const v of bafVariants(row)) {
      found = strongIdx.get(v.key) ?? [];
      if (found.length) {
        how = v.how;
        break;
      }
    }
    if (!found.length) {
      const k = normCode(row.article);
      found = strippedIdx.get(k) ?? [];
      if (found.length) how = "артикул без суфікса A";
    }
    if (!found.length) {
      const k = normCode(row.article);
      found = weakIdx.get(k) ?? [];
      if (found.length) {
        how = "код у назві товару";
        certain = found.length === 1;
      }
    }
    if (found.length > 1) {
      const bw = watts(row.name);
      const bk = kelvin(row.name);
      const byW = found.filter((p) => [...watts(p.name)].some((w) => bw.has(w)));
      const narrowed = byW.length ? byW : found;
      const byK = bk.size ? narrowed.filter((p) => [...kelvin(p.name)].some((k) => bk.has(k))) : narrowed;
      const final = byK.length ? byK : narrowed;
      // Duplicated products on the site (same name twice): take the first.
      const sameName = final.every((p) => p.name === final[0].name);
      if (final.length === 1 || sameName) {
        found = [final[0]];
        how += byW.length ? ", за потужністю" : "";
      } else {
        found = final.sort((a, b) => similarity(row.name, b.name) - similarity(row.name, a.name));
        certain = false;
        how += ", кілька варіантів";
      }
    }
    return found.length ? { p: found[0], how, certain } : null;
  });

  // One site product per BAF row: when two rows claim it, the more certain
  // one (then the one whose name is closer) keeps it, the other goes to review.
  const owner = new Map<string, number>();
  picks.forEach((pk, i) => {
    if (!pk) return;
    const j = owner.get(pk.p.id);
    if (j === undefined) {
      owner.set(pk.p.id, i);
      return;
    }
    const other = picks[j]!;
    const better =
      Number(pk.certain) - Number(other.certain) ||
      similarity(rows[i].name, pk.p.name) - similarity(rows[j].name, other.p.name);
    if (better > 0) owner.set(pk.p.id, i);
  });

  return rows.map((row, i) => {
    const pk = picks[i];
    const candidates = products
      .map((p) => ({ id: p.id, name: p.name, score: Math.round(similarity(row.name, p.name) * 100) }))
      .filter((c) => c.score >= 25)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    if (pk && owner.get(pk.p.id) === i) {
      if (!candidates.some((c) => c.id === pk.p.id)) candidates.unshift({ id: pk.p.id, name: pk.p.name, score: 100 });
      return { row, status: pk.certain ? "exact" : "review", productId: pk.p.id, how: pk.how, candidates };
    }
    if (pk) {
      return { row, status: "review", productId: null, how: "товар уже зайнятий іншим рядком BAF", candidates };
    }
    return { row, status: candidates.length ? "review" : "none", productId: null, how: candidates.length ? "схожі назви" : "", candidates };
  });
}

/**
 * Reads the BAF price list ("Прайс-лист": Артикул | Найменування | од. |
 * ціна, with group rows in between) from sheet rows (arrays of cells).
 */
export function parseBafSheet(sheet: unknown[][]): BafRow[] {
  const cell = (v: unknown) => (v == null ? "" : String(v).trim());
  const num = (v: unknown) => {
    if (typeof v === "number") return v;
    const s = cell(v).replace(/\s/g, "").replace(",", ".");
    return s && /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : null;
  };
  // Header: the row with "Артикул".
  const headerAt = sheet.findIndex((r) => r.some((c) => /^артикул/i.test(cell(c))));
  const start = headerAt >= 0 ? headerAt + 1 : 0;
  const header = headerAt >= 0 ? sheet[headerAt].map(cell) : [];
  const artCol = Math.max(0, header.findIndex((c) => /^артикул/i.test(c)));
  let nameCol = header.findIndex((c) => /найменув|номенклат|назва/i.test(c));
  if (nameCol < 0) nameCol = artCol + 1;

  // The price column: the one with the most numbers among item rows (the
  // price header is often merged over the unit column).
  const body = sheet.slice(start);
  const width = Math.max(0, ...body.map((r) => r.length));
  let priceCol = -1;
  let best = 0;
  for (let c = 0; c < width; c++) {
    if (c === artCol || c === nameCol) continue;
    const n = body.filter((r) => num(r[c]) !== null).length;
    if (n > best) {
      best = n;
      priceCol = c;
    }
  }
  const unitCol = [...Array(width).keys()].find(
    (c) => c !== artCol && c !== nameCol && c !== priceCol && body.some((r) => /^(шт|упак|м|кг|компл)\.?$/i.test(cell(r[c])))
  );

  const out: BafRow[] = [];
  let group = "";
  for (const r of body) {
    const article = cell(r[artCol]);
    const name = cell(r[nameCol]);
    if (article && !name && priceCol >= 0 && num(r[priceCol]) === null) {
      group = article; // a group heading row
      continue;
    }
    if (!article || !name) continue;
    out.push({
      article,
      name,
      unit: unitCol !== undefined ? cell(r[unitCol]) || "шт" : "шт",
      price: priceCol >= 0 ? num(r[priceCol]) : null,
      group,
    });
  }
  return out;
}
