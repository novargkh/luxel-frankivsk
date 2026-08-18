// Scrapes the "Всі характеристики" spec table from a luxel.ua product page.
//
// The page renders that table twice: a short teaser near the top of the
// page, and the full list inside a hidden #specsModal further down (the
// teaser's items are a subset of the modal's, plus the modal groups a
// second "Параметри" column in). Every occurrence uses the same markup:
//
//   <div class="product-detail__specifications-item">
//     <span class="product-detail__specifications-name">Label:</span>
//     <span class="product-detail__specifications-value">Value</span>
//   </div>
//
// Scanning the whole document and keeping the LAST value seen per label
// naturally lands on the modal's (fuller) version. The one exception is
// "Модель" — its value is filled in client-side by JS (the raw HTML has an
// unrendered `${productCode}` template placeholder), so it's skipped; we
// already have each product's article from its own name.

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const SPEC_ITEM_RE =
  /<span class="product-detail__specifications-name">([^<]+?)<\/span>\s*<span class="product-detail__specifications-value"[^>]*>([\s\S]*?)<\/span>/g;

function stripHtml(s: string): string {
  return s
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

export function parseSpecsFromHtml(html: string): Record<string, string> | null {
  const specs: Record<string, string> = {};
  for (const match of html.matchAll(SPEC_ITEM_RE)) {
    const label = match[1].replace(/:\s*$/, "").trim();
    if (!label || label === "Модель") continue;
    const value = stripHtml(match[2]);
    if (!value || value.includes("${")) continue;
    specs[label] = value;
  }
  return Object.keys(specs).length > 0 ? specs : null;
}

export async function fetchProductSpecs(productUrl: string): Promise<Record<string, string> | null> {
  try {
    const res = await fetch(productUrl, {
      headers: { "User-Agent": UA },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const html = await res.text();
    return parseSpecsFromHtml(html);
  } catch {
    return null;
  }
}
