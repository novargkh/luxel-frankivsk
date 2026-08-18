import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { extractAttributes } from "@/lib/similarity";

// Admin-only: imports "штук в упаковці" / "штук в ящику" packaging
// quantities from the wholesale price/packaging CSV, matched to existing
// products by article code. The CSV has no product id of its own — its
// "Артикул" column is the only reliable join key, so matching happens
// two ways: first against each product's own extracted article (the last
// "(...)" group in its name — same heuristic used for similarity/1С
// export), then, for anything left unmatched, a looser check for the CSV
// article appearing anywhere in the product name as a distinct token
// (catches names where the code isn't the last parenthesized group).
export const maxDuration = 30;

type ImportRow = {
  article: string;
  packQty: number | null;
  boxQty: number | null;
};

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function POST(req: Request) {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (role !== "ADMIN") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const rows = body?.rows as ImportRow[] | undefined;
  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: "Порожній або некоректний файл" }, { status: 400 });
  }

  const byArticle = new Map<string, ImportRow>();
  for (const row of rows) {
    const article = (row.article ?? "").trim();
    if (!article) continue;
    // A later duplicate article in the CSV wins — matches how a re-import
    // of a corrected file should behave.
    byArticle.set(article.toUpperCase(), row);
  }
  const articleKeys = Array.from(byArticle.keys()).filter((a) => a.length >= 3);
  // Longer codes first so a short code isn't matched inside a longer one
  // that also appears in the CSV.
  articleKeys.sort((a, b) => b.length - a.length);

  const products = await prisma.product.findMany({
    select: { id: true, name: true, packQty: true, boxQty: true },
  });

  let directMatched = 0;
  let fallbackMatched = 0;
  const updates: { id: string; packQty: number | null; boxQty: number | null }[] = [];

  for (const p of products) {
    const attrs = extractAttributes(p.name);
    const ownArticle = attrs.article?.trim().toUpperCase() ?? null;
    let match = ownArticle ? byArticle.get(ownArticle) : undefined;
    let matchedDirect = !!match;

    if (!match) {
      const upper = p.name.toUpperCase();
      for (const key of articleKeys) {
        const re = new RegExp(`(^|[^A-ZА-ЯЇІЄҐ0-9])${escapeRegExp(key)}([^A-ZА-ЯЇІЄҐ0-9]|$)`, "u");
        if (re.test(upper)) {
          match = byArticle.get(key);
          break;
        }
      }
    }

    if (!match) continue;
    if (matchedDirect) directMatched++;
    else fallbackMatched++;

    if (match.packQty !== p.packQty || match.boxQty !== p.boxQty) {
      updates.push({ id: p.id, packQty: match.packQty, boxQty: match.boxQty });
    }
  }

  const CONCURRENCY = 10;
  for (let i = 0; i < updates.length; i += CONCURRENCY) {
    const chunk = updates.slice(i, i + CONCURRENCY);
    await Promise.all(
      chunk.map((u) =>
        prisma.product.update({
          where: { id: u.id },
          data: { packQty: u.packQty, boxQty: u.boxQty },
        })
      )
    );
  }

  return NextResponse.json({
    csvRows: rows.length,
    matched: directMatched + fallbackMatched,
    directMatched,
    fallbackMatched,
    updated: updates.length,
    unmatchedProducts: products.length - directMatched - fallbackMatched,
  });
}
