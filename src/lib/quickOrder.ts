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
  candidates: {
    id: string;
    name: string;
    price: number;
    stock: number;
    image: string | null;
    score: number;
  }[];
};

// ── text normalisation ─────────────────────────────────────────────

// Cyrillic letters that look like Latin ones in codes ("С" in "50С").
const LOOKALIKE: Record<string, string> = {
  а: "a",
  в: "b",
  е: "e",
  к: "k",
  м: "m",
  н: "h",
  о: "o",
  р: "p",
  с: "c",
  т: "t",
  у: "y",
  х: "x",
  і: "i",
};

export function compact(s: string): string {
  return s
    .toLowerCase()
    .replace(/[авекмнорстухі]/g, (ch) => LOOKALIKE[ch] ?? ch)
    .replace(/[^a-z0-9а-яґєії]+/g, "");
}

const STOP = new Set([
  "luxel",
  "led",
  "світлодіодна",
  "світлодіодний",
  "світлодіодне",
  "лампа",
  "шт",
  "штук",
  "штуки",
  "та",
  "і",
  "з",
  "із",
  "для",
  "на",
  "в",
  "у",
]);

function tokens(s: string): string[] {
  return (
    s
      .toLowerCase()
      // Glue numbers to their units so "5 метрів", "5м" and "5М" all become "5м",
      // "55 ват" / "55W" -> "55w".
      .replace(
        /(\d+(?:[.,]\d+)?)\s*(?:метр[а-яіїєґ]*|м)(?![a-zа-яіїєґ])/giu,
        "$1м",
      )
      .replace(
        /(\d+(?:[.,]\d+)?)\s*(?:ват[а-яіїєґ]*|вт|w)(?![a-zа-яіїєґ])/giu,
        "$1w",
      )
      .replace(/,/g, ".")
      .replace(/[()/]+/g, " ")
      .split(/\s+/)
      .map((t) => t.trim().replace(/^[.]+|[.]+$/g, ""))
      .filter((t) => (t.length > 1 || /^\d$/.test(t)) && !STOP.has(t))
  );
}

type Indexed = CatalogProduct & {
  article: string | null;
  cArticle: string;
  cName: string;
  tok: Set<string>;
};

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
  for (const p of index)
    if (p.article && p.article.length <= 24) seen.add(p.article);
  return [...seen].join(", ");
}

// Series / brand words from product names (JAZZ, OPERA, AURA, HPF...):
// helps speech recognition spell them as in the catalog.
export function vocabularyHints(index: Indexed[]): string {
  const counts = new Map<string, number>();
  for (const p of index) {
    for (const w of p.name.match(/\b[A-Z][A-Z0-9-]{2,}\b/g) ?? []) {
      if (/^\d/.test(w) || w === "LUXEL") continue;
      counts.set(w, (counts.get(w) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 80)
    .map(([w]) => w)
    .join(", ");
}

function scoreProduct(p: Indexed, line: ParsedLine): number {
  let score = 0;
  const ca = line.article ? compact(line.article) : "";
  if (ca) {
    if (p.cArticle && p.cArticle === ca) score = Math.max(score, 100);
    else if (
      p.cArticle &&
      ca.length >= 3 &&
      (p.cArticle.startsWith(ca) || ca.startsWith(p.cArticle))
    )
      score = Math.max(score, 85);
    else if (ca.length >= 4 && p.cName.includes(ca))
      score = Math.max(score, 75);
  }
  // Codes spoken inside the text ("розетка 9601 бронзова").
  const ct = compact(line.text);
  if (p.cArticle && p.cArticle.length >= 3 && ct.includes(p.cArticle))
    score = Math.max(score, 90);

  // Word overlap with the product name.
  const qt = tokens(`${line.text} ${line.article ?? ""}`);
  if (qt.length > 0) {
    let hit = 0;
    for (const t of qt) {
      if (p.tok.has(t)) hit++;
      else if (
        t.length >= 4 &&
        [...p.tok].some((pt) => pt.startsWith(t.slice(0, 4)))
      )
        hit += 0.6;
    }
    score = Math.max(score, Math.round((hit / qt.length) * 70));
  }
  return score;
}

export function matchLines(
  lines: ParsedLine[],
  index: Indexed[],
): MatchedLine[] {
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
          top.s >= 85 && clearWinner
            ? "exact"
            : top.s >= 60 && lead >= 12
              ? "likely"
              : "choose";
      }

      return {
        text: line.text,
        article: line.article,
        qty: Math.max(1, Math.min(99999, Math.round(line.qty ?? 1))),
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

// ── fast path: plain "article + quantity" text ─────────────────────
//
// Dictation and typed orders are usually just codes and numbers
// ("9601 20 штук 7131 по 10"). Those are read here in a few milliseconds;
// only text with names, words for numbers or unknown codes goes to the AI.

const UNIT = String.raw`(?:шт\.?|штук[аи]?|штуки|ящик(?:и|ів|а)?|уп(?:ак(?:овк[аиу]|овок)?)?\.?|пач(?:ка|ки|ок)?|pcs)`;
const QUICK_RE = new RegExp(
  String.raw`(\d+)\s*${UNIT}(?![\p{L}])` + // 20 шт
    String.raw`|(?<![\p{L}])по\s+(\d+)` + // по 10
    String.raw`|(?<![\p{L}\d])[xх×]\s*(\d+)` + // x 5
    String.raw`|([\p{L}]{0,6}[-\s]?\d[\p{L}\d]*(?:[-–/][\p{L}\d]+)*)`, // 9601, 096C-55W, HPF-55W
  "giu",
);

// Quantities said in words ("двадцять п'ять штук", "по десять",
// "сорок шт"): turned into digits. Only before a unit or after "по", so
// codes dictated in words still go to the AI.
const NUM_WORDS: Record<string, number> = {
  один: 1, одна: 1, одну: 1, одне: 1, одно: 1, два: 2, дві: 2, две: 2, три: 3, чотири: 4, четыре: 4,
  "п'ять": 5, пять: 5, шість: 6, шесть: 6, сім: 7, семь: 7, вісім: 8, восемь: 8, "дев'ять": 9, девять: 9,
  десять: 10, одинадцять: 11, одиннадцать: 11, дванадцять: 12, двенадцать: 12, тринадцять: 13,
  тринадцать: 13, чотирнадцять: 14, четырнадцать: 14, "п'ятнадцять": 15, пятнадцать: 15,
  шістнадцять: 16, шестнадцать: 16, сімнадцять: 17, семнадцать: 17, вісімнадцять: 18,
  восемнадцать: 18, "дев'ятнадцять": 19, девятнадцать: 19, двадцять: 20, двадцать: 20,
  тридцять: 30, тридцать: 30, сорок: 40, "п'ятдесят": 50, пятьдесят: 50, шістдесят: 60,
  шестьдесят: 60, сімдесят: 70, семьдесят: 70, вісімдесят: 80, восемьдесят: 80,
  "дев'яносто": 90, девяносто: 90, сто: 100, двісті: 200, двести: 200, триста: 300,
  чотириста: 400, четыреста: 400, "п'ятсот": 500, пятьсот: 500, шістсот: 600, шестьсот: 600,
  сімсот: 700, семьсот: 700, вісімсот: 800, восемьсот: 800, "дев'ятсот": 900, девятьсот: 900,
  тисяча: 1000, тысяча: 1000, тисячу: 1000, тысячу: 1000,
};
const NUM_WORD = `(?:${Object.keys(NUM_WORDS).sort((a, b) => b.length - a.length).join("|")})`;
const ANY_NUM_WORD_RE = new RegExp(String.raw`(?<![\p{L}'])${NUM_WORD}(?![\p{L}'])`, "iu");

function wordsToNumber(words: string): number {
  let total = 0;
  for (const w of words.toLowerCase().split(/\s+/)) total += NUM_WORDS[w] ?? 0;
  return total;
}

const WORDS_BEFORE_UNIT_RE = new RegExp(
  String.raw`(?<![\p{L}'])${NUM_WORD}(?:\s+${NUM_WORD})*(?![\p{L}'])(?=\s*${UNIT}(?![\p{L}]))`,
  "giu"
);
const WORDS_AFTER_PO_RE = new RegExp(
  String.raw`(?<![\p{L}])(по\s+)(${NUM_WORD}(?:\s+${NUM_WORD})*)(?![\p{L}'])`,
  "giu"
);

export function qtyWordsToDigits(text: string): string {
  return text
    .replace(/[’ʼ`]/g, "'")
    .replace(WORDS_BEFORE_UNIT_RE, (m) => String(wordsToNumber(m)))
    .replace(WORDS_AFTER_PO_RE, (_m, po: string, w: string) => po + wordsToNumber(w));
}

export function quickParseText(raw: string, index: Indexed[]): ParsedLine[] | null {
  const text = qtyWordsToDigits(raw);
  if (ANY_NUM_WORD_RE.test(text)) return null; // numbers in words left: the AI reads them
  const known = new Set(index.map((p) => p.cArticle).filter(Boolean));
  if (known.size === 0) return null;
  const out: ParsedLine[] = [];
  let cur: ParsedLine | null = null;
  for (const m of text.matchAll(QUICK_RE)) {
    const qty = m[1] ?? m[2] ?? m[3];
    if (qty) {
      if (!cur || cur.qty != null) return null; // quantity without a code: let the AI read it
      cur.qty = Number(qty);
      continue;
    }
    const tok = m[4].trim();
    // A code may come with a word in front ("JAZZ 9601"): try the whole
    // token, then the part with digits.
    const tail = tok.split(/[\s]+/).pop() ?? tok;
    const code = [tok, tail].find((t) => known.has(compact(t)));
    if (code) {
      cur = { text: code, article: code, qty: null };
      out.push(cur);
    } else if (/^\d{1,5}$/.test(tail) && cur && cur.qty == null) {
      cur.qty = Number(tail); // bare number right after a code
    } else {
      return null; // unknown code or wording: the AI decides
    }
  }
  return out.length ? out : null;
}

// ── AI reading step (OpenRouter → Gemini) ───────────────────────────

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const AI_TIMEOUT_MS = 40_000;
export const TEXT_MODEL =
  process.env.QUICK_ORDER_MODEL || "google/gemini-3.5-flash-lite";
export const VISION_MODEL =
  process.env.QUICK_ORDER_VISION_MODEL || "google/gemini-3.8-flash";
// Same model as in the first version of quick order: fast, and it read
// dictated orders well enough. QUICK_ORDER_AUDIO_MODEL overrides it.
export const AUDIO_MODEL = process.env.QUICK_ORDER_AUDIO_MODEL || TEXT_MODEL;

function systemPrompt(hints: string, vocab: string, audio: boolean) {
  return `Ти допомагаєш оптовому клієнту компанії LUXEL (електротовари: лампи, світильники, розетки, вимикачі, подовжувачі) скласти замовлення.
Тобі дають надиктований текст, аудіо або фото (полиця, упаковка, сторінка зошита, накладна).
Твоє завдання лише ВИПИСАТИ позиції та кількості, нічого не вигадуючи.

Правила:
- Кожна позиція: "text" — як назвали або що написано (коротко, мовою оригіналу), "article" — артикул/код моделі, якщо він є, "qty" — кількість (число) або null, якщо кількість не названа.
- Числа, сказані словами, перетворюй у цифри: "дев'ять шістсот один" → "9601", "двадцять штук" → 20.
- Артикул LUXEL зазвичай у дужках у назві товару. Ось відомі артикули каталогу (використовуй точне написання, якщо почуте/побачене явно відповідає одному з них): ${hints}
- Якщо на фото кілька однакових товарів на полиці, це ОДНА позиція; кількість тоді null (продавець вкаже сам), якщо поруч не написано число.
- Назви серій і моделей у каталозі пишуться латиницею: ${vocab}. Якщо почув щось схоже («джаз», «опера», «аура»), пиши як у каталозі (JAZZ, OPERA, AURA).
- Не додавай позицій, яких немає у вхідних даних. Якщо нічого не знайдено, поверни порожній список.${
    audio
      ? `
Для аудіо:
- Мова — українська, російська або суржик, можливий шум магазину. Слухай уважно цифри.
- Артикул часто диктують по цифрах або парами: «дев'ять шість нуль один», «дев'яносто шість нуль один», «дев'ять шістсот один» — це все "9601". «Нуль», «ноль», «о» — це 0.
- Позиції розділяють паузою, словами «далі», «наступне», «ще», «і». Кількість зазвичай іде після артикула: «...двадцять штук», «...по десять», «...ящик» (якщо сказано «ящик» без числа, qty = null).
- Поле "transcript" — дослівний текст того, що почув (цифри пиши цифрами), щоб людина могла перевірити.`
      : ""
  }
Відповідай ТІЛЬКИ JSON: {${audio ? '"transcript":"...",' : ""}"items":[{"text":"...","article":"..." або null,"qty":число або null}]}`;
}

type Content =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }
  | { type: "input_audio"; input_audio: { data: string; format: string } };

export class QuickOrderError extends Error {
  constructor(
    message: string,
    public status = 500,
  ) {
    super(message);
  }
}

export async function readWithAI(
  input: {
    text?: string;
    imageDataUrl?: string;
    audioBase64?: string;
    audioFormat?: string;
  },
  hints: string,
  vocab = "",
): Promise<{ lines: ParsedLine[]; transcript: string | null }> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    throw new QuickOrderError(
      "Розпізнавання ще не налаштоване: немає ключа OPENROUTER_API_KEY у Vercel.",
      503,
    );
  }

  const content: Content[] = [];
  let model = TEXT_MODEL;
  if (input.text)
    content.push({ type: "text", text: `Замовлення:\n${input.text}` });
  if (input.audioBase64) {
    model = AUDIO_MODEL;
    content.push({
      type: "text",
      text: "Аудіо з надиктованим замовленням (українська або російська мова):",
    });
    content.push({
      type: "input_audio",
      input_audio: {
        data: input.audioBase64,
        format: input.audioFormat || "wav",
      },
    });
  }
  if (input.imageDataUrl) {
    model = VISION_MODEL;
    content.push({
      type: "text",
      text: "Фото товару / полиці / упаковки / запису в зошиті:",
    });
    content.push({ type: "image_url", image_url: { url: input.imageDataUrl } });
  }
  if (content.length === 0) throw new QuickOrderError("Порожній запит", 400);

  // Never keep the person waiting on a stuck request.
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), AI_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      signal: ctrl.signal,
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
          {
            role: "system",
            content: systemPrompt(hints, vocab, !!input.audioBase64),
          },
          { role: "user", content },
        ],
      }),
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") {
      throw new QuickOrderError(
        "Розпізнавання триває задовго. Спробуйте ще раз або введіть артикули текстом.",
        504,
      );
    }
    throw new QuickOrderError(
      "Сервіс розпізнавання тимчасово недоступний. Спробуйте ще раз.",
      502,
    );
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error("quick-order AI error", res.status, body.slice(0, 500));
    if (res.status === 402)
      throw new QuickOrderError(
        "На рахунку OpenRouter закінчились кошти.",
        502,
      );
    if (res.status === 401)
      throw new QuickOrderError("Ключ OpenRouter недійсний.", 502);
    throw new QuickOrderError(
      "Сервіс розпізнавання тимчасово недоступний. Спробуйте ще раз.",
      502,
    );
  }

  const data = await res.json();
  const raw: string = data?.choices?.[0]?.message?.content ?? "";
  return { lines: parseItems(raw), transcript: parseTranscript(raw) };
}

function parseTranscript(raw: string): string | null {
  const m = raw.match(/"transcript"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  if (!m) return null;
  try {
    return (JSON.parse(`"${m[1]}"`) as string).slice(0, 1000) || null;
  } catch {
    return null;
  }
}

export function parseItems(raw: string): ParsedLine[] {
  const jsonText = raw
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
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
      const qtyNum =
        typeof o.qty === "number"
          ? o.qty
          : typeof o.qty === "string"
            ? Number(o.qty)
            : NaN;
      return {
        text: typeof o.text === "string" ? o.text.slice(0, 200) : "",
        article:
          typeof o.article === "string" && o.article.trim()
            ? o.article.trim().slice(0, 40)
            : null,
        qty: Number.isFinite(qtyNum) && qtyNum > 0 ? qtyNum : null,
      };
    })
    .slice(0, 60);
}
