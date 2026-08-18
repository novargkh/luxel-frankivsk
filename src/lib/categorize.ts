// Refines a broad, source-derived category bucket into a more specific one
// based on keywords in the product name, so the catalog's accordion groups
// are more useful than a handful of huge umbrella categories.
//
// Rules are intentionally narrow and order-sensitive to avoid false
// positives — e.g. extension cords ("подовжувачі") and power strips
// ("колодки") both describe their outlet count using the word "розетки"
// too, so those must NOT be pulled into the "Розетки" bucket — only
// standalone wall/panel sockets should land there.
//
// This is now used only as a fallback for products that don't have a
// sourceUrl (e.g. manually added by an admin) — see categorizeProduct()
// below for the primary, URL-driven categorization used for everything
// synced from luxel.ua.
export function refineCategory(name: string, fallback: string): string {
  const n = name.toLowerCase();

  if (n.includes("прожектор")) return "Прожектори";

  if (n.includes("лінійн") && n.includes("світильник")) return "Світильники лінійні";

  if (n.includes("розетк") && !n.includes("подовж") && !n.includes("колодк")) return "Розетки";

  return fallback;
}

// luxel.ua's real URL structure (/{seg1}/{seg2}/{seg3}/{slug}, sometimes
// shorter) mirrors their actual category mega-menu much more precisely than
// guessing from the product name — every synced product's sourceUrl carries
// this for free. These tables were built by inspecting the full set of
// sourceUrls actually present in the catalog (see seg2/seg3 segment
// frequency dump) and cross-checked against luxel.ua's own menu.
//
// A seg2/seg3 value only appears here if it's a real category segment
// (repeated across many products); one-off segments are product slugs
// (e.g. "/aksessuari/svetilnik-perenosnoj-...") and fall through to the
// seg1-level fallback name instead.

const TOP_LEVEL_FALLBACK: Record<string, string> = {
  "-wifi-smart-tovari": "WiFi Smart",
  aksessuari: "Аксесуари",
  elektrofurnitura: "Електрофурнітура",
  generatori: "Генератори",
  "svetodiodnie--led--lampi": "LED Лампи",
  "svetodiodnoe--led--fitoosveshhenie": "LED Фітоосвітлення",
  "svetodiodnoe--led--osveshhenie": "LED Освітлення",
  udliniteli: "Подовжувачі",
};

const SEG2_MAP: Record<string, Record<string, string>> = {
  aksessuari: {
    adapter: "Перехідники",
    bra: "Бра",
    kauchuk: "Каучукові вироби",
    shtepsel: "Штепселі",
    vilki: "Вилки",
  },
  udliniteli: {
    udliniteli_bez_zazemleniya: "Подовжувачі без заземлення",
    udliniteli_s_zazemleniem: "Подовжувачі із заземленням",
    kolodki: "Колодки",
    setevoj_filtr: "Мережеві фільтри",
    "udliniteli-s-usb": "Подовжувачі з USB",
  },
  "svetodiodnie--led--lampi": {
    led_lampy: "LED Лампи",
    "filamentnie-lampi": "LED Філамент-лампи",
    "led-lampi-visokoj-moshhnosti": "LED Лампи високої потужності",
    "led-lampi-srednej-moshhnosti": "LED Лампи середньої потужності",
    "led-t8": "LED Лампи T8",
    "nizkovoltnie-lampi": "Низьковольтні LED лампи",
  },
  "svetodiodnoe--led--fitoosveshhenie": {
    "led-fitolampi": "LED Фітолампи",
    "led-fitosvetilniki": "LED Фітосвітильники",
  },
  "svetodiodnoe--led--osveshhenie": {
    led_svetilniki: "LED Світильники",
    "led-t5": "LED Світильники T5",
    "led-svetilniki-s-pultom-upravlenija": "LED Світильники з пультом керування",
    "led-ulichnie-svetilniki": "LED Вуличні світильники",
    led_paneli: "LED Панелі",
    led_paneli_s_dekorom: "LED Панелі з декором",
    "led-nastolnie-lampi": "LED Настільні лампи",
    "led-avtonomnoe-osveshhenie": "LED Автономне освітлення",
    prozhektory: "Прожектори",
    "led-fonari": "LED Ліхтарі",
    "akcentnoe-osveshhenie": "Акцентне освітлення",
    "tochechnoe-osveshhenie": "Точкове освітлення",
    "sumerechnie-datchiki": "Сутінкові датчики",
    "datchiki-dvizhenija": "Датчики руху",
    "led-nochniki": "LED Нічники",
  },
  elektrofurnitura: {
    "pilevlagozashhitnaja-serija": "Пилевологозахищена серія",
  },
};

// elektrofurnitura is one level deeper than the rest — seg2 only says
// "прихована"/"відкрита" установка, the actual product type is seg3.
const ELEKTROFURNITURA_SEG3: Record<string, Record<string, string>> = {
  "skritaja-ustanovka": {
    "vikljuchateli-skritoj-ustanovki": "Вимикачі прихованої установки",
    "rozetki-skritoj-ustanovki-": "Розетки прихованої установки",
    "rozetki--telefonnie--kompjuternie--televizionnie--skritaja-ustanovka":
      "Розетки телефонні/комп'ютерні/телевізійні",
    ramki: "Рамки",
    "ramki-stekljannie-serii-jazz": "Рамки скляні JAZZ",
    "reguljatori-jarkosti-skritaja-ustanovka": "Регулятори яскравості",
    "knopki-zvonka-skritaja-ustanovka": "Кнопки дзвінка",
  },
  "otkritaja-ustanovka": {
    "rozetki-otkritaja-ustanovka": "Розетки відкритої установки",
    "vikljuchateli-otkritaja-ustanovka": "Вимикачі відкритої установки",
    "bloki--rozetka-vikljuchatel-otkritaja-ustanovka": "Блоки розетка-вимикач",
    "rozetki--telefonnie--televizionnie-otkritaja-ustanovka":
      "Розетки телефонні/телевізійні (відкрита)",
  },
};

const ELEKTROFURNITURA_SEG2_FALLBACK: Record<string, string> = {
  "skritaja-ustanovka": "Електрофурнітура прихованої установки",
  "otkritaja-ustanovka": "Електрофурнітура відкритої установки",
};

// Derives a category directly from a luxel.ua product URL's path segments.
// Returns null if the URL can't be parsed or its top segment isn't one we
// recognize at all (should not normally happen for luxel.ua URLs).
export function deriveCategoryFromUrl(sourceUrl: string): string | null {
  let pathname: string;
  try {
    pathname = new URL(sourceUrl).pathname;
  } catch {
    return null;
  }
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 0) return null;
  const [seg1, seg2, seg3] = parts;

  if (seg1 === "elektrofurnitura" && seg2) {
    const seg3Map = ELEKTROFURNITURA_SEG3[seg2];
    if (seg3Map && seg3 && seg3Map[seg3]) return seg3Map[seg3];
    if (ELEKTROFURNITURA_SEG2_FALLBACK[seg2]) return ELEKTROFURNITURA_SEG2_FALLBACK[seg2];
    const seg2Map = SEG2_MAP.elektrofurnitura;
    if (seg2Map && seg2Map[seg2]) return seg2Map[seg2];
    return TOP_LEVEL_FALLBACK.elektrofurnitura ?? null;
  }

  const seg2Map = SEG2_MAP[seg1];
  if (seg2Map && seg2 && seg2Map[seg2]) return seg2Map[seg2];

  return TOP_LEVEL_FALLBACK[seg1] ?? null;
}

// Primary categorization entry point: prefers the rich URL-derived category
// (matches luxel.ua's real menu structure), then applies a couple of
// high-value name-keyword overrides on top (linear luminaires and
// floodlights aren't distinguishable from the URL alone — luxel.ua files
// both under the same "led_svetilniki" bucket). Falls back to pure
// keyword-based refineCategory() when there's no usable sourceUrl at all.
export function categorizeProduct(
  name: string,
  sourceUrl: string | null | undefined,
  existingFallback: string
): string {
  const urlCategory = sourceUrl ? deriveCategoryFromUrl(sourceUrl) : null;
  const base = urlCategory ?? refineCategory(name, existingFallback);

  const n = name.toLowerCase();
  if (n.includes("прожектор")) return "Прожектори";
  if (n.includes("лінійн") && n.includes("світильник")) return "Світильники лінійні";

  return base;
}
