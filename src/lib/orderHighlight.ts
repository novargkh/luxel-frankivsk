// Marks articles and quantities in a dictated / typed order so the person
// sees at a glance what was understood: "9601 двадцять штук" →
// [9601: article, found in catalog] [20 шт: quantity].

export type Segment =
  | { kind: "plain"; text: string }
  | { kind: "article"; text: string; known: boolean }
  | { kind: "qty"; text: string };

const compact = (s: string) => s.toUpperCase().replace(/[\s.\-_/]/g, "");

// Quantity: "20 шт", "20 штук", "3 ящики", "по 10", "x 5" / "× 5",
// or a number after a dash at the end of a line ("9601 - 20").
const QTY_RE =
  /(?:\b\d+(?:[.,]\d+)?\s*(?:шт\.?|штук[аи]?|штуки|шт|ящик(?:и|ів|а)?|уп(?:ак(?:овк[аиу]|овок)?)?\.?|пач(?:ка|ки|ок)?|бухт[аи]?|рулон(?:и|ів)?|pcs)(?![\p{L}]))|(?:(?<![\p{L}])по\s+\d+)|(?:[xх×]\s*\d+\b)|(?:[-–—]\s*\d+\s*$)/gimu;

// Article-like codes: 3–6 digits ("9601", "7131"), or letters/digits joined
// by dashes ("096C-55W", "DLD-03W", "LX 600SEC-40" → "600SEC-40").
const ART_RE = /\b(?:[A-ZА-Я]{0,4}\d{2,}[A-ZА-Я0-9]*(?:[-–][A-ZА-Я0-9]+)+|\d{3,6}[A-ZА-Я]?)\b/giu;

export function highlightOrder(text: string, knownArticles: Set<string>): Segment[] {
  if (!text) return [];
  type Mark = { start: number; end: number; kind: "article" | "qty" };
  const marks: Mark[] = [];
  for (const m of text.matchAll(QTY_RE)) {
    marks.push({ start: m.index!, end: m.index! + m[0].length, kind: "qty" });
  }
  for (const m of text.matchAll(ART_RE)) {
    const start = m.index!;
    const end = start + m[0].length;
    if (marks.some((x) => start < x.end && end > x.start)) continue;
    marks.push({ start, end, kind: "article" });
  }
  marks.sort((a, b) => a.start - b.start);

  const out: Segment[] = [];
  let pos = 0;
  for (const mk of marks) {
    if (mk.start > pos) out.push({ kind: "plain", text: text.slice(pos, mk.start) });
    const piece = text.slice(mk.start, mk.end);
    out.push(
      mk.kind === "article"
        ? { kind: "article", text: piece, known: knownArticles.has(compact(piece)) }
        : { kind: "qty", text: piece }
    );
    pos = mk.end;
  }
  if (pos < text.length) out.push({ kind: "plain", text: text.slice(pos) });
  return out;
}

// Catalog articles for the "known" check: the code in brackets at the end of
// a product name ("Розетка JAZZ (9601)" → 9601).
export function articlesFromNames(names: string[]): Set<string> {
  const set = new Set<string>();
  for (const n of names) {
    const all = [...n.matchAll(/\(([^()]+)\)/g)];
    const a = all.length ? all[all.length - 1][1] : null;
    if (a) set.add(compact(a));
  }
  return set;
}
