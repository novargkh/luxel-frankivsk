"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CaretDown,
  ImageSquare,
  MagnifyingGlass,
  Minus,
  Plus,
  SlidersHorizontal,
  X,
} from "@phosphor-icons/react";
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
  const text = `${packQty ?? "-"}/${boxQty ?? "-"}`;
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
      className={`h-11 inline-flex items-center justify-center text-sm font-medium text-ink rounded-full bg-ink/[0.05] hover:bg-ink/[0.09] active:scale-[0.98] transition-all duration-300 ease-fluid whitespace-nowrap ${className ?? ""}`}
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
      className="fixed inset-0 bg-ink/25 backdrop-blur-sm z-40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="reveal glass glass-strong rounded-[1.75rem] max-w-md w-full max-h-[80vh] overflow-y-auto"
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
            <X size={16} weight="light" />
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
  const [shops, setShops] = useState<Shop[]>([]);
  const [loading, setLoading] = useState(true);

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

  // On phones the search panel folds into a small glass "lens" button once
  // it is stuck under the navbar, so more of the catalog is visible while
  // scrolling. A sentinel right above the panel tells us when it is stuck
  // (IntersectionObserver, no scroll-position polling).
  const sentinelRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [stuck, setStuck] = useState(false);
  const [lensOpen, setLensOpen] = useState(false);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        const isStuck =
          !entry.isIntersecting && entry.boundingClientRect.top < (entry.rootBounds?.top ?? 0) + 1;
        setStuck(isStuck);
        if (!isStuck) setLensOpen(false);
      },
      { rootMargin: `-${navHeight + 8}px 0px 0px 0px`, threshold: 0 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [navHeight]);
  // After the lens was tapped open, the next scroll folds it back (unless
  // the person is typing). The listener only exists while it is open.
  useEffect(() => {
    if (!lensOpen) return;
    const onScroll = () => {
      if (document.activeElement === searchInputRef.current) return;
      setLensOpen(false);
    };
    const t = setTimeout(() => window.addEventListener("scroll", onScroll, { passive: true }), 400);
    return () => {
      clearTimeout(t);
      window.removeEventListener("scroll", onScroll);
    };
  }, [lensOpen]);

  async function loadData() {
    setLoading(true);
    // Announcements live in the envelope in the top bar (Inbox).
    const [productsRes, shopsRes] = await Promise.all([
      fetch("/api/products"),
      fetch("/api/shops"),
    ]);
    const productsData: Product[] = await productsRes.json();
    setProducts(productsData);
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
  // Phone-only: search panel folded into the lens button.
  const lensMode = stuck && !lensOpen && !search && !mobileFiltersOpen;

  function openLens() {
    setLensOpen(true);
    requestAnimationFrame(() => searchInputRef.current?.focus());
  }

  return (
    <div className="min-h-[100dvh] flex flex-col">
      <div ref={navRef} className="sticky top-0 z-20">
        <Navbar />
      </div>

      <main className="max-w-6xl mx-auto w-full px-4 sm:px-6 pt-8 sm:pt-16 flex-1 pb-36">
        {profileIncomplete && (
          <Bezel className="reveal mb-4">
            <div className="p-5 sm:p-6 flex items-center justify-between gap-4 flex-wrap">
              <p className="text-[15px] leading-relaxed text-ink/80 max-w-[60ch]">
                Щоб оформлювати замовлення, заповніть профіль і додайте хоча б один
                магазин (адресу доставки). Товари можна додавати в кошик вже зараз.
              </p>
              <Link
                href="/profile"
                className="group h-12 inline-flex items-center gap-3 rounded-full bg-ink text-white pl-5 pr-1.5 text-sm font-medium whitespace-nowrap active:scale-[0.98] transition-transform duration-300 ease-fluid"
              >
                Заповнити профіль
                <span className="w-9 h-9 rounded-full bg-white/15 inline-flex items-center justify-center transition-transform duration-500 ease-fluid group-hover:translate-x-0.5">
                  <ArrowRight size={16} weight="bold" />
                </span>
              </Link>
            </div>
          </Bezel>
        )}

        <header className="reveal mb-10 sm:mb-12">
          <div>
            <span className="inline-flex items-center rounded-full bg-white/60 ring-1 ring-white/80 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.2em] text-muted mb-5">
              Оптовий кабінет
            </span>
            <h1 className="text-[44px] leading-[0.95] sm:text-6xl font-semibold tracking-[-0.045em] text-ink">
              Каталог товарів
            </h1>
            {!loading && heroCount > 0 && (
              <p className="mt-4 text-base sm:text-lg text-muted tabular">
                {heroCount.toLocaleString("uk-UA")} {plural(heroCount, "позиція", "позиції", "позицій")} у
                каталозі
              </p>
            )}
          </div>
        </header>

        {/* Search + filters, sticky under the floating navbar so they stay
            reachable while scrolling through a long, expanded catalog. On
            mobile the extra filters collapse into a toggled panel. */}
        <div ref={sentinelRef} aria-hidden="true" className="h-px -mb-px" />
        <div
          className="sticky z-10 -mx-1.5 sm:-mx-2 py-2 mb-6 pointer-events-none"
          style={{ top: navHeight }}
        >
          {/* Folded state (phones): a round glass lens. Tap to search. */}
          <button
            type="button"
            onClick={openLens}
            aria-label="Пошук і фільтри"
            tabIndex={lensMode ? 0 : -1}
            aria-hidden={!lensMode}
            className={`sm:hidden glass absolute right-1.5 top-2 w-14 h-14 rounded-full inline-flex items-center justify-center text-ink transition-all duration-500 ease-fluid active:scale-90 ${
              lensMode
                ? "opacity-100 scale-100 pointer-events-auto"
                : "opacity-0 scale-50 pointer-events-none"
            }`}
          >
            <MagnifyingGlass size={22} weight="regular" />
            {activeExtraFilterCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[1.25rem] h-5 px-1 rounded-full bg-brand text-white text-[11px] leading-5 text-center font-semibold">
                {activeExtraFilterCount}
              </span>
            )}
          </button>

          <div
            onPointerMove={trackLight}
            className={`glass glass-strong rounded-[1.75rem] p-1.5 origin-top-right transition-all duration-500 ease-fluid ${
              lensMode
                ? "max-sm:opacity-0 max-sm:scale-[0.2] max-sm:pointer-events-none sm:pointer-events-auto"
                : "pointer-events-auto"
            }`}
          >
          <div className="flex gap-1.5 items-center">
            <div className="flex-1 min-w-0">
              <div className="relative">
                <MagnifyingGlass
                  size={18}
                  weight="light"
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
                />
                <input
                  ref={searchInputRef}
                  type="text"
                  inputMode="search"
                  placeholder="Назва або артикул"
                  aria-label="Пошук товару"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full h-12 rounded-[1.375rem] bg-white/80 ring-1 ring-white pl-11 pr-12 text-base text-ink placeholder:text-muted shadow-[0_1px_2px_rgba(16,17,20,0.05)] focus:outline-none focus:bg-white focus:shadow-[0_0_0_4px_rgba(255,255,255,0.6),0_8px_24px_-10px_rgba(16,17,20,0.25)] transition-shadow duration-300 ease-fluid"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    aria-label="Очистити пошук"
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 inline-flex items-center justify-center rounded-full text-muted hover:text-ink hover:bg-ink/[0.05] transition-colors duration-300 ease-fluid"
                  >
                    <X size={16} weight="light" />
                  </button>
                )}
              </div>
            </div>
            <button
              onClick={() => setMobileFiltersOpen((v) => !v)}
              aria-expanded={mobileFiltersOpen}
              aria-label="Фільтри"
              className="sm:hidden relative shrink-0 w-12 h-12 inline-flex items-center justify-center rounded-[1.375rem] bg-white/80 ring-1 ring-white text-ink active:scale-[0.97] transition-transform duration-300 ease-fluid"
            >
              <SlidersHorizontal size={20} weight="light" />
              {activeExtraFilterCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[1.25rem] h-5 px-1 rounded-full bg-brand text-white text-[11px] leading-5 text-center font-semibold">
                  {activeExtraFilterCount}
                </span>
              )}
            </button>
          </div>

          {/* Desktop: full filter row, always visible. */}
          <div className="hidden sm:flex gap-2 items-center flex-wrap px-1 pt-2 pb-1">
            <PillSelect
              value={sortOrder}
              onChange={(v) => setSortOrder(v as typeof sortOrder)}
              label="Сортування"
            >
              <option value="default">Сортування: за замовчуванням</option>
              <option value="price-asc">Ціна: від дешевих</option>
              <option value="price-desc">Ціна: від дорогих</option>
              <option value="name-asc">За назвою (А-Я)</option>
            </PillSelect>
            <ToggleChip active={promoOnly} onClick={() => setPromoOnly((v) => !v)}>
              Тільки акційні
            </ToggleChip>
            <ToggleChip active={inStockOnly} onClick={() => setInStockOnly((v) => !v)}>
              Тільки в наявності
            </ToggleChip>
            {isFiltering && (
              <button
                onClick={resetFilters}
                className="h-10 rounded-full px-3 text-sm text-muted hover:text-ink transition-colors duration-300 ease-fluid whitespace-nowrap"
              >
                Скинути фільтри
              </button>
            )}
          </div>

          {/* Mobile: collapsible filter panel. Picking a value applies it
              immediately and closes the panel. */}
          {mobileFiltersOpen && (
            <div className="reveal sm:hidden">
              <div className="px-1.5 pt-3 pb-1.5 space-y-3">
                <PillSelect
                  value={sortOrder}
                  onChange={(v) => {
                    setSortOrder(v as typeof sortOrder);
                    setMobileFiltersOpen(false);
                  }}
                  label="Сортування"
                  full
                >
                  <option value="default">Сортування: за замовчуванням</option>
                  <option value="price-asc">Ціна: від дешевих</option>
                  <option value="price-desc">Ціна: від дорогих</option>
                  <option value="name-asc">За назвою (А-Я)</option>
                </PillSelect>
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
                      className="flex-1 h-11 rounded-full text-sm font-medium text-ink bg-ink/[0.05]"
                    >
                      Скинути
                    </button>
                  )}
                  <button
                    onClick={() => setMobileFiltersOpen(false)}
                    className="flex-1 h-11 rounded-full bg-ink text-white text-sm font-medium active:scale-[0.98] transition-transform duration-300 ease-fluid"
                  >
                    Готово
                  </button>
                </div>
              </div>
            </div>
          )}
          </div>
        </div>

        {isFiltering && !loading && (
          <p className="mb-4 px-1 text-sm text-muted tabular">
            Знайдено: <span className="text-ink font-medium">{filtered.length}</span>
          </p>
        )}

        {loading ? (
          <div className="space-y-2.5" aria-busy="true" aria-label="Завантаження каталогу">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <Bezel key={i}>
                <div className="h-[72px] sm:h-[84px] animate-pulse flex items-center gap-4 px-5 sm:px-7">
                  <div
                    className="h-5 rounded-full bg-ink/[0.06]"
                    style={{ width: `${32 + ((i * 13) % 28)}%` }}
                  />
                  <div className="ml-auto w-10 h-10 rounded-full bg-ink/[0.05]" />
                </div>
              </Bezel>
            ))}
          </div>
        ) : treeGroups.length === 0 ? (
          <Bezel className="reveal">
            <div className="px-6 py-16 text-center">
              <MagnifyingGlass size={32} weight="light" className="mx-auto text-muted mb-4" />
              <p className="text-xl font-semibold tracking-[-0.02em] text-ink">Нічого не знайдено</p>
              <p className="mt-1.5 text-[15px] text-muted">
                Спробуйте змінити запит або прибрати фільтри.
              </p>
              {isFiltering && (
                <button
                  onClick={resetFilters}
                  className="mt-6 h-11 rounded-full bg-ink text-white text-sm font-medium px-6 active:scale-[0.98] transition-transform duration-300 ease-fluid"
                >
                  Скинути фільтри
                </button>
              )}
            </div>
          </Bezel>
        ) : (
          <div className="space-y-2.5">
            {treeGroups.map((g, gi) => {
              const groupOpen = isFiltering || expandedGroups.has(g.key);
              return (
                <Bezel
                  key={g.key}
                  className="reveal"
                  style={{ ["--i" as string]: Math.min(gi, 10) }}
                  innerClassName={`sheen transition-shadow duration-500 ease-fluid ${
                    groupOpen ? "shadow-lift" : ""
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => toggleGroup(g.key)}
                    aria-expanded={groupOpen}
                    className="group w-full flex items-center gap-3 sm:gap-4 px-5 sm:px-7 py-5 sm:py-6 text-left"
                  >
                    <span className="flex-1 min-w-0 text-lg sm:text-2xl font-semibold leading-tight tracking-[-0.03em] text-ink">
                      {g.label}
                    </span>
                    <span className="shrink-0 text-sm text-muted tabular">{g.total}</span>
                    <span
                      className={`shrink-0 w-10 h-10 inline-flex items-center justify-center rounded-full transition-all duration-500 ease-fluid ${
                        groupOpen
                          ? "bg-ink text-white rotate-180"
                          : "bg-ink/[0.05] text-ink group-hover:bg-ink/[0.09]"
                      }`}
                    >
                      <CaretDown size={16} weight="bold" />
                    </span>
                  </button>

                  {groupOpen && (
                    <div className="border-t border-black/[0.05] divide-y divide-black/[0.05]">
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
                                className={`w-full flex items-center gap-3 px-5 sm:px-7 py-4 text-left transition-colors duration-300 ease-fluid ${
                                  isOpen ? "bg-ink/[0.025]" : "hover:bg-ink/[0.02]"
                                }`}
                              >
                                <span
                                  className={`flex-1 min-w-0 text-[15px] sm:text-base font-medium tracking-[-0.01em] ${
                                    isOpen ? "text-ink" : "text-ink/75"
                                  }`}
                                >
                                  {category}
                                </span>
                                <span className="text-xs text-muted tabular">{items.length}</span>
                                <CaretDown
                                  size={14}
                                  weight="bold"
                                  className={`shrink-0 transition-transform duration-500 ease-fluid ${
                                    isOpen ? "rotate-180 text-brand" : "text-muted"
                                  }`}
                                />
                              </button>
                            )}

                            <div
                              className={`grid overflow-hidden transition-all duration-500 ease-fluid ${
                                isOpen
                                  ? "grid-rows-[1fr] opacity-100 pointer-events-auto"
                                  : "grid-rows-[0fr] opacity-0 pointer-events-none"
                              }`}
                              aria-hidden={!isOpen}
                            >
                              <div className="min-h-0 overflow-hidden">
                                {attrDefs.length > 0 && (
                                  <div className="flex gap-2 flex-wrap px-5 sm:px-7 py-3 bg-ink/[0.025]">
                                    {attrDefs.map((def) => {
                                      const filterKey = `${category}|${def.key}`;
                                      const current = attrFilterValues[filterKey] ?? "";
                                      return (
                                        <PillSelect
                                          key={def.key}
                                          value={current}
                                          onChange={(v) =>
                                            setAttrFilterValues((prev) => ({
                                              ...prev,
                                              [filterKey]: v,
                                            }))
                                          }
                                          label={def.label}
                                          small
                                          active={!!current}
                                        >
                                          <option value="">{def.label}: всі</option>
                                          {def.options.map((v) => (
                                            <option key={v} value={v}>
                                              {def.format ? def.format(v) : v}
                                            </option>
                                          ))}
                                        </PillSelect>
                                      );
                                    })}
                                  </div>
                                )}
                                <div key={String(isOpen)} className="divide-y divide-black/[0.04]">
                                  {items.map((p, idx) => (
                                    <ProductRow
                                      key={p.id}
                                      index={isOpen ? idx : -1}
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
                  )}
                </Bezel>
              );
            })}
          </div>
        )}
      </main>

      {/* Floating mini-cart island */}
      {cartCount > 0 && (
        <div className="no-print fixed bottom-[calc(max(env(safe-area-inset-bottom),12px)+76px)] md:bottom-6 inset-x-3 z-10 pointer-events-none">
          <div
            onPointerMove={trackLight}
            className="reveal glass glass-strong pointer-events-auto mx-auto max-w-xl rounded-full text-ink pl-6 pr-1.5 py-1.5 flex items-center justify-between gap-3"
          >
            <div className="min-w-0 leading-tight">
              <div className="text-xs text-muted tabular">
                {cartCount} {plural(cartCount, "товар", "товари", "товарів")} у кошику
              </div>
              <div className="text-lg font-semibold tracking-[-0.02em] tabular">
                {cartTotal.toLocaleString("uk-UA")} ₴
              </div>
            </div>
            <Link
              href="/cart"
              className="group h-12 inline-flex items-center gap-3 rounded-full bg-brand pl-5 pr-1.5 text-sm font-semibold text-white whitespace-nowrap hover:bg-brand-dark active:scale-[0.98] transition-all duration-300 ease-fluid"
            >
              До кошика
              <span className="w-9 h-9 rounded-full bg-white/15 inline-flex items-center justify-center transition-transform duration-500 ease-fluid group-hover:translate-x-0.5">
                <ArrowRight size={16} weight="bold" />
              </span>
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

// Moves the glass highlight to follow the pointer (CSS vars, no re-render).
function trackLight(e: React.PointerEvent<HTMLElement>) {
  const el = e.currentTarget;
  const r = el.getBoundingClientRect();
  el.style.setProperty("--mx", `${((e.clientX - r.left) / r.width) * 100}%`);
  el.style.setProperty("--my", `${((e.clientY - r.top) / r.height) * 100}%`);
}

function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}

// "Double bezel" container: a translucent outer tray holding a glass inner
// core with a concentric, slightly smaller radius.
function Bezel({
  children,
  className,
  innerClassName,
  style,
}: {
  children: React.ReactNode;
  className?: string;
  innerClassName?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={`rounded-[1.75rem] glass-tray p-1.5 ${className ?? ""}`}
      style={style}
    >
      <div
        className={`rounded-[calc(1.75rem-0.375rem)] glass-card overflow-hidden ${
          innerClassName ?? ""
        }`}
      >
        {children}
      </div>
    </div>
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
      className={`h-10 inline-flex items-center rounded-full px-4 text-sm font-medium whitespace-nowrap active:scale-[0.98] transition-all duration-300 ease-fluid ${
        active ? "bg-ink text-white shadow-[0_8px_20px_-8px_rgba(16,17,20,0.5)]" : "bg-white/60 text-ink ring-1 ring-white/80 backdrop-blur-md hover:bg-white/85 shadow-[0_1px_2px_rgba(16,17,20,0.05)]"
      }`}
    >
      {children}
    </button>
  );
}

function PillSelect({
  value,
  onChange,
  label,
  children,
  small,
  full,
  active,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  children: React.ReactNode;
  small?: boolean;
  full?: boolean;
  active?: boolean;
}) {
  return (
    <div className={`relative ${full ? "w-full" : ""}`}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className={`appearance-none rounded-full font-medium cursor-pointer transition-all duration-300 ease-fluid ${
          small ? "h-8 pl-3 pr-8 text-xs" : "h-10 pl-4 pr-10 text-sm"
        } ${full ? "w-full h-11 bg-ink/[0.04]" : ""} ${
          active
            ? "bg-ink text-white"
            : full
              ? "text-ink"
              : "bg-white/60 text-ink ring-1 ring-white/80 backdrop-blur-md hover:bg-white/85 shadow-[0_1px_2px_rgba(16,17,20,0.05)]"
        }`}
      >
        {children}
      </select>
      <CaretDown
        size={small ? 11 : 13}
        weight="bold"
        className={`absolute top-1/2 -translate-y-1/2 pointer-events-none ${small ? "right-3" : "right-4"} ${
          active ? "text-white" : "text-muted"
        }`}
      />
    </div>
  );
}

// [-] 12 [+] pill. QtyInput keeps its own typing/clamping behaviour; the
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
  const btn = `${large ? "w-12 h-12" : "w-10 h-10"} shrink-0 inline-flex items-center justify-center rounded-full text-ink transition-all duration-300 ease-fluid disabled:opacity-30 disabled:cursor-not-allowed enabled:hover:bg-ink/[0.06] enabled:active:scale-90`;
  return (
    <div
      className={`inline-flex items-center ${large ? "h-12" : "h-10"} rounded-full transition-all duration-300 ease-fluid focus-within:ring-2 focus-within:ring-black/10 ${
        qty > 0 ? "bg-white ring-1 ring-ink" : "bg-ink/[0.04]"
      } ${disabled ? "opacity-60" : ""}`}
    >
      <button
        type="button"
        aria-label="Менше"
        disabled={disabled || qty <= 0}
        onClick={() => onQty(Math.max(0, qty - 1))}
        className={btn}
      >
        <Minus size={14} weight="bold" />
      </button>
      <QtyInput
        value={qty}
        max={stock}
        disabled={disabled}
        onChange={onQty}
        className="w-10 h-8 bg-transparent text-center text-base font-semibold tabular text-ink focus:outline-none disabled:text-muted"
      />
      <button
        type="button"
        aria-label="Більше"
        disabled={disabled || qty >= stock}
        onClick={() => onQty(qty + 1)}
        className={btn}
      >
        <Plus size={14} weight="bold" />
      </button>
    </div>
  );
}

function PromoTag() {
  return (
    <span className="inline-flex items-center h-5 rounded-full bg-brand/10 text-brand px-2 text-[11px] font-semibold">
      Акція
    </span>
  );
}

function ProductRow({
  product,
  qty,
  onQty,
  onOpen,
  index = -1,
}: {
  index?: number;
  product: Product;
  qty: number;
  onQty: (q: number) => void;
  onOpen: () => void;
}) {
  const stepper = <Stepper qty={qty} stock={product.stock} onQty={onQty} />;

  return (
    <div
      className={`px-4 sm:px-7 py-4 hover:bg-white/70 transition-colors duration-300 ease-fluid ${
        index >= 0 && index < 14 ? "rise" : ""
      }`}
      style={index >= 0 ? { ["--i" as string]: index } : undefined}
    >
      {/* Image + name always share the top line, full width, so the name
          gets real space instead of being squeezed by price/qty columns. */}
      <div className="flex items-center gap-3 sm:gap-4">
        <button
          onClick={onOpen}
          aria-label={`Переглянути: ${product.name}`}
          className="shrink-0 w-16 h-16 rounded-2xl bg-paper overflow-hidden active:scale-[0.97] transition-transform duration-300 ease-fluid"
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
            <span className="w-full h-full flex items-center justify-center text-muted/60">
              <ImageSquare size={22} weight="light" />
            </span>
          )}
        </button>

        <button onClick={onOpen} className="flex-1 min-w-0 text-left">
          <div className="text-[15px] font-medium leading-snug tracking-[-0.01em] text-ink line-clamp-2 sm:truncate">
            {product.name}
          </div>
          <div className="hidden sm:flex items-center gap-2 mt-1 min-w-0">
            {product.isPromo && <PromoTag />}
            {product.isPromo && product.promoText ? (
              <span className="text-[13px] text-brand truncate">{product.promoText}</span>
            ) : (
              product.description && (
                <span className="text-[13px] text-muted truncate">{product.description}</span>
              )
            )}
          </div>
          <PackagingInfo
            packQty={product.packQty}
            boxQty={product.boxQty}
            className="hidden sm:inline-block mt-0.5"
          />
        </button>

        <div className="hidden sm:flex w-36 shrink-0 justify-end">
          <StockBadge stock={product.stock} />
        </div>

        <div className="hidden sm:block text-[17px] font-semibold tracking-[-0.02em] tabular text-ink w-28 shrink-0 text-right">
          {product.price.toLocaleString("uk-UA")} ₴
        </div>

        <div className="hidden sm:flex shrink-0">{stepper}</div>
      </div>

      {/* Price + stock + qty move to a second line on mobile so the row
          never forces horizontal scrolling on narrow screens. */}
      <div className="flex sm:hidden items-end justify-between gap-3 mt-3 pl-[76px]">
        <div className="flex flex-col items-start min-w-0 gap-1">
          {product.isPromo && <PromoTag />}
          <span className="text-lg font-semibold tracking-[-0.02em] tabular text-ink leading-none">
            {product.price.toLocaleString("uk-UA")} ₴
          </span>
          <StockBadge stock={product.stock} />
          <PackagingInfo
            packQty={product.packQty}
            boxQty={product.boxQty}
            className="whitespace-normal"
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
      className="fixed inset-0 bg-ink/25 backdrop-blur-sm z-30 flex items-end sm:items-center justify-center sm:p-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={product.name}
    >
      <div
        className="reveal glass glass-strong rounded-t-[1.75rem] sm:rounded-[1.75rem] max-w-3xl w-full max-h-[92dvh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 px-5 sm:px-8 pt-6 sm:pt-8">
          <div className="min-w-0">
            {product.category && (
              <p className="text-sm text-muted mb-1.5">{normalizeCategory(product.category)}</p>
            )}
            <h2 className="text-xl sm:text-[28px] font-semibold leading-tight tracking-[-0.03em] text-ink">
              {product.name}
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Закрити"
            className="shrink-0 w-11 h-11 inline-flex items-center justify-center rounded-full bg-ink/[0.05] text-ink hover:bg-ink/[0.09] active:scale-95 transition-all duration-300 ease-fluid"
          >
            <X size={18} weight="light" />
          </button>
        </div>

        <div className="px-5 sm:px-8 py-6 grid sm:grid-cols-2 gap-6 sm:gap-8">
          <div className="aspect-square bg-paper rounded-[1.25rem] overflow-hidden">
            {product.images[0] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={product.images[0].url}
                alt={product.name}
                className="w-full h-full object-contain mix-blend-multiply"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-muted/60">
                <ImageSquare size={40} weight="light" />
              </div>
            )}
          </div>

          <div className="flex flex-col">
            {product.isPromo && (
              <div className="mb-3">
                <PromoTag />
              </div>
            )}
            {product.description && (
              <p className="text-[15px] leading-relaxed text-ink/70 mb-3 max-w-[60ch]">
                {product.description}
              </p>
            )}
            {product.isPromo && product.promoText && (
              <p className="text-sm text-brand mb-3">{product.promoText}</p>
            )}
            {product.videoUrl && (
              <video src={product.videoUrl} controls className="rounded-2xl w-full mb-3" />
            )}

            <div className="mt-auto pt-3">
              <div className="text-[34px] leading-none font-semibold tracking-[-0.04em] tabular text-ink mb-3">
                {product.price.toLocaleString("uk-UA")} ₴
              </div>
              <div className="flex items-center flex-wrap gap-x-4 gap-y-1 mb-6">
                <StockBadge stock={product.stock} />
                <PackagingInfo packQty={product.packQty} boxQty={product.boxQty} />
              </div>

              <div className="flex items-center gap-2 mb-2">
                <Stepper qty={qty} stock={product.stock} onQty={onQty} large />
                <button
                  disabled={product.stock <= 0}
                  onClick={onAdd}
                  className="group flex-1 min-w-0 h-12 inline-flex items-center justify-between gap-3 whitespace-nowrap rounded-full bg-brand pl-5 pr-1.5 text-white text-[15px] font-semibold hover:bg-brand-dark active:scale-[0.98] transition-all duration-300 ease-fluid disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  У кошик
                  <span className="w-9 h-9 rounded-full bg-white/15 inline-flex items-center justify-center transition-transform duration-500 ease-fluid group-hover:rotate-90">
                    <Plus size={16} weight="bold" />
                  </span>
                </button>
              </div>
              <SpecsButton onClick={onShowSpecs} className="w-full text-center" />
            </div>
          </div>
        </div>

        {similar.length > 0 && (
          <div className="border-t border-black/[0.05] px-5 sm:px-8 py-6">
            <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-ink mb-4">Схожі товари</h3>
            <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar snap-x">
              {similar.map((s) => (
                <button
                  key={s.id}
                  onClick={() => onSelectSimilar(s)}
                  className="shrink-0 w-32 text-left group snap-start"
                >
                  <div className="w-32 h-32 rounded-[1.25rem] bg-paper overflow-hidden mb-2">
                    {s.images[0] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={s.images[0].url}
                        alt=""
                        loading="lazy"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-fluid"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted/60">
                        <ImageSquare size={24} weight="light" />
                      </div>
                    )}
                  </div>
                  <div className="text-xs leading-snug text-ink/75 line-clamp-2">{s.name}</div>
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
