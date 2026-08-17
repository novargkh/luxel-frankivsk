"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import { useCart } from "@/lib/cart";

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
  images: ProductImage[];
};

type Announcement = { id: string; title: string; body: string; createdAt: string };
type Shop = { id: string; name: string; address: string };

const UNCATEGORIZED = "Інше";

export default function CatalogPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [shops, setShops] = useState<Shop[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAnnouncements, setShowAnnouncements] = useState(true);

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [promoOnly, setPromoOnly] = useState(false);
  const [inStockOnly, setInStockOnly] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [quickView, setQuickView] = useState<Product | null>(null);

  const { cart, setQty, addOne } = useCart();

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
    // Expand every category by default the first time products load.
    setExpanded((prev) => {
      if (prev.size > 0) return prev;
      return new Set(productsData.map((p) => p.category || UNCATEGORIZED));
    });
  }

  useEffect(() => {
    loadData();
  }, []);

  const categories = useMemo(() => {
    const set = new Set(products.map((p) => p.category || UNCATEGORIZED));
    return Array.from(set).sort((a, b) => a.localeCompare(b, "uk"));
  }, [products]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (q && !p.name.toLowerCase().includes(q) && !(p.description ?? "").toLowerCase().includes(q)) {
        return false;
      }
      if (categoryFilter && (p.category || UNCATEGORIZED) !== categoryFilter) return false;
      if (promoOnly && !p.isPromo) return false;
      if (inStockOnly && p.stock <= 0) return false;
      return true;
    });
  }, [products, search, categoryFilter, promoOnly, inStockOnly]);

  const grouped = useMemo(() => {
    const map = new Map<string, Product[]>();
    for (const p of filtered) {
      const key = p.category || UNCATEGORIZED;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0], "uk"));
  }, [filtered]);

  const isFiltering = search.trim().length > 0 || !!categoryFilter || promoOnly || inStockOnly;

  function toggleCategory(cat: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }

  function similarProducts(p: Product) {
    const cat = p.category || UNCATEGORIZED;
    return products.filter((x) => x.id !== p.id && (x.category || UNCATEGORIZED) === cat).slice(0, 12);
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
      <Navbar />

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

        {/* Search + filters */}
        <div className="mb-5 flex flex-col sm:flex-row gap-2 sm:items-center flex-wrap">
          <input
            placeholder="Пошук товару за назвою чи описом..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 min-w-[220px] border border-slate-300 rounded-lg px-3 py-2 text-sm"
          />
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
          >
            <option value="">Усі категорії</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
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
        </div>

        {loading ? (
          <p className="text-sm text-slate-500">Завантаження...</p>
        ) : grouped.length === 0 ? (
          <p className="text-sm text-slate-500">Нічого не знайдено.</p>
        ) : (
          <div className="space-y-4">
            {grouped.map(([category, items]) => {
              const isOpen = isFiltering || expanded.has(category);
              return (
                <div key={category} className="border border-slate-200 bg-white rounded-xl overflow-hidden">
                  <button
                    onClick={() => toggleCategory(category)}
                    className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 text-left"
                  >
                    <span className="text-sm font-semibold text-slate-900">
                      {category}{" "}
                      <span className="text-xs font-normal text-slate-400">({items.length})</span>
                    </span>
                    <span
                      className={`text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
                    >
                      ▾
                    </span>
                  </button>

                  {isOpen && (
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
        />
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
  return (
    <div className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition">
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
        <div className="text-sm font-medium text-slate-900 truncate">{product.name}</div>
        {product.description && (
          <div className="text-xs text-slate-500 truncate">{product.description}</div>
        )}
        {product.isPromo && product.promoText && (
          <div className="text-xs text-brand truncate">{product.promoText}</div>
        )}
      </button>

      <div className="hidden sm:block text-xs text-slate-400 w-24 shrink-0 text-right">
        {product.stock > 0 ? `Залишок: ${product.stock}` : (
          <span className="text-slate-400">Немає в наявності</span>
        )}
      </div>

      <div className="text-sm font-semibold text-slate-900 w-24 shrink-0 text-right">
        {product.price.toLocaleString("uk-UA")} ₴
      </div>

      <div className="shrink-0 flex items-center gap-1">
        <input
          type="number"
          min={0}
          max={product.stock}
          disabled={product.stock <= 0}
          value={qty}
          onChange={(e) => onQty(Number(e.target.value))}
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
}: {
  product: Product;
  qty: number;
  onQty: (q: number) => void;
  onAdd: () => void;
  onClose: () => void;
  similar: Product[];
  onSelectSimilar: (p: Product) => void;
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
              <span className="text-xs text-slate-400 mb-1">{product.category}</span>
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
              <div className="text-xs text-slate-400 mb-3">
                {product.stock > 0 ? `Залишок: ${product.stock}` : "Немає в наявності"}
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  max={product.stock}
                  disabled={product.stock <= 0}
                  value={qty}
                  onChange={(e) => onQty(Number(e.target.value))}
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
