// "Швидке замовлення": turns a dictated order, pasted text or a photo
// (shelf, box, notebook page) into catalog positions with quantities.
//
// Two steps:
// 1. An AI model (Gemini via OpenRouter) only *reads*: it returns the
//    article / name fragments it heard or saw, plus quantities.
// 2. This module *matches* those fragments against our own catalog. The AI
//    never decides on its own which product goes into the order, and every
//    result is shown to the person for confirmation before it reaches the
//    cart.

import { extractAttributes } from "@/lib/similarity";

export type ParsedLine = {
  /** What was heard / seen, as close to the original as possible. */
  text: string;
  /** Article / model code if one was recognised, e.g. "9601", "096C-55W". */
  article: string | null;
  qty: number | null;
};

export type CatalogProduct = {
  id: string;
  name: string;
  price: number;
  stock: number;
  images: { url: string }[];
};

// exact: sure match; likely: best guess pre-selected but worth a glance;
// choose: several close candidates; none: nothing found.
export type MatchStatus = "exact" | "likely" | "choose" | "none";

export type MatchedLine = {
  text: string;
  article: string | null;
  qty: number;
  /** No quantity was said / written: the UI asks the person to set it. */
  qtyMissing: boolean;
  status: MatchStatus;
  /** Best candidates, best first (max 4). */
  candidates: { id: string; name: string; price: number; stock: number; image: string | null; score: number }[];
};

// ── text normalisation ─────────────────────────────────────────────

// Cyrillic letters that look like Latin ones in codes ("С" in "50С").
const LOOKALIKE: Record<string, string> = {
  а: "a", в: "b", е: "e", к: "k", м: "m", н: "h", о: "o", р: "p", с: "c", т: "t", у: "y", х: "x", і: "i",
};

export function compact(s: string): string {
  return s
    .toLowerCase()
    .replace(/[авекмнорстухі]/g, (ch) => LOOKALIKE[ch] ?? ch)
    .replace(/[^a-z0-9а-яґєії]+/g, "");
}

const STOP = new Set([
  "luxel", "led", "світлодіодна", "світлодіодний", "світлодіодне", "лампа", "шт", "штук", "штуки",
  "та", "і", "з", "із", "для", "на", "в", "у",
]);

function tokens(s: string): string[] {
  return s
    .toLowerCase()
    // Glue numbers to their units so "5 метрів", "5м" and "5М" all become "5м",
    // "55 ват" / "55W" -> "55w".
    .replace(/(\d+(?:[.,]\d+)?)\s*(?:метр[а-яіїєґ]*|м)(?![a-zа-яіїєґ])/giu, "$1м")
    .replace(/(\d+(?:[.,]\d+)?)\s*(?:ват[а-яіїєґ]*|вт|w)(?![a-zа-яіїєґ])/giu, "$1w")
    .replace(/,/g, ".")
    .replace(/[()/]+/g, " ")
    .split(/\s+/)
    .map((t) => t.trim().replace(/^[.]+|[.]+$/g, ""))
    .filter((t) => (t.length > 1 || /^\d$/.test(t)) && !STOP.has(t));
}

type Indexed = CatalogProduct & { article: string | null; cArticle: string; cName: string; tok: Set<string> };

export function buildIndex(products: CatalogProduct[]): Indexed[] {
  return products.map((p) => {
    const article = extractAttributes(p.name).article;
    return {
      ...p,
      article,
      cArticle: article ? compact(article) : "",
      cName: compact(p.name),
      tok: new Set(tokens(p.name)),
    };
  });
}

/** Short list of article codes for the AI prompt (helps it spell codes). */
export function articleHints(index: Indexed[]): string {
  const seen = new Set<string>();
  for (const p of index) if (p.article && p.article.length <= 24) seen.add(p.article);
  return [...seen].join(", ");
}

function scoreProduct(p: Indexed, line: ParsedLine): number {
  let score = 0;
  const ca = line.article ? compact(line.article) : "";
  if (ca) {
    if (p.cArticle && p.cArticle === ca) score = Math.max(score, 100);
    else if (p.cArticle && ca.length >= 3 && (p.cArticle.startsWith(ca) || ca.startsWith(p.cArticle)))
      score = Math.max(score, 85);
    else if (ca.length >= 4 && p.cName.includes(ca)) score = Math.max(score, 75);
  }
  // Codes spoken inside the text ("розетка 9601 бронзова").
  const ct = compact(line.text);
  if (p.cArticle && p.cArticle.length >= 3 && ct.includes(p.cArticle)) score = Math.max(score, 90);

  // Word overlap with the product name.
  const qt = tokens(`${line.text} ${line.article ?? ""}`);
  if (qt.length > 0) {
    let hit = 0;
    for (const t of qt) {
      if (p.tok.has(t)) hit++;
      else if (t.length >= 4 && [...p.tok].some((pt) => pt.startsWith(t.slice(0, 4)))) hit += 0.6;
    }
    score = Math.max(score, Math.round((hit / qt.length) * 70));
  }
  return score;
}

export function matchLines(lines: ParsedLine[], index: Indexed[]): MatchedLine[] {
  return lines
    .filter((l) => (l.text && l.text.trim()) || (l.article && l.article.trim()))
    .map((line) => {
      const scored = index
        .map((p) => ({ p, s: scoreProduct(p, line) }))
        .filter((x) => x.s >= 35)
        .sort((a, b) => b.s - a.s || a.p.name.localeCompare(b.p.name, "uk"))
        .slice(0, 4);

      let status: MatchStatus = "none";
      if (scored.length > 0) {
        const [top, second] = scored;
        const clearWinner = !second || top.s - second.s >= 10;
        const lead = second ? top.s - second.s : top.s;
        status =
          top.s >= 85 && clearWinner ? "exact" : top.s >= 60 && lead >= 12 ? "likely" : "choose";
      }

      return {
        text: line.text,
        article: line.article,
        qty: Math.max(1, Math.min(9999, Math.round(line.qty ?? 1))),
        qtyMissing: line.qty == null,
        status,
        candidates: scored.map(({ p, s }) => ({
          id: p.id,
          name: p.name,
          price: p.price,
          stock: p.stock,
          image: p.images[0]?.url ?? null,
          score: s,
        })),
      };
    });
}

// ── AI reading step (OpenRouter → Gemini) ───────────────────────────

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
export const TEXT_MODEL = process.env.QUICK_ORDER_MODEL || "google/gemini-3.5-flash-lite";
export const VISION_MODEL = process.env.QUICK_ORDER_VISION_MODEL || "google/gemini-3.8-flash";

function systemPrompt(hints: string) {
  return `Ти допомагаєш оптовому клієнту компанії LUXEL (електротовари: лампи, світильники, розетки, вимикачі, подовжувачі) скласти замовлення.
Тобі дають надиктований текст, аудіо або фото (полиця, упаковка, сторінка зошита, накладна).
Твоє завдання лише ВИПИСАТИ позиції та кількості, нічого не вигадуючи.

Правила:
- Кожна позиція: "text" — як назвали або що написано (коротко, мовою оригіналу), "article" — артикул/код моделі, якщо він є, "qty" — кількість (число) або null, якщо кількість не названа.
- Числа, сказані словами, перетворюй у цифри: "дев'ять шістсот один" → "9601", "двадцять штук" → 20.
- Артикул LUXEL зазвичай у дужках у назві товару. Ось відомі артикули каталогу (використовуй точне написання, якщо почуте/побачене явно відповідає одному з них): ${hints}
- Якщо на фото кілька однакових товарів на полиці, це ОДНА позиція; кількість тоді null (продавець вкаже сам), якщо поруч не написано число.
- Не додавай позицій, яких немає у вхідних даних. Якщо нічого не знайдено, поверни порожній список.
Відповідай ТІЛЬКИ JSON: {"items":[{"text":"...","article":"..." або null,"qty":число або null}]}`;
}

type Content =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }
  | { type: "input_audio"; input_audio: { data: string; format: string } };

export class QuickOrderError extends Error {
  constructor(message: string, public status = 500) {
    super(message);
  }
}

export async function readWithAI(
  input: { text?: string; imageDataUrl?: string; audioBase64?: string; audioFormat?: string },
  hints: string
): Promise<ParsedLine[]> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    throw new QuickOrderError("Розпізнавання ще не налаштоване: немає ключа OPENROUTER_API_KEY у Vercel.", 503);
  }

  const content: Content[] = [];
  let model = TEXT_MODEL;
  if (input.text) content.push({ type: "text", text: `Замовлення:\n${input.text}` });
  if (input.audioBase64) {
    content.push({ type: "text", text: "Аудіо з надиктованим замовленням (українська або російська мова):" });
    content.push({ type: "input_audio", input_audio: { data: input.audioBase64, format: input.audioFormat || "wav" } });
  }
  if (input.imageDataUrl) {
    model = VISION_MODEL;
    content.push({ type: "text", text: "Фото товару / полиці / упаковки / запису в зошиті:" });
    content.push({ type: "image_url", image_url: { url: input.imageDataUrl } });
  }
  if (content.length === 0) throw new QuickOrderError("Порожній запит", 400);

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "X-Title": "LUXEL B2B quick order",
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt(hints) },
        { role: "user", content },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error("quick-order AI error", res.status, body.slice(0, 500));
    if (res.status === 402) throw new QuickOrderError("На рахунку OpenRouter закінчились кошти.", 502);
    if (res.status === 401) throw new QuickOrderError("Ключ OpenRouter недійсний.", 502);
    throw new QuickOrderError("Сервіс розпізнавання тимчасово недоступний. Спробуйте ще раз.", 502);
  }

  const data = await res.json();
  const raw: string = data?.choices?.[0]?.message?.content ?? "";
  return parseItems(raw);
}

export function parseItems(raw: string): ParsedLine[] {
  const jsonText = raw.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    const m = jsonText.match(/\{[\s\S]*\}/);
    if (!m) return [];
    try {
      parsed = JSON.parse(m[0]);
    } catch {
      return [];
    }
  }
  const items = (parsed as { items?: unknown })?.items;
  if (!Array.isArray(items)) return [];
  return items
    .map((it) => {
      const o = it as Record<string, unknown>;
      const qtyNum = typeof o.qty === "number" ? o.qty : typeof o.qty === "string" ? Number(o.qty) : NaN;
      return {
        text: typeof o.text === "string" ? o.text.slice(0, 200) : "",
        article: typeof o.article === "string" && o.article.trim() ? o.article.trim().slice(0, 40) : null,
        qty: Number.isFinite(qtyNum) && qtyNum > 0 ? qtyNum : null,
      };
    })
    .slice(0, 60);
}
