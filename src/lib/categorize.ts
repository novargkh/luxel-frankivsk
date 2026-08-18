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
// This is used as a fallback for products without a usable source URL or
// source subcategory, for example a product added manually by an admin.
export function refineCategory(name: string, fallback: string): string {
  const n = name.toLowerCase();

  if (n.includes("прожектор")) return "LED Прожектори";

  if (n.includes("лінійн") && n.includes("світильник")) return "LED Лінійні світильники";

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
  "svetodiodnie--led--lampi": "Світлодіодні (LED) Лампи",
  "svetodiodnoe--led--osveshhenie": "Світлодіодне (LED) освітлення",
  "svetodiodnoe--led--fitoosveshhenie": "Світлодіодне (LED) Фітоосвітлення",
  elektrofurnitura: "Електрофурнітура",
  "-wifi-smart-tovari": "WiFi смарт товари",
  udliniteli: "Подовжувачі",
  aksessuari: "Аксесуари",
  generatori: "Генератори та акумулятори",
};

const SEG2_MAP: Record<string, Record<string, string>> = {
  aksessuari: {
    adapter: "Трійники та перехідники",
    "razvetvitel-na-dve-lampi-e27--1038-": "Трійники та перехідники",
    bra: "Вимикачі для бра",
    kauchuk: "Каучукові вилки та штепселя",
    shtepsel: "Штепселя",
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
    led_lampy: "LED Лампи побутові",
    "filamentnie-lampi": "LED філаментні лампи",
    "led-lampi-visokoj-moshhnosti": "LED Лампи високої потужності",
    "led-lampi-srednej-moshhnosti": "LED Лампи середньої потужності",
    "led-t8": "LED Лампи T8",
    "nizkovoltnie-lampi": "LED Низьковольтні лампи",
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
    prozhektory: "LED Прожектори",
    "led-fonari": "LED ліхтарі",
    "akcentnoe-osveshhenie": "Акцентне Освітлення",
    "tochechnoe-osveshhenie": "Точкове освітлення",
    "sumerechnie-datchiki": "Сутінкові датчики",
    "datchiki-dvizhenija": "Датчики руху",
    "led-nochniki": "LED Нічники",
  },
  elektrofurnitura: {
    "pilevlagozashhitnaja-serija": "Пиловологозахисна серія",
  },
};

// elektrofurnitura is one level deeper than the rest — seg2 only says
// "прихована"/"відкрита" установка, the actual product type is seg3.
const ELEKTROFURNITURA_SEG3: Record<string, Record<string, string>> = {
  "skritaja-ustanovka": {
    "vikljuchateli-skritoj-ustanovki": "Вимикачі (прихована установка)",
    "rozetki-skritoj-ustanovki-": "Розетки (прихована установка)",
    "rozetki--telefonnie--kompjuternie--televizionnie--skritaja-ustanovka":
      "Розетки телефонні, комп'ютерні, телевізійні (прихована установка)",
    ramki: "Рамки (прихована установка)",
    "ramki-stekljannie-serii-jazz": "Рамки скляні серії jazz (прихована установка)",
    "reguljatori-jarkosti-skritaja-ustanovka": "Регулятори яскравості (прихована установка)",
    "knopki-zvonka-skritaja-ustanovka": "Кнопки дзвінка (прихована установка)",
  },
  "otkritaja-ustanovka": {
    "rozetki-otkritaja-ustanovka": "Розетки",
    "vikljuchateli-otkritaja-ustanovka": "Вимикачі",
    "bloki--rozetka-vikljuchatel-otkritaja-ustanovka": "Блоки (розетка + вимикач)",
    "rozetki--telefonnie--televizionnie-otkritaja-ustanovka":
      "Розетки (телефонні, телевізійні)",
    "reguljatori-jarkosti-otkritaja-ustanovka": "Регулятори яскравості",
  },
};

const ELEKTROFURNITURA_SEG2_FALLBACK: Record<string, string> = {
  "skritaja-ustanovka": "Електрофурнітура прихованої установки",
  "otkritaja-ustanovka": "Електрофурнітура відкритої установки",
};

// Existing products may still contain labels from the first version of the
// taxonomy. Keep the UI and future syncs on one canonical vocabulary without
// requiring a destructive database migration.
const CATEGORY_ALIASES: Record<string, string> = {
  "LED Лампи": TOP_LEVEL_FALLBACK["svetodiodnie--led--lampi"],
  "LED Освітлення": TOP_LEVEL_FALLBACK["svetodiodnoe--led--osveshhenie"],
  "LED Фітоосвітлення": TOP_LEVEL_FALLBACK["svetodiodnoe--led--fitoosveshhenie"],
  "Фітоосвітлення": TOP_LEVEL_FALLBACK["svetodiodnoe--led--fitoosveshhenie"],
  "WiFi Smart": TOP_LEVEL_FALLBACK["-wifi-smart-tovari"],
  "Генератори": TOP_LEVEL_FALLBACK.generatori,
  Прожектори: "LED Прожектори",
  "LED Ліхтарі": "LED ліхтарі",
  "Низьковольтні LED лампи": "LED Низьковольтні лампи",
  "Світильники лінійні": "LED Лінійні світильники",
  "Акцентне освітлення": "Акцентне Освітлення",
  "LED філамент-лампи": "LED філаментні лампи",
  Перехідники: "Трійники та перехідники",
  Бра: "Вимикачі для бра",
  "Каучукові вироби": "Каучукові вилки та штепселя",
  Штепселі: "Штепселя",
  "Пилевологозахищена серія": "Пиловологозахисна серія",
  "Блоки розетка-вимикач": "Блоки (розетка + вимикач)",
  "Вимикачі прихованої установки": "Вимикачі (прихована установка)",
  "Розетки прихованої установки": "Розетки (прихована установка)",
  "Розетки відкритої установки": "Розетки",
  "Вимикачі відкритої установки": "Вимикачі",
  "Рамки": "Рамки (прихована установка)",
  "Рамки скляні JAZZ": "Рамки скляні серії jazz (прихована установка)",
  "Кнопки дзвінка": "Кнопки дзвінка (прихована установка)",
  "Розетки телефонні/комп'ютерні/телевізійні":
    "Розетки телефонні, комп'ютерні, телевізійні (прихована установка)",
  "Розетки телефонні/телевізійні (відкрита)": "Розетки (телефонні, телевізійні)",
};

export function normalizeCategory(category: string | null | undefined): string {
  const value = category?.trim();
  if (!value) return "Інше";
  return CATEGORY_ALIASES[value] ?? value;
}

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

export type CategoryGroup = { key: string; label: string; categories: string[] };

// Two-level category tree for the catalog's drill-down navigation (mirrors
// luxel.ua's own category mega-menu: a top-level group like "LED
// Освітлення", then its specific subcategories like "LED Прожектори" /
// "LED Панелі" / "Точкове освітлення"). Derived from the very same lookup
// tables deriveCategoryFromUrl() uses, so this can never drift out of sync
// with what products actually get categorized as.
export function getCategoryTree(): CategoryGroup[] {
  const groups: CategoryGroup[] = [];
  for (const [seg1, label] of Object.entries(TOP_LEVEL_FALLBACK)) {
    const cats = new Set<string>();
    cats.add(label); // the top-level fallback name is itself a valid category value

    if (seg1 === "elektrofurnitura") {
      for (const seg3Map of Object.values(ELEKTROFURNITURA_SEG3)) {
        for (const v of Object.values(seg3Map)) cats.add(v);
      }
      for (const v of Object.values(ELEKTROFURNITURA_SEG2_FALLBACK)) cats.add(v);
    }

    const seg2Map = SEG2_MAP[seg1];
    if (seg2Map) {
      for (const v of Object.values(seg2Map)) cats.add(v);
    }

// "LED Лінійні світильники" is a pure name-keyword override (luxel.ua files
    // linear luminaires under the same led_svetilniki URL bucket as every
    // other LED light fixture), so it can't be derived from the URL maps.
    if (seg1 === "svetodiodnoe--led--osveshhenie") cats.add("LED Лінійні світильники");

    groups.push({
      key: seg1,
      label,
      categories: Array.from(cats).sort((a, b) => a.localeCompare(b, "uk")),
    });
  }
  return groups;
}

// Primary categorization entry point: for the bulk export, the source
// subcategory is authoritative; for newly synced products, the URL-derived
// category is used. A few high-confidence name overrides handle products
// whose URL still points at an old or broad site bucket.
export function categorizeProduct(
  name: string,
  sourceUrl: string | null | undefined,
  existingFallback: string,
  sourceSubcategory?: string | null
): string {
  const urlCategory = sourceUrl ? deriveCategoryFromUrl(sourceUrl) : null;
  const hintedCategory = sourceSubcategory ? normalizeCategory(sourceSubcategory) : null;
  const base = urlCategory ?? hintedCategory ?? refineCategory(name, normalizeCategory(existingFallback));

  const n = name.toLowerCase();
  const sourcePath = sourceUrl?.toLowerCase() ?? "";

  // A product can move between site sections while keeping an old URL. The
  // product name is a useful, narrow correction for these high-confidence
  // cases and keeps newly synced products in the same buckets as the bulk
  // catalog.
  if (sourcePath.includes("-wifi-smart-tovari")) {
    return TOP_LEVEL_FALLBACK["-wifi-smart-tovari"];
  }
  if (n.includes("фітоламп")) return "LED Фітолампи";
  if (n.includes("фітосвітильник")) return "LED Фітосвітильники";
  if (n.includes("перехідник") || n.includes("розгалужувач") || n.includes("трійник")) {
    return "Трійники та перехідники";
  }
  if (n.includes("вимикач перехресн")) return "Вимикачі (прихована установка)";
  if (n.includes("зовнішн") && n.includes("розетк")) return "Розетки";
  if (n.includes("зовнішн") && n.includes("вимикач")) return "Вимикачі";
  if (n.includes("зовнішн") && n.includes("регулятор")) return "Регулятори яскравості";
  if (n.includes("прожектор")) return "LED Прожектори";
  if (n.includes("лінійн") && n.includes("світильник")) return "LED Лінійні світильники";
  if (n.includes("низьковольтн") && n.includes("ламп")) return "LED Низьковольтні лампи";

  // The source export contains the authoritative subcategory for the bulk
  // import. Keep it after the high-confidence name corrections above, while
  // still allowing the URL to place WiFi products in their own top group.
  if (hintedCategory) return hintedCategory;

  return normalizeCategory(base);
}
