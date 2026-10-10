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
    <span className="inline-flex items-center gap-1.5 text-[13px] text-muted whitespace-nowrap">
      <span
        className={`inline-block w-1.5 h-1.5 rounded-full ${inStock ? "bg-emerald-500" : "bg-black/20"}`}
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
      className={`text-xs text-muted/80 tabular ${className ?? ""}`}
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
      className={`h-10 inline-flex items-center justify-center text-sm font-medium text-ink rounded-full ring-1 ring-black/15 hover:ring-black/35 transition-shadow whitespace-nowrap ${className ?? ""}`}
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
      className="fixed inset-0 bg-ink/50 backdrop-blur-sm z-40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl max-w-md w-full max-h-[80vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between p-5 border-b border-black/[0.06]">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-ink">Характеристики</h2>
            <p className="text-xs text-muted mt-0.5">{product.name}</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Закрити"
            className="shrink-0 ml-4 w-9 h-9 inline-flex items-center justify-center rounded-full bg-paper text-ink hover:bg-black/10 transition-colors"
          >
            <CloseIcon size={14} />
          </button>
        </div>
        <div className="p-5">
          {loading ? (
            <p className="text-sm text-muted">Завантаження характеристик...</p>
          ) : entries.length > 0 ? (
            <dl className="space-y-2">
              {entries.map(([label, value]) => (
                <div
                  key={label}
                  className="flex justify-between gap-4 text-sm border-b border-black/[0.05] pb-2"
                >
                  <dt className="text-muted">{label}</dt>
                  <dd className="text-ink text-right font-medium">{value}</dd>
                </div>
              ))}
            </dl>
          ) : failed ? (
            <p className="text-sm text-muted">
              Не вдалося завантажити характеристики. Спробуйте ще раз пізніше.
            </p>
          ) : (
            <p className="text-sm text-muted">
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

  const heroCount = products.length;

  return (
    <div className="min-h-screen flex flex-col">
      <div ref={navRef} className="sticky top-0 z-20">
        <Navbar />
      </div>

      <main className="max-w-6xl mx-auto w-full px-4 sm:px-6 pt-8 sm:pt-12 flex-1 pb-32">
        {profileIncomplete && (
          <div className="mb-6 rounded-2xl bg-brand/[0.06] ring-1 ring-brand/20 p-4 sm:p-5 flex items-center justify-between gap-4 flex-wrap">
            <p className="text-sm leading-relaxed text-ink/80 max-w-xl">
              Щоб оформлювати замовлення, заповніть профіль і додайте хоча б один
              магазин (адресу доставки). Товари можна додавати в кошик вже зараз.
            </p>
            <Link
              href="/profile"
              className="inline-flex items-center h-10 rounded-full bg-ink text-white text-sm font-medium px-5 hover:bg-black transition-colors whitespace-nowrap"
            >
              Заповнити профіль
            </Link>
          </div>
        )}

        {announcements.length > 0 && showAnnouncements && (
          <section className="mb-8 rounded-2xl bg-white ring-1 ring-black/[0.06] shadow-[0_1px_2px_rgba(23,20,15,0.04)] p-5 relative">
            <button
              onClick={() => setShowAnnouncements(false)}
              className="absolute top-3 right-3 w-8 h-8 inline-flex items-center justify-center rounded-full text-muted hover:text-ink hover:bg-paper transition-colors"
              aria-label="Приховати"
            >
              <CloseIcon size={14} />
            </button>
            <h2 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted mb-3">
              <span className="w-1.5 h-1.5 rounded-full bg-brand" />
              Сповіщення
            </h2>
            <div className="space-y-2 pr-8">
              {announcements.slice(0, 3).map((a) => (
                <p key={a.id} className="text-sm leading-relaxed text-ink/85">
                  <span className="font-semibold text-ink">{a.title}.</span> {a.body}
                </p>
              ))}
            </div>
          </section>
        )}

        <header className="mb-8 sm:mb-10">
          <p className="text-[11px] sm:text-xs font-semibold uppercase tracking-[0.2em] text-brand mb-3">
            Оптовий кабінет LUXEL
          </p>
          <h1 className="text-[40px] leading-[1.02] sm:text-6xl font-semibold tracking-[-0.035em] text-ink">
            Каталог товарів
          </h1>
          {!loading && heroCount > 0 && (
            <p className="mt-3 sm:mt-4 text-[15px] sm:text-lg text-muted tracking-[-0.01em] tabular">
              {heroCount.toLocaleString("uk-UA")} {plural(heroCount, "позиція", "позиції", "позицій")} в
              каталозі
            </p>
          )}
        </header>

        {/* Search + filters — sticky under the navbar so it stays reachable
            while scrolling through a long, expanded catalog. On mobile the
            extra filters collapse into a toggled panel so they don't
            permanently eat screen space. */}
        <div
          className="sticky z-10 -mx-4 sm:-mx-6 px-4 sm:px-6 py-3 mb-6 bg-paper/85 backdrop-blur-xl"
          style={{ top: navHeight }}
        >
          {/* Row 1: search (always visible) + mobile filter toggle */}
          <div className="flex gap-2 items-center">
            <div className="relative flex-1 min-w-0">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted pointer-events-none">
                <SearchIcon />
              </span>
              <input
                type="text"
                inputMode="search"
                placeholder="Назва або артикул"
                aria-label="Пошук товару"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full h-12 rounded-2xl bg-white pl-11 pr-11 text-[15px] text-ink placeholder:text-muted/70 ring-1 ring-black/10 shadow-[0_1px_2px_rgba(23,20,15,0.04)] focus:outline-none focus-visible:outline-none focus:ring-2 focus:ring-ink transition-shadow"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  aria-label="Очистити пошук"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 w-8 h-8 inline-flex items-center justify-center rounded-full text-muted hover:text-ink hover:bg-paper transition-colors"
                >
                  <CloseIcon size={14} />
                </button>
              )}
            </div>
            <button
              onClick={() => setMobileFiltersOpen((v) => !v)}
              aria-expanded={mobileFiltersOpen}
              className="sm:hidden relative shrink-0 h-12 inline-flex items-center gap-2 rounded-2xl bg-white px-4 text-sm font-medium text-ink ring-1 ring-black/10 whitespace-nowrap"
            >
              <FilterIcon />
              Фільтри
              {activeExtraFilterCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[1.25rem] h-5 px-1 rounded-full bg-brand text-white text-[11px] leading-5 text-center font-semibold">
                  {activeExtraFilterCount}
                </span>
              )}
            </button>
          </div>

          {/* Desktop: full filter row, always visible. Category navigation
              itself lives in the collapsible tree below (group ->
              subcategory -> products). */}
          <div className="hidden sm:flex gap-2 items-center flex-wrap mt-3">
            <div className="relative">
              <select
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value as typeof sortOrder)}
                aria-label="Сортування"
                className="appearance-none h-10 rounded-full bg-white pl-4 pr-9 text-sm font-medium text-ink ring-1 ring-black/10 hover:ring-black/25 transition-shadow cursor-pointer"
              >
                <option value="default">Сортування: за замовчуванням</option>
                <option value="price-asc">Ціна: від дешевих</option>
                <option value="price-desc">Ціна: від дорогих</option>
                <option value="name-asc">За назвою (А-Я)</option>
              </select>
              <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none">
                <Chevron size={14} />
              </span>
            </div>
            <ToggleChip active={promoOnly} onClick={() => setPromoOnly((v) => !v)}>
              Тільки акційні
            </ToggleChip>
            <ToggleChip active={inStockOnly} onClick={() => setInStockOnly((v) => !v)}>
              Тільки в наявності
            </ToggleChip>
            {isFiltering && (
              <button
                onClick={resetFilters}
                className="h-10 rounded-full px-3 text-sm text-muted hover:text-ink underline-offset-4 hover:underline transition-colors whitespace-nowrap"
              >
                Скинути фільтри
              </button>
            )}
          </div>

          {/* Mobile: collapsible filter panel — picking a select/toggle
              value applies it immediately and closes the panel. */}
          {mobileFiltersOpen && (
            <div className="sm:hidden mt-2 rounded-2xl bg-white ring-1 ring-black/10 shadow-lg p-4 space-y-3">
              <div className="relative">
                <select
                  value={sortOrder}
                  onChange={(e) => {
                    setSortOrder(e.target.value as typeof sortOrder);
                    setMobileFiltersOpen(false);
                  }}
                  aria-label="Сортування"
                  className="appearance-none w-full h-11 rounded-xl bg-paper pl-4 pr-9 text-sm font-medium text-ink"
                >
                  <option value="default">Сортування: за замовчуванням</option>
                  <option value="price-asc">Ціна: від дешевих</option>
                  <option value="price-desc">Ціна: від дорогих</option>
                  <option value="name-asc">За назвою (А-Я)</option>
                </select>
                <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none">
                  <Chevron size={14} />
                </span>
              </div>
              <div className="flex gap-2 flex-wrap">
                <ToggleChip
                  active={promoOnly}
                  onClick={() => {
                    setPromoOnly((v) => !v);
                    setMobileFiltersOpen(false);
                  }}
                >
                  Тільки акційні
                </ToggleChip>
                <ToggleChip
                  active={inStockOnly}
                  onClick={() => {
                    setInStockOnly((v) => !v);
                    setMobileFiltersOpen(false);
                  }}
                >
                  Тільки в наявності
                </ToggleChip>
              </div>
              <div className="flex gap-2 pt-1">
                {isFiltering && (
                  <button
                    onClick={() => {
                      resetFilters();
                      setMobileFiltersOpen(false);
                    }}
                    className="flex-1 h-11 rounded-full text-sm font-medium text-ink ring-1 ring-black/15"
                  >
                    Скинути
                  </button>
                )}
                <button
                  onClick={() => setMobileFiltersOpen(false)}
                  className="flex-1 h-11 rounded-full bg-ink text-white text-sm font-medium"
                >
                  Готово
                </button>
              </div>
            </div>
          )}
        </div>

        {isFiltering && !loading && (
          <p className="mb-4 text-sm text-muted tabular">
            Знайдено: <span className="text-ink font-medium">{filtered.length}</span>
          </p>
        )}

        {loading ? (
          <div className="space-y-3" aria-busy="true" aria-label="Завантаження каталогу">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="h-[76px] sm:h-[88px] rounded-2xl bg-white ring-1 ring-black/[0.06] animate-pulse flex items-center gap-4 px-5"
              >
                <div className="w-6 h-3 rounded bg-paper" />
                <div className="h-5 rounded bg-paper" style={{ width: `${30 + ((i * 13) % 30)}%` }} />
                <div className="ml-auto w-9 h-9 rounded-full bg-paper" />
              </div>
            ))}
          </div>
        ) : treeGroups.length === 0 ? (
          <div className="rounded-2xl bg-white ring-1 ring-black/[0.06] px-6 py-14 text-center">
            <p className="text-lg font-semibold tracking-tight text-ink">Нічого не знайдено</p>
            <p className="mt-1 text-sm text-muted">Спробуйте змінити запит або прибрати фільтри.</p>
            {isFiltering && (
              <button
                onClick={resetFilters}
                className="mt-5 h-10 rounded-full bg-ink text-white text-sm font-medium px-5"
              >
                Скинути фільтри
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {treeGroups.map((g, gi) => {
              const groupOpen = isFiltering || expandedGroups.has(g.key);
              return (
                <section
                  key={g.key}
                  className={`rounded-2xl bg-white ring-1 overflow-hidden transition-shadow duration-300 ${
                    groupOpen
                      ? "ring-black/10 shadow-[0_10px_30px_-12px_rgba(23,20,15,0.18)]"
                      : "ring-black/[0.06] shadow-[0_1px_2px_rgba(23,20,15,0.04)] hover:ring-black/15"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => toggleGroup(g.key)}
                    aria-expanded={groupOpen}
                    className="w-full flex items-center gap-3 sm:gap-5 px-4 sm:px-6 py-4 sm:py-5 text-left"
                  >
                    <span
                      className={`w-6 sm:w-8 shrink-0 text-xs font-semibold tabular tracking-wider transition-colors ${
                        groupOpen ? "text-brand" : "text-muted/70"
                      }`}
                    >
                      {String(gi + 1).padStart(2, "0")}
                    </span>
                    <span className="flex-1 min-w-0 text-[17px] sm:text-2xl font-semibold tracking-[-0.02em] text-ink">
                      {g.label}
                    </span>
                    <span className="shrink-0 rounded-full bg-paper px-2.5 py-1 text-xs font-medium text-muted tabular">
                      {g.total}
                    </span>
                    <span
                      className={`shrink-0 w-8 h-8 inline-flex items-center justify-center rounded-full transition-all duration-300 ${
                        groupOpen ? "bg-ink text-white rotate-180" : "bg-paper text-ink"
                      }`}
                    >
                      <Chevron size={16} />
                    </span>
                  </button>

                  {groupOpen && (
                    <div className="border-t border-black/[0.06]">
                      {/* Each subcategory owns its expanding product section:
                          button -> its filters -> its products -> next button. */}
                      <div className="divide-y divide-black/[0.06]">
                        {g.categories.map(([category, items]) => {
                          // A broad top-level category with no real child
                          // (for example "Аксесуари") renders its products
                          // directly without a duplicate same-name row.
                          const isSameAsGroup = category === g.label;
                          const isOpen = isSameAsGroup || isFiltering || expanded.has(category);
                          const attrDefs = attrDefsFor(items);

                          return (
                            <div key={category}>
                              {!isSameAsGroup && (
                                <button
                                  type="button"
                                  onClick={() => toggleCategory(category)}
                                  aria-expanded={isOpen}
                                  className={`w-full flex items-center gap-3 pl-[52px] sm:pl-[76px] pr-4 sm:pr-6 py-3.5 text-left transition-colors ${
                                    isOpen ? "bg-paper/70" : "hover:bg-paper/50"
                                  }`}
                                >
                                  <span
                                    className={`flex-1 min-w-0 text-[15px] sm:text-base font-medium tracking-[-0.01em] ${
                                      isOpen ? "text-ink" : "text-ink/80"
                                    }`}
                                  >
                                    {category}
                                  </span>
                                  <span className="text-xs text-muted tabular">{items.length}</span>
                                  <span
                                    className={`shrink-0 transition-all duration-300 ${
                                      isOpen ? "text-brand rotate-180" : "text-muted"
                                    }`}
                                  >
                                    <Chevron size={16} />
                                  </span>
                                </button>
                              )}

                              <div
                                className={`grid overflow-hidden transition-all duration-300 ease-out ${
                                  isOpen
                                    ? "grid-rows-[1fr] opacity-100 pointer-events-auto"
                                    : "grid-rows-[0fr] opacity-0 pointer-events-none"
                                }`}
                                aria-hidden={!isOpen}
                              >
                                <div className="min-h-0 overflow-hidden">
                                  {attrDefs.length > 0 && (
                                    <div className="flex gap-2 flex-wrap px-4 sm:px-6 py-3 bg-paper/70 border-t border-black/[0.04]">
                                      {attrDefs.map((def) => {
                                        const filterKey = `${category}|${def.key}`;
                                        const current = attrFilterValues[filterKey] ?? "";
                                        return (
                                          <div key={def.key} className="relative">
                                            <select
                                              value={current}
                                              onChange={(e) =>
                                                setAttrFilterValues((prev) => ({
                                                  ...prev,
                                                  [filterKey]: e.target.value,
                                                }))
                                              }
                                              aria-label={def.label}
                                              className={`appearance-none h-8 rounded-full pl-3 pr-7 text-xs font-medium cursor-pointer transition-colors ${
                                                current
                                                  ? "bg-ink text-white"
                                                  : "bg-white text-ink ring-1 ring-black/10 hover:ring-black/25"
                                              }`}
                                            >
                                              <option value="">{def.label}: всі</option>
                                              {def.options.map((v) => (
                                                <option key={v} value={v}>
                                                  {def.format ? def.format(v) : v}
                                                </option>
                                              ))}
                                            </select>
                                            <span
                                              className={`absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none ${
                                                current ? "text-white" : "text-muted"
                                              }`}
                                            >
                                              <Chevron size={12} />
                                            </span>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                  <div className="divide-y divide-black/[0.05] border-t border-black/[0.06]">
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
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </main>

      {/* Floating mini-cart */}
      {cartCount > 0 && (
        <div className="no-print fixed bottom-4 inset-x-4 z-10 pointer-events-none">
          <div className="pointer-events-auto mx-auto max-w-xl rounded-2xl bg-ink text-white shadow-[0_20px_50px_-12px_rgba(23,20,15,0.55)] pl-5 pr-2 py-2 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs text-white/60 tabular">
                {cartCount} {plural(cartCount, "товар", "товари", "товарів")} у кошику
              </div>
              <div className="text-lg font-semibold tracking-tight tabular">
                {cartTotal.toLocaleString("uk-UA")} ₴
              </div>
            </div>
            <Link
              href="/cart"
              className="inline-flex items-center gap-1.5 h-11 rounded-xl bg-brand px-5 text-sm font-semibold text-white hover:bg-brand-dark transition-colors whitespace-nowrap"
            >
              До кошика
              <span aria-hidden="true">→</span>
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

// ───────────────────────── small UI pieces ─────────────────────────

function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}

function Chevron({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CloseIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M16 16l4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function FilterIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 7h10M18 7h2M4 17h2M10 17h10"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <circle cx="16" cy="7" r="2" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="8" cy="17" r="2" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function ToggleChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`h-10 inline-flex items-center rounded-full px-4 text-sm font-medium whitespace-nowrap transition-colors ${
        active ? "bg-ink text-white" : "bg-white text-ink ring-1 ring-black/10 hover:ring-black/25"
      }`}
    >
      {children}
    </button>
  );
}

// [−] 12 [+] pill. QtyInput keeps its own typing/clamping behaviour; the
// buttons just step by one.
function Stepper({
  qty,
  stock,
  onQty,
  large,
}: {
  qty: number;
  stock: number;
  onQty: (q: number) => void;
  large?: boolean;
}) {
  const disabled = stock <= 0;
  const h = large ? "h-12" : "h-10";
  const btn = `${large ? "w-12 h-12" : "w-10 h-10"} shrink-0 inline-flex items-center justify-center rounded-full text-ink transition-colors disabled:opacity-30 disabled:cursor-not-allowed enabled:hover:bg-black/5 enabled:active:bg-black/10`;
  return (
    <div
      className={`inline-flex items-center ${h} rounded-full bg-white transition-shadow focus-within:ring-2 focus-within:ring-ink ${
        qty > 0 ? "ring-1 ring-ink/70" : "ring-1 ring-black/10"
      } ${disabled ? "opacity-60" : ""}`}
    >
      <button
        type="button"
        aria-label="Менше"
        disabled={disabled || qty <= 0}
        onClick={() => onQty(Math.max(0, qty - 1))}
        className={btn}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>
      <QtyInput
        value={qty}
        max={stock}
        disabled={disabled}
        onChange={onQty}
        className="w-10 h-8 bg-transparent text-center text-[15px] font-semibold tabular text-ink focus:outline-none disabled:text-muted"
      />
      <button
        type="button"
        aria-label="Більше"
        disabled={disabled || qty >= stock}
        onClick={() => onQty(qty + 1)}
        className={btn}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>
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
  const stepper = <Stepper qty={qty} stock={product.stock} onQty={onQty} />;

  return (
    <div className="px-4 sm:px-6 py-4 hover:bg-paper/40 transition-colors">
      {/* Image + name always share the top line, full width, so the name
          gets real space instead of being squeezed by price/qty columns. */}
      <div className="flex items-center gap-3 sm:gap-4">
        <button
          onClick={onOpen}
          aria-label={`Переглянути: ${product.name}`}
          className="shrink-0 w-16 h-16 rounded-xl bg-paper ring-1 ring-black/[0.05] overflow-hidden relative"
        >
          {product.images[0] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={product.images[0].url}
              alt=""
              loading="lazy"
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-muted/60 text-[10px] leading-tight text-center px-1">
              немає фото
            </div>
          )}
          {product.isPromo && (
            <span className="absolute left-1 top-1 rounded-full bg-brand text-white text-[9px] font-semibold px-1.5 py-px">
              Акція
            </span>
          )}
        </button>

        <button onClick={onOpen} className="flex-1 min-w-0 text-left">
          <div className="text-[15px] font-medium leading-snug tracking-[-0.01em] text-ink line-clamp-2 sm:truncate">
            {product.name}
          </div>
          {product.description && (
            <div className="hidden sm:block text-[13px] text-muted truncate mt-0.5">
              {product.description}
            </div>
          )}
          {product.isPromo && product.promoText && (
            <div className="hidden sm:block text-[13px] text-brand truncate">{product.promoText}</div>
          )}
          <PackagingInfo
            packQty={product.packQty}
            boxQty={product.boxQty}
            className="hidden sm:inline-block mt-0.5"
          />
        </button>

        <div className="hidden sm:flex w-36 shrink-0 justify-end">
          <StockBadge stock={product.stock} />
        </div>

        <div className="hidden sm:block text-[17px] font-semibold tracking-tight tabular text-ink w-28 shrink-0 text-right">
          {product.price.toLocaleString("uk-UA")} ₴
        </div>

        <div className="hidden sm:flex shrink-0">{stepper}</div>
      </div>

      {/* Price + stock + qty move to a second line on mobile so the row
          never forces horizontal scrolling on narrow screens. The text
          block gets min-w-0 so it can wrap instead of pushing the stepper
          off the edge; the stepper itself is shrink-0. */}
      <div className="flex sm:hidden items-end justify-between gap-3 mt-3 pl-[76px]">
        <div className="flex flex-col min-w-0">
          <span className="text-lg font-semibold tracking-tight tabular text-ink leading-none mb-1.5">
            {product.price.toLocaleString("uk-UA")} ₴
          </span>
          <StockBadge stock={product.stock} />
          <PackagingInfo
            packQty={product.packQty}
            boxQty={product.boxQty}
            className="mt-0.5 whitespace-normal"
          />
        </div>
        <div className="shrink-0">{stepper}</div>
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
      className="fixed inset-0 bg-ink/50 backdrop-blur-sm z-30 flex items-end sm:items-center justify-center sm:p-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={product.name}
    >
      <div
        className="bg-white rounded-t-3xl sm:rounded-3xl max-w-3xl w-full max-h-[92vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 px-5 sm:px-8 pt-5 sm:pt-7">
          <div className="min-w-0">
            {product.category && (
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted mb-1.5">
                {normalizeCategory(product.category)}
              </p>
            )}
            <h2 className="text-xl sm:text-2xl font-semibold leading-tight tracking-[-0.02em] text-ink">
              {product.name}
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Закрити"
            className="shrink-0 w-10 h-10 inline-flex items-center justify-center rounded-full bg-paper text-ink hover:bg-black/10 transition-colors"
          >
            <CloseIcon size={16} />
          </button>
        </div>

        <div className="px-5 sm:px-8 py-5 grid sm:grid-cols-2 gap-5 sm:gap-8">
          <div className="aspect-square bg-paper rounded-2xl overflow-hidden ring-1 ring-black/[0.05]">
            {product.images[0] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={product.images[0].url}
                alt={product.name}
                className="w-full h-full object-contain"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-muted/60 text-sm">
                немає фото
              </div>
            )}
          </div>

          <div className="flex flex-col">
            {product.isPromo && (
              <span className="self-start mb-3 rounded-full bg-brand text-white text-[11px] font-semibold px-2.5 py-1">
                Акція
              </span>
            )}
            {product.description && (
              <p className="text-[15px] leading-relaxed text-ink/75 mb-3">{product.description}</p>
            )}
            {product.isPromo && product.promoText && (
              <p className="text-sm text-brand mb-3">{product.promoText}</p>
            )}
            {product.videoUrl && (
              <video src={product.videoUrl} controls className="rounded-xl w-full mb-3" />
            )}

            <div className="mt-auto pt-3">
              <div className="text-3xl font-semibold tracking-[-0.03em] tabular text-ink mb-2">
                {product.price.toLocaleString("uk-UA")} ₴
              </div>
              <div className="flex items-center flex-wrap gap-x-4 gap-y-1 mb-5">
                <StockBadge stock={product.stock} />
                <PackagingInfo packQty={product.packQty} boxQty={product.boxQty} />
              </div>

              <div className="flex items-center gap-2 mb-3">
                <Stepper qty={qty} stock={product.stock} onQty={onQty} large />
                <button
                  disabled={product.stock <= 0}
                  onClick={onAdd}
                  className="flex-1 h-12 rounded-full bg-brand text-white text-[15px] font-semibold hover:bg-brand-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Додати в кошик
                </button>
              </div>
              <SpecsButton onClick={onShowSpecs} className="w-full text-center" />
            </div>
          </div>
        </div>

        {similar.length > 0 && (
          <div className="border-t border-black/[0.06] px-5 sm:px-8 py-5 sm:py-6">
            <h3 className="text-sm font-semibold tracking-tight text-ink mb-3">Схожі товари</h3>
            <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
              {similar.map((s) => (
                <button
                  key={s.id}
                  onClick={() => onSelectSimilar(s)}
                  className="shrink-0 w-32 text-left group"
                >
                  <div className="w-32 h-32 rounded-2xl bg-paper ring-1 ring-black/[0.05] overflow-hidden mb-2">
                    {s.images[0] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={s.images[0].url}
                        alt=""
                        loading="lazy"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted/60 text-[10px]">
                        немає фото
                      </div>
                    )}
                  </div>
                  <div className="text-xs leading-snug text-ink/80 line-clamp-2">{s.name}</div>
                  <div className="text-sm font-semibold tabular text-ink mt-0.5">
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
