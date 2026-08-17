import { prisma } from "@/lib/prisma";
import { refineCategory } from "@/lib/categorize";

// Syncs new products from luxel.ua into the local catalog.
//
// How it works: luxel.ua's product listing pages render their grid via a
// client-side AJAX filter widget, so a plain server-side fetch of a category
// page returns an empty product grid. Their sitemap.xml, however, is fully
// server-rendered and includes an <image:image> entry (name + photo URL) for
// every product page — that's the reliable data source used here. Price
// isn't in the sitemap, so it's fetched from each new product's own detail
// page (which *is* server-rendered).
//
// Images for newly-synced products are hotlinked to luxel.ua rather than
// downloaded, since Vercel's serverless filesystem is read-only at runtime
// (the original 874-product bulk import has its own locally-hosted copies
// under public/catalog/ — this only affects products added after that).

const SITEMAP_URL = "https://luxel.ua/sitemap.xml";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// Cap how many brand-new products a single sync call will fetch prices for
// and insert, so one click can't run past a serverless function's time
// limit. If more remain, the admin just clicks the button again.
const MAX_NEW_PER_RUN = 100;
const PRICE_FETCH_CONCURRENCY = 5;

type SitemapProduct = {
  url: string;
  imageUrl: string;
  name: string;
};

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'");
}

function parseSitemap(xml: string): SitemapProduct[] {
  const products: SitemapProduct[] = [];
  const urlBlocks = xml.match(/<url>[\s\S]*?<\/url>/g) || [];

  for (const block of urlBlocks) {
    if (!block.includes("<image:image>")) continue; // category/info page, not a product

    const loc = block.match(/<loc>([\s\S]*?)<\/loc>/)?.[1]?.trim();
    const imageUrl = block.match(/<image:loc>([\s\S]*?)<\/image:loc>/)?.[1]?.trim();
    const name = block.match(/<image:caption>([\s\S]*?)<\/image:caption>/)?.[1]?.trim();

    if (loc && imageUrl && name) {
      products.push({
        url: decodeXmlEntities(loc),
        imageUrl: decodeXmlEntities(imageUrl),
        name: decodeXmlEntities(name),
      });
    }
  }

  return products;
}

const CATEGORY_BY_URL_SEGMENT: Record<string, string> = {
  "svetodiodnie--led--lampi": "LED Лампи",
  "svetodiodnoe--led--osveshhenie": "LED Освітлення",
  "svetodiodnoe--led--fitoosveshhenie": "Фітоосвітлення",
  elektrofurnitura: "Електрофурнітура",
  "-wifi-smart-tovari": "WiFi Smart",
  udliniteli: "Подовжувачі",
  aksessuari: "Аксесуари",
  generatori: "Генератори",
};

function categoryFromUrl(productUrl: string): string {
  try {
    const segment = new URL(productUrl).pathname.replace(/^\//, "").split("/")[0];
    return CATEGORY_BY_URL_SEGMENT[segment] ?? "Інше";
  } catch {
    return "Інше";
  }
}

async function fetchPrice(productUrl: string): Promise<number | null> {
  try {
    const res = await fetch(productUrl, {
      headers: { "User-Agent": UA },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const html = await res.text();
    const match = html.match(/product-detail__price-current">\s*([\d.,]+)/);
    if (!match) return null;
    const price = parseFloat(match[1].replace(",", "."));
    return Number.isFinite(price) ? price : null;
  } catch {
    return null;
  }
}

export type LuxelSyncResult = {
  totalOnSite: number;
  newFound: number;
  processedThisRun: number;
  added: number;
  remaining: number;
  failed: { url: string; name: string; reason: string }[];
};

export async function syncFromLuxel(): Promise<LuxelSyncResult> {
  const res = await fetch(SITEMAP_URL, {
    headers: { "User-Agent": UA },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Не вдалося завантажити sitemap.xml з luxel.ua (HTTP ${res.status})`);
  }
  const xml = await res.text();
  const siteProducts = parseSitemap(xml);

  const existing = await prisma.product.findMany({
    where: { sourceUrl: { not: null } },
    select: { sourceUrl: true },
  });
  const existingUrls = new Set(existing.map((p) => p.sourceUrl));

  const newOnes = siteProducts.filter((p) => !existingUrls.has(p.url));
  const batch = newOnes.slice(0, MAX_NEW_PER_RUN);

  const failed: { url: string; name: string; reason: string }[] = [];
  let added = 0;

  for (let i = 0; i < batch.length; i += PRICE_FETCH_CONCURRENCY) {
    const chunk = batch.slice(i, i + PRICE_FETCH_CONCURRENCY);
    await Promise.all(
      chunk.map(async (p) => {
        const price = await fetchPrice(p.url);
        if (price === null) {
          failed.push({ url: p.url, name: p.name, reason: "не вдалося визначити ціну" });
          return;
        }
        try {
          const category = refineCategory(p.name, categoryFromUrl(p.url));
          await prisma.product.create({
            data: {
              name: p.name,
              description: category,
              price,
              stock: 20,
              category,
              isActive: true,
              sourceUrl: p.url,
              images: { create: [{ url: p.imageUrl }] },
            },
          });
          added++;
        } catch (e) {
          failed.push({
            url: p.url,
            name: p.name,
            reason: e instanceof Error ? e.message : "помилка запису в базу",
          });
        }
      })
    );
  }

  return {
    totalOnSite: siteProducts.length,
    newFound: newOnes.length,
    processedThisRun: batch.length,
    added,
    remaining: Math.max(0, newOnes.length - batch.length),
    failed,
  };
}
