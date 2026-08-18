"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import QtyInput from "@/components/QtyInput";
import { useCart } from "@/lib/cart";
import {
  extractAttributes,
  similarityScore,
  articleNumeric,
  type ProductAttributes,
} from "@/lib/similarity";
import { getCategoryTree, normalizeCategory } from "@/lib/categorize";

type ProductImage = { id: string; url: string };
type Product = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  stock: number;
  category: string | null;
  videoUrl: string | null;
  isPromo: boolean;
  promoText: string | null;
  isActive: boolean;
  packQty: number | null;
  boxQty: number | null;
  specs: Record<string, string> | null;
  images: ProductImage[];
};

type Announcement = { id: string; title: string; body: string; createdAt: string };
type Shop = { id: string; name: string; address: string };

const UNCATEGORIZED = "Інше";
const CATEGORY_TREE = getCategoryTree();

function StockBadge({ stock }: { stock: number }) {
  const inStock = stock > 0;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-slate-500 whitespace-nowrap">
      <span
        className={`inline-block w-1.5 h-1.5 rounded-full ${inStock ? "bg-emerald-500" : "bg-slate-300"}`}
      />
      {inStock ? "В наявності" : "Немає в наявності"}
    </span>
  );
}

// Шт. в упаковці / шт. в ящику — imported from the wholesale packaging CSV,
// matched to products by article. Only rendered once that data exists.
function PackagingInfo({
  packQty,
  boxQty,
  className,
}: {
  packQty: number | null;
  boxQty: number | null;
  className?: string;
}) {
  if (!packQty && !boxQty) return null;
  // Compact "100/20" (шт. в упаковці / шт. в ящику) instead of the old
  // verbose "Уп: 100 шт · Ящ: 20 шт" — matches the format the client
  // uses in their own price list. Falls back to "—" for whichever side
  // is missing so the slash always makes sense on its own.
  const text = `${packQty ?? "—"}/${boxQty ?? "—"}`;
  // No whitespace-nowrap by default — callers with plenty of horizontal
  // room can opt into it via className, but the default must be free to
  // wrap so this text can never force a narrow row wider than the screen.
  return (
    <span
      className={`text-[11px] text-slate-400 ${className ?? ""}`}
      title="Шт. в упаковці / шт. в ящику"
    >
      Уп/ящ: {text}
    </span>
  );
}

function SpecsButton({ onClick, className }: { onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`text-xs text-brand border border-brand/40 rounded-lg px-2 py-1 hover:bg-red-50 whitespace-nowrap ${className ?? ""}`}
    >
      Характеристики
    </button>
  );
}

// Full "Всі характеристики" table scraped from the product's luxel.ua page
// (admin-populated via "Оновити характеристики"). Renders on top of
// QuickViewModal when opened from there, hence the higher z-index.
function SpecsModal({ product, onClose }: { product: Product; onClose: () => void }) {
  // If this product hasn't been synced yet, fetch its specs on demand
  // (from its own luxel.ua page, same as the admin bulk sync does) instead
  // of just telling the person nothing's there — this is what makes
  // "Характеристики" work for every product right away, not only the ones
  // an admin has already batch-synced.
  const [specs, setSpecs] = useState<Record<string, string> | null>(product.specs);
  const [loading, setLoading] = useState(!product.specs);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (product.specs) {
      setSpecs(product.specs);
      setLoading(false);
      setFailed(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    fetch(`/api/products/${product.id}/specs`, { method: "POST" })
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then((data) => {
        if (cancelled) return;
        setSpecs(data.specs ?? null);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.id]);

  const entries = specs ? Object.entries(specs) : [];
  return (
    <div
      className="fixed inset-0 bg-slate-900/50 z-30 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl max-w-md w-full max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between p-4 border-b border-slate-100">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Характеристики</h2>
            <p className="text-xs text-slate-500 mt-0.5">{product.name}</p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-900 text-lg shrink-0 ml-4"
          >
            ✕
          </button>
        </div>
        <div className="p-4">
          {loading ? (
            <p className="text-sm text-slate-500">Завантаження характеристик...</p>
          ) : entries.length > 0 ? (
            <dl className="space-y-1.5">
              {entries.map(([label, value]) => (
                <div
                  key={label}
                  className="flex justify-between gap-3 text-sm border-b border-slate-50 pb-1.5"
                >
                  <dt className="text-slate-500">{label}</dt>
                  <dd className="text-slate-900 text-right">{value}</dd>
                </div>
              ))}
            </dl>
          ) : failed ? (
            <p className="text-sm text-slate-500">
              Не вдалося завантажити характеристики. Спробуйте ще раз пізніше.
            </p>
          ) : (
            <p className="text-sm text-slate-500">
              Для цього товару характеристики на luxel.ua не знайдено.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}


export default function CatalogPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [shops, setShops] = useState<Shop[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAnnouncements, setShowAnnouncements] = useState(true);

  const [search, setSearch] = useState("");
  // Category tree: a top-level group (e.g. "LED Освітлення") expands to
  // reveal its specific subcategories (e.g. "LED Прожектори"), which in
  // turn expand to show products — mirrors luxel.ua's own two-level
  // category menu, but as an in-place collapsible tree instead of a pair
  // of <select>s. Both levels start fully collapsed on entry; any number
  // of branches can be open at once (a real tree, not a single selection).
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // Extra attribute filters (потужність/колба/цоколь for lamps, колір for
  // electrofurniture, etc.) — shown inline under whichever subcategory is
  // expanded, scoped to just that subcategory's products, so multiple
  // expanded branches never fight over one global filter. Keyed
  // `${category}|${attrKey}` so different subcategories' selections don't
  // collide.
  const [attrFilterValues, setAttrFilterValues] = useState<Record<string, string>>({});
  const [promoOnly, setPromoOnly] = useState(false);
  const [inStockOnly, setInStockOnly] = useState(false);
  const [sortOrder, setSortOrder] = useState<"default" | "price-asc" | "price-desc" | "name-asc">(
    "default"
  );
  const [quickView, setQuickView] = useState<Product | null>(null);
  const [specsProduct, setSpecsProduct] = useState<Product | null>(null);
  // On mobile the extra filter controls (everything but search) live in a
  // collapsible panel so they don't permanently eat screen space in the
  // sticky bar — picking a value applies it and closes the panel.
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  const { cart, setQty, addOne } = useCart();

  // Filter bar sticks right below the navbar; the navbar's own height is
  // dynamic (it wraps onto multiple lines on narrow screens), so it's
  // measured live instead of hard-coded.
  const navRef = useRef<HTMLDivElement>(null);
  const [navHeight, setNavHeight] = useState(0);
  useEffect(() => {
    const el = navRef.current;
    if (!el) return;
    const update = () => setNavHeight(el.offsetHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener("resize", update);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);

  async function loadData() {
    setLoading(true);
    const [productsRes, announcementsRes, shopsRes] = await Promise.all([
      fetch("/api/products"),
      fetch("/api/announcements"),
      fetch("/api/shops"),
    ]);
    const productsData: Product[] = await productsRes.json();
    setProducts(productsData);
    setAnnouncements(await announcementsRes.json());
    setShops(await shopsRes.json());
    setLoading(false);
    // Deliberately does NOT auto-expand anything — the tree starts fully
    // collapsed on every visit, per how the catalog should greet someone
    // who just opened the cabinet.
  }

  useEffect(() => {
    loadData();
  }, []);

  // Regex-extracted attributes (series/brand, article, цоколь, колба, etc.)
  // per product — used for "similar products" ranking, search, and to
  // power the per-category attribute filters below.
  const attributesById = useMemo(() => {
    const map = new Map<string, ProductAttributes>();
    for (const p of products) map.set(p.id, extractAttributes(p.name));
    return map;
  }, [products]);

  const ATTR_FILTER_DEFS: {
    key: keyof ProductAttributes;
    label: string;
    format?: (v: string) => string;
  }[] = [
    { key: "series", label: "Серія" },
    { key: "color", label: "Колір", format: (v) => v[0].toUpperCase() + v.slice(1) },
    { key: "base", label: "Цоколь" },
    { key: "bulbShape", label: "Колба" },
    { key: "wattage", label: "Потужність", format: (v) => `${v} Вт` },
    { key: "colorTempK", label: "Температура кольору", format: (v) => `${v}K` },
    { key: "lengthM", label: "Довжина кабелю", format: (v) => `${v} м` },
    { key: "gangCount", label: "Кількість гнізд/клавіш", format: (v) => v },
  ];

  // Attribute filter options for ONE subcategory's own products — called
  // per expanded tree node (not a hook, since it runs inside a render
  // loop) so each open branch gets filters scoped to just its own
  // products instead of one global selection fighting over which
  // category is "active".
  function attrDefsFor(categoryProducts: Product[]) {
    if (categoryProducts.length === 0) return [];
    return ATTR_FILTER_DEFS.map((def) => {
      const values = new Set<string>();
      for (const p of categoryProducts) {
        const v = attributesById.get(p.id)?.[def.key];
        if (v !== null && v !== undefined) values.add(String(v));
      }
      if (values.size < 2) return null;
      const sortedValues = Array.from(values).sort((a, b) => {
        const na = Number(a);
        const nb = Number(b);
        if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
        return a.localeCompare(b, "uk");
      });
      return { ...def, options: sortedValues };
    }).filter((d): d is NonNullable<typeof d> => d !== null);
  }

  // Ukrainian-site-style search: matches name, description AND the series
  // (brand, e.g. AURA/JAZZ/DEBUT/OPERA) and article/SKU extracted from the
  // name, so searching "opera" or an article code works even though those
  // aren't literally always substrings shown as separate fields.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (q) {
        const attrs = attributesById.get(p.id);
        const haystack = [p.name, p.description ?? "", attrs?.series ?? "", attrs?.article ?? ""]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (promoOnly && !p.isPromo) return false;
      if (inStockOnly && p.stock <= 0) return false;
      // Attribute filters are namespaced per category ("category|attrKey")
      // since each expanded tree branch has its own independent set —
      // only the filters for THIS product's own category ever apply to it.
      const cat = normalizeCategory(p.category);
      for (const [key, val] of Object.entries(attrFilterValues)) {
        if (!val) continue;
        const [filterCat, attrKey] = key.split("|");
        if (filterCat !== cat) continue;
        const attrVal = attributesById.get(p.id)?.[attrKey as keyof ProductAttributes];
        if (attrVal === null || attrVal === undefined || String(attrVal) !== val) return false;
      }
      return true;
    });
  }, [
    products,
    search,
    promoOnly,
    inStockOnly,
    attrFilterValues,
    attributesById,
  ]);

  // Default order groups by series (brand) then by numeric article, instead
  // of raw insertion order — luxel.ua's article numbering allocates a
  // contiguous block per color/variant within a series (e.g. OPERA
  // 2001-2018 = білий, 2101-2108 = чорний, ...), so sorting numerically
  // keeps every color of the same product line together instead of
  // interleaving them.
  const sorted = useMemo(() => {
    const arr = [...filtered];
    switch (sortOrder) {
      case "price-asc":
        arr.sort((a, b) => a.price - b.price);
        break;
      case "price-desc":
        arr.sort((a, b) => b.price - a.price);
        break;
      case "name-asc":
        arr.sort((a, b) => a.name.localeCompare(b.name, "uk"));
        break;
      default:
        arr.sort((a, b) => {
          const aAttrs = attributesById.get(a.id);
          const bAttrs = attributesById.get(b.id);
          const aSeries = aAttrs?.series ?? "";
          const bSeries = bAttrs?.series ?? "";
          if (aSeries !== bSeries) {
            if (!aSeries) return 1;
            if (!bSeries) return -1;
            return aSeries.localeCompare(bSeries, "uk");
          }
          const aArt = articleNumeric(aAttrs?.article ?? null);
          const bArt = articleNumeric(bAttrs?.article ?? null);
          if (aArt !== bArt) return aArt - bArt;
          return a.name.localeCompare(b.name, "uk");
        });
        break;
    }
    return arr;
  }, [filtered, sortOrder, attributesById]);

  const grouped = useMemo(() => {
    const map = new Map<string, Product[]>();
    for (const p of sorted) {
      const key = normalizeCategory(p.category);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0], "uk"));
  }, [sorted]);

  // Two-level tree for rendering: top-level group -> its subcategories
  // present in the current (filtered/sorted) results -> their products.
  // Built from `grouped` so it naturally shrinks to just what matches a
  // search/filter, same as the old flat list did. A subcategory that
  // isn't part of the known static taxonomy (shouldn't normally happen)
  // falls into a catch-all "Інше" group instead of silently vanishing.
  const treeGroups = useMemo(() => {
    const groupedMap = new Map(grouped);
    const consumed = new Set<string>();
    const result: { key: string; label: string; categories: [string, Product[]][]; total: number }[] = [];
    for (const g of CATEGORY_TREE) {
      const categories = g.categories
        .filter((c) => groupedMap.has(c))
        .map((c): [string, Product[]] => {
          consumed.add(c);
          return [c, groupedMap.get(c)!];
        });
      if (categories.length === 0) continue;
      const total = categories.reduce((sum, [, items]) => sum + items.length, 0);
      result.push({ key: g.key, label: g.label, categories, total });
    }
    const leftover = grouped.filter(([c]) => !consumed.has(c));
    if (leftover.length > 0) {
      result.push({
        key: "__other__",
        label: UNCATEGORIZED,
        categories: leftover,
        total: leftover.reduce((sum, [, items]) => sum + items.length, 0),
      });
    }
    return result;
  }, [grouped]);

  const activeAttrFilterCount = Object.values(attrFilterValues).filter(Boolean).length;

  const isFiltering =
    search.trim().length > 0 || promoOnly || inStockOnly || activeAttrFilterCount > 0;

  function resetFilters() {
    setSearch("");
    setAttrFilterValues({});
    setPromoOnly(false);
    setInStockOnly(false);
    setSortOrder("default");
    setExpandedGroups(new Set());
    setExpanded(new Set());
  }

  // Count of "extra" filters (everything but search) — shown as a badge on
  // the mobile "Фільтри" toggle so it's clear something is active even
  // while the panel is collapsed.
  const activeExtraFilterCount =
    [promoOnly, inStockOnly, sortOrder !== "default"].filter(Boolean).length + activeAttrFilterCount;

  function toggleGroup(key: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleCategory(cat: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }

  function similarProducts(p: Product) {
    const cat = normalizeCategory(p.category);
    const baseAttrs = attributesById.get(p.id) ?? extractAttributes(p.name);
    const candidates = products.filter((x) => x.id !== p.id && normalizeCategory(x.category) === cat);
    const scored = candidates.map((c) => ({
      product: c,
      score: similarityScore(baseAttrs, attributesById.get(c.id) ?? extractAttributes(c.name)),
    }));
    // Best attribute match first (series/article/цоколь/колба/etc.); when
    // nothing matches (score 0 for everyone) this degrades gracefully to
    // the old category-only ordering, tie-broken by price proximity.
    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return Math.abs(a.product.price - p.price) - Math.abs(b.product.price - p.price);
    });
    return scored.slice(0, 12).map((s) => s.product);
  }

  const cartCount = Object.keys(cart).length;
  const cartTotal = useMemo(
    () =>
      Object.entries(cart).reduce((sum, [id, qty]) => {
        const p = products.find((x) => x.id === id);
        return sum + (p ? p.price * qty : 0);
      }, 0),
    [cart, products]
  );

  const profileIncomplete = !loading && shops.length === 0;

  return (
    <div className="min-h-screen flex flex-col">
      <div ref={navRef} className="sticky top-0 z-20">
        <Navbar />
      </div>

      <main className="max-w-6xl mx-auto w-full px-4 py-6 flex-1 pb-24">
        {profileIncomplete && (
          <div className="mb-6 rounded-xl border border-brand/30 bg-red-50 p-4 flex items-center justify-between gap-3 flex-wrap">
            <p className="text-sm text-slate-700">
              Щоб оформлювати замовлення, заповніть профіль і додайте хоча б один
              магазин (адресу доставки). Товари можна додавати в кошик вже зараз.
            </p>
            <Link
              href="/profile"
              className="bg-brand text-white text-sm rounded-lg px-4 py-2 hover:bg-brand-dark whitespace-nowrap"
            >
              Заповнити профіль
            </Link>
          </div>
        )}

        {announcements.length > 0 && showAnnouncements && (
          <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 relative">
            <button
              onClick={() => setShowAnnouncements(false)}
              className="absolute top-3 right-3 text-amber-700 text-sm hover:text-amber-900"
              aria-label="Приховати"
            >
              ✕
            </button>
            <h2 className="text-sm font-semibold text-amber-900 mb-2">Сповіщення</h2>
            <div className="space-y-2">
              {announcements.slice(0, 3).map((a) => (
                <div key={a.id} className="text-sm text-amber-900">
                  <span className="font-medium">{a.title}:</span> {a.body}
                </div>
              ))}
            </div>
          </div>
        )}

        <h1 className="text-lg font-semibold text-slate-900 mb-4">Каталог товарів</h1>

        {/* Search + filters — sticky under the navbar so it stays reachable
            while scrolling through a long, expanded catalog. On mobile the
            extra filters collapse into a toggled panel so they don't
            permanently eat screen space. */}
        <div
          className="sticky z-10 -mx-4 px-4 py-3 mb-5 bg-white/95 backdrop-blur-sm border-b border-slate-100"
          style={{ top: navHeight }}
        >
          {/* Row 1: search (always visible) + mobile filter toggle */}
          <div className="flex gap-2 items-center">
            <input
              placeholder="Пошук товару за назвою чи описом..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 min-w-0 border border-slate-300 rounded-lg px-3 py-2 text-sm"
            />
            <button
              onClick={() => setMobileFiltersOpen((v) => !v)}
              className="sm:hidden relative shrink-0 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-700 whitespace-nowrap"
            >
              Фільтри
              {activeExtraFilterCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[1.1rem] h-[1.1rem] px-1 rounded-full bg-brand text-white text-[10px] leading-[1.1rem] text-center">
                  {activeExtraFilterCount}
                </span>
              )}
            </button>
          </div>

          {/* Desktop: full filter row, always visible. Category navigation
              itself now lives in the collapsible tree below (group ->
              subcategory -> products) instead of a pair of <select>s. */}
          <div className="hidden sm:flex gap-2 items-center flex-wrap mt-2">
            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value as typeof sortOrder)}
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-full sm:w-auto"
            >
              <option value="default">Сортування: за замовчуванням</option>
              <option value="price-asc">Ціна: від дешевих</option>
              <option value="price-desc">Ціна: від дорогих</option>
              <option value="name-asc">За назвою (А-Я)</option>
            </select>
            <label className="flex items-center gap-1.5 text-sm text-slate-700 whitespace-nowrap">
              <input type="checkbox" checked={promoOnly} onChange={(e) => setPromoOnly(e.target.checked)} />
              Тільки акційні
            </label>
            <label className="flex items-center gap-1.5 text-sm text-slate-700 whitespace-nowrap">
              <input
                type="checkbox"
                checked={inStockOnly}
                onChange={(e) => setInStockOnly(e.target.checked)}
              />
              Тільки в наявності
            </label>
            {isFiltering && (
              <button
                onClick={resetFilters}
                className="text-sm text-slate-500 hover:text-slate-900 border border-slate-200 rounded-lg px-3 py-2 whitespace-nowrap"
              >
                Скинути фільтри
              </button>
            )}
          </div>

          {/* Mobile: collapsible filter panel — picking a select/checkbox
              value applies it immediately and closes the panel. */}
          {mobileFiltersOpen && (
            <div className="sm:hidden mt-2 border border-slate-200 rounded-lg p-3 bg-white space-y-2">
              <select
                value={sortOrder}
                onChange={(e) => {
                  setSortOrder(e.target.value as typeof sortOrder);
                  setMobileFiltersOpen(false);
                }}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              >
                <option value="default">Сортування: за замовчуванням</option>
                <option value="price-asc">Ціна: від дешевих</option>
                <option value="price-desc">Ціна: від дорогих</option>
                <option value="name-asc">За назвою (А-Я)</option>
              </select>
              <label className="flex items-center gap-1.5 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={promoOnly}
                  onChange={(e) => {
                    setPromoOnly(e.target.checked);
                    setMobileFiltersOpen(false);
                  }}
                />
                Тільки акційні
              </label>
              <label className="flex items-center gap-1.5 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={inStockOnly}
                  onChange={(e) => {
                    setInStockOnly(e.target.checked);
                    setMobileFiltersOpen(false);
                  }}
                />
                Тільки в наявності
              </label>
              <div className="flex gap-2 pt-1">
                {isFiltering && (
                  <button
                    onClick={() => {
                      resetFilters();
                      setMobileFiltersOpen(false);
                    }}
                    className="flex-1 text-sm text-slate-500 hover:text-slate-900 border border-slate-200 rounded-lg px-3 py-2"
                  >
                    Скинути
                  </button>
                )}
                <button
                  onClick={() => setMobileFiltersOpen(false)}
                  className="flex-1 bg-brand text-white text-sm rounded-lg px-3 py-2 hover:bg-brand-dark"
                >
                  Готово
                </button>
              </div>
            </div>
          )}
        </div>

        {loading ? (
          <p className="text-sm text-slate-500">Завантаження...</p>
        ) : treeGroups.length === 0 ? (
          <p className="text-sm text-slate-500">Нічого не знайдено.</p>
        ) : (
          <div className="space-y-3">
            {treeGroups.map((g) => {
              const groupOpen = isFiltering || expandedGroups.has(g.key);
              return (
                <div key={g.key} className="border border-slate-200 bg-white rounded-xl overflow-hidden">
                  <button
                    onClick={() => toggleGroup(g.key)}
                    className="w-full flex items-center justify-between px-4 py-3 bg-slate-100 hover:bg-slate-200 text-left"
                  >
                    <span className="text-sm font-semibold text-slate-900">
                      {g.label}{" "}
                      <span className="text-xs font-normal text-slate-400">({g.total})</span>
                    </span>
                    <span
                      className={`text-slate-400 transition-transform ${groupOpen ? "rotate-180" : ""}`}
                    >
                      ▾
                    </span>
                  </button>

                  {groupOpen && (
                    <div>
                      {/* Keep the complete subcategory list together above
                          any products. Otherwise opening one subcategory
                          pushes the remaining subcategories below its
                          product cards on a long mobile catalog. */}
                      <div className="divide-y divide-slate-100">
                        {g.categories.map(([category, items]) => {
                          const isSameAsGroup = category === g.label;
                          if (isSameAsGroup) return null;
                          const isOpen = isFiltering || expanded.has(category);
                          return (
                            <button
                              key={category}
                              onClick={() => toggleCategory(category)}
                              className="w-full flex items-center justify-between px-4 py-2.5 pl-6 bg-slate-50 hover:bg-slate-100 text-left"
                            >
                              <span className="text-sm font-medium text-slate-800">
                                {category}{" "}
                                <span className="text-xs font-normal text-slate-400">({items.length})</span>
                              </span>
                              <span
                                className={`text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
                              >
                                ▾
                              </span>
                            </button>
                          );
                        })}
                      </div>

                      {/* Product sections are deliberately rendered only
                          after the full subcategory menu. Multiple open
                          subcategories can still show their products here. */}
                      <div className="divide-y divide-slate-100">
                        {g.categories.map(([category, items]) => {
                          // A broad top-level category with no real child
                          // (for example "Аксесуари") renders directly here
                          // without a duplicate same-name subcategory row.
                          const isSameAsGroup = category === g.label;
                          const isOpen = isSameAsGroup || isFiltering || expanded.has(category);
                          if (!isOpen) return null;
                          const attrDefs = attrDefsFor(items);

                          return (
                            <div key={`products-${category}`}>
                              {attrDefs.length > 0 && (
                                <div className="flex gap-2 flex-wrap px-4 py-2 bg-white border-b border-slate-100">
                                  {attrDefs.map((def) => {
                                    const filterKey = `${category}|${def.key}`;
                                    return (
                                      <select
                                        key={def.key}
                                        value={attrFilterValues[filterKey] ?? ""}
                                        onChange={(e) =>
                                          setAttrFilterValues((prev) => ({
                                            ...prev,
                                            [filterKey]: e.target.value,
                                          }))
                                        }
                                        className="border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-700"
                                      >
                                        <option value="">{def.label}: всі</option>
                                        {def.options.map((v) => (
                                          <option key={v} value={v}>
                                            {def.format ? def.format(v) : v}
                                          </option>
                                        ))}
                                      </select>
                                    );
                                  })}
                                </div>
                              )}
                              <div className="divide-y divide-slate-100">
                                {items.map((p) => (
                                  <ProductRow
                                    key={p.id}
                                    product={p}
                                    qty={cart[p.id] ?? 0}
                                    onQty={(q) => setQty(p.id, q)}
                                    onOpen={() => setQuickView(p)}
                                  />
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Sticky mini-cart bar */}
      {cartCount > 0 && (
        <div className="no-print fixed bottom-0 inset-x-0 border-t border-slate-200 bg-white shadow-[0_-2px_10px_rgba(0,0,0,0.06)] z-10">
          <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
            <span className="text-sm text-slate-600">
              У кошику: <span className="font-semibold text-slate-900">{cartCount}</span>{" "}
              {cartCount === 1 ? "товар" : "товарів"} на{" "}
              <span className="font-semibold text-slate-900">
                {cartTotal.toLocaleString("uk-UA")} ₴
              </span>
            </span>
            <Link
              href="/cart"
              className="bg-brand text-white text-sm rounded-lg px-4 py-2 hover:bg-brand-dark whitespace-nowrap"
            >
              Перейти до кошика →
            </Link>
          </div>
        </div>
      )}

      {quickView && (
        <QuickViewModal
          product={quickView}
          qty={cart[quickView.id] ?? 0}
          onQty={(q) => setQty(quickView.id, q)}
          onAdd={() => addOne(quickView.id)}
          onClose={() => setQuickView(null)}
          similar={similarProducts(quickView)}
          onSelectSimilar={(p) => setQuickView(p)}
          onShowSpecs={() => setSpecsProduct(quickView)}
        />
      )}

      {specsProduct && (
        <SpecsModal product={specsProduct} onClose={() => setSpecsProduct(null)} />
      )}
    </div>
  );
}

function ProductRow({
  product,
  qty,
  onQty,
  onOpen,
}: {
  product: Product;
  qty: number;
  onQty: (q: number) => void;
  onOpen: () => void;
}) {
  const qtyControls = (
    <div className="shrink-0 flex items-center gap-1">
      <QtyInput
        value={qty}
        max={product.stock}
        disabled={product.stock <= 0}
        onChange={onQty}
        className="w-14 border border-slate-300 rounded-lg px-2 py-1 text-sm disabled:bg-slate-100"
      />
      <button
        disabled={product.stock <= 0}
        onClick={() => onQty(qty + 1)}
        className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 hover:bg-slate-100 disabled:opacity-40"
      >
        +1
      </button>
    </div>
  );

  return (
    <div className="px-4 py-3 hover:bg-slate-50 transition">
      {/* Image + name always share the top line, full width, so the name
          gets real space instead of being squeezed by price/qty columns. */}
      <div className="flex items-center gap-3">
        <button
          onClick={onOpen}
          className="shrink-0 w-14 h-14 rounded-lg bg-slate-100 overflow-hidden relative"
        >
          {product.images[0] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={product.images[0].url}
              alt={product.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-slate-300 text-[10px]">
              немає фото
            </div>
          )}
          {product.isPromo && (
            <span className="absolute -top-1 -left-1 bg-brand text-white text-[9px] px-1 rounded">
              %
            </span>
          )}
        </button>

        <button onClick={onOpen} className="flex-1 min-w-0 text-left">
          <div className="text-sm font-medium text-slate-900 line-clamp-2 sm:truncate">
            {product.name}
          </div>
          {product.description && (
            <div className="hidden sm:block text-xs text-slate-500 truncate">
              {product.description}
            </div>
          )}
          {product.isPromo && product.promoText && (
            <div className="hidden sm:block text-xs text-brand truncate">{product.promoText}</div>
          )}
          <PackagingInfo packQty={product.packQty} boxQty={product.boxQty} className="hidden sm:inline-block mt-0.5" />
        </button>

        <div className="hidden sm:flex w-28 shrink-0 justify-end">
          <StockBadge stock={product.stock} />
        </div>

        <div className="hidden sm:block text-sm font-semibold text-slate-900 w-24 shrink-0 text-right">
          {product.price.toLocaleString("uk-UA")} ₴
        </div>

        <div className="hidden sm:flex">{qtyControls}</div>
      </div>

      {/* Price + stock + qty move to a second line on mobile so the row
          never forces horizontal scrolling on narrow screens. The price/
          stock/packaging block gets min-w-0 so its text can wrap instead
          of forcing the row wider than the screen and clipping qtyControls
          off the edge (the card wrapper clips overflow rather than
          scrolling it) — qtyControls itself is shrink-0 so it always stays
          fully visible. */}
      <div className="flex sm:hidden items-start justify-between gap-2 mt-2 pl-[68px]">
        <div className="flex flex-col min-w-0">
          <span className="text-sm font-semibold text-slate-900">
            {product.price.toLocaleString("uk-UA")} ₴
          </span>
          <StockBadge stock={product.stock} />
          <PackagingInfo
            packQty={product.packQty}
            boxQty={product.boxQty}
            className="mt-0.5 whitespace-normal"
          />
        </div>
        <div className="shrink-0">{qtyControls}</div>
      </div>
    </div>
  );
}

function QuickViewModal({
  product,
  qty,
  onQty,
  onAdd,
  onClose,
  similar,
  onSelectSimilar,
  onShowSpecs,
}: {
  product: Product;
  qty: number;
  onQty: (q: number) => void;
  onAdd: () => void;
  onClose: () => void;
  similar: Product[];
  onSelectSimilar: (p: Product) => void;
  onShowSpecs: () => void;
}) {
  return (
    <div
      className="fixed inset-0 bg-slate-900/50 z-20 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between p-4 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-900 pr-6">{product.name}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-900 text-lg">
            ✕
          </button>
        </div>

        <div className="p-4 grid sm:grid-cols-2 gap-4">
          <div className="aspect-square bg-slate-100 rounded-lg overflow-hidden">
            {product.images[0] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={product.images[0].url}
                alt={product.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-slate-300 text-xs">
                немає фото
              </div>
            )}
          </div>

          <div className="flex flex-col">
            {product.category && (
              <span className="text-xs text-slate-400 mb-1">{normalizeCategory(product.category)}</span>
            )}
            {product.description && (
              <p className="text-sm text-slate-600 mb-2">{product.description}</p>
            )}
            {product.isPromo && product.promoText && (
              <p className="text-sm text-brand mb-2">{product.promoText}</p>
            )}
            {product.videoUrl && (
              <video src={product.videoUrl} controls className="rounded-lg w-full mb-2" />
            )}

            <div className="mt-auto pt-2">
              <div className="text-xl font-semibold text-slate-900 mb-1">
                {product.price.toLocaleString("uk-UA")} ₴
              </div>
              <div className="flex items-center gap-3 mb-3">
                <StockBadge stock={product.stock} />
                <PackagingInfo packQty={product.packQty} boxQty={product.boxQty} />
              </div>

              <div className="flex items-center gap-2 mb-2">
                <QtyInput
                  value={qty}
                  max={product.stock}
                  disabled={product.stock <= 0}
                  onChange={onQty}
                  className="w-16 border border-slate-300 rounded-lg px-2 py-1.5 text-sm disabled:bg-slate-100"
                />
                <button
                  disabled={product.stock <= 0}
                  onClick={onAdd}
                  className="flex-1 bg-brand text-white rounded-lg py-1.5 text-sm font-medium hover:bg-brand-dark disabled:opacity-50"
                >
                  Додати в кошик
                </button>
              </div>
              <SpecsButton onClick={onShowSpecs} className="w-full text-center" />
            </div>
          </div>
        </div>

        {similar.length > 0 && (
          <div className="border-t border-slate-100 p-4">
            <h3 className="text-sm font-semibold text-slate-900 mb-2">Схожі товари</h3>
            <div className="flex gap-3 overflow-x-auto pb-1">
              {similar.map((s) => (
                <button
                  key={s.id}
                  onClick={() => onSelectSimilar(s)}
                  className="shrink-0 w-28 text-left"
                >
                  <div className="w-28 h-28 rounded-lg bg-slate-100 overflow-hidden mb-1">
                    {s.images[0] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={s.images[0].url}
                        alt={s.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-300 text-[10px]">
                        немає фото
                      </div>
                    )}
                  </div>
                  <div className="text-xs text-slate-700 line-clamp-2">{s.name}</div>
                  <div className="text-xs font-semibold text-slate-900">
                    {s.price.toLocaleString("uk-UA")} ₴
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
