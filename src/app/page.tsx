"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";

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
type AppliedPromo = { code: string; type: "PERCENT" | "FIXED"; value: number };

export default function CatalogPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [shops, setShops] = useState<Shop[]>([]);
  const [shopId, setShopId] = useState("");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [comment, setComment] = useState("");
  const [placing, setPlacing] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(
    null
  );
  const [showAnnouncements, setShowAnnouncements] = useState(true);
  const [promoInput, setPromoInput] = useState("");
  const [appliedPromo, setAppliedPromo] = useState<AppliedPromo | null>(null);
  const [promoChecking, setPromoChecking] = useState(false);
  const [promoError, setPromoError] = useState("");

  async function loadData() {
    setLoading(true);
    const [productsRes, announcementsRes, shopsRes] = await Promise.all([
      fetch("/api/products"),
      fetch("/api/announcements"),
      fetch("/api/shops"),
    ]);
    setProducts(await productsRes.json());
    setAnnouncements(await announcementsRes.json());
    const shopsData: Shop[] = await shopsRes.json();
    setShops(shopsData);
    setShopId((prev) => prev || shopsData[0]?.id || "");
    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, []);

  function setQty(productId: string, qty: number) {
    setCart((prev) => {
      const next = { ...prev };
      if (qty <= 0) {
        delete next[productId];
      } else {
        next[productId] = qty;
      }
      return next;
    });
  }

  const cartItems = useMemo(
    () =>
      Object.entries(cart)
        .map(([productId, quantity]) => {
          const product = products.find((p) => p.id === productId);
          return product ? { product, quantity } : null;
        })
        .filter(Boolean) as { product: Product; quantity: number }[],
    [cart, products]
  );

  const total = cartItems.reduce((sum, i) => sum + i.product.price * i.quantity, 0);
  const profileIncomplete = !loading && shops.length === 0;

  const discountAmount = appliedPromo
    ? appliedPromo.type === "PERCENT"
      ? Math.round(total * (appliedPromo.value / 100) * 100) / 100
      : Math.min(appliedPromo.value, total)
    : 0;
  const finalTotal = Math.max(0, total - discountAmount);

  async function applyPromo() {
    if (!promoInput.trim()) return;
    setPromoChecking(true);
    setPromoError("");

    const res = await fetch("/api/promo/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: promoInput.trim(), subtotal: total }),
    });
    const data = await res.json();
    setPromoChecking(false);

    if (!data.valid) {
      setPromoError(data.error || "Промокод недійсний");
      setAppliedPromo(null);
      return;
    }

    setAppliedPromo({ code: data.code, type: data.type, value: data.value });
  }

  function removePromo() {
    setAppliedPromo(null);
    setPromoInput("");
    setPromoError("");
  }

  async function placeOrder() {
    if (cartItems.length === 0 || !shopId) return;
    setPlacing(true);
    setMessage(null);

    const res = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: cartItems.map((i) => ({ productId: i.product.id, quantity: i.quantity })),
        comment,
        shopId,
        promoCode: appliedPromo?.code,
      }),
    });

    setPlacing(false);

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setMessage({ type: "error", text: err.error || "Не вдалося оформити замовлення" });
      return;
    }

    setCart({});
    setComment("");
    removePromo();
    setMessage({ type: "ok", text: "Замовлення успішно оформлено!" });
    loadData();
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <main className="max-w-6xl mx-auto w-full px-4 py-6 flex-1">
        {profileIncomplete && (
          <div className="mb-6 rounded-xl border border-brand/30 bg-red-50 p-4 flex items-center justify-between gap-3 flex-wrap">
            <p className="text-sm text-slate-700">
              Щоб оформлювати замовлення, заповніть профіль і додайте хоча б один
              магазин (адресу доставки).
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

        <div className="flex flex-col lg:flex-row gap-6">
          <div className="flex-1">
            <h1 className="text-lg font-semibold text-slate-900 mb-4">Каталог товарів</h1>

            {loading ? (
              <p className="text-sm text-slate-500">Завантаження...</p>
            ) : products.length === 0 ? (
              <p className="text-sm text-slate-500">Товари ще не додано.</p>
            ) : (
              <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {products.map((p) => (
                  <div
                    key={p.id}
                    className="border border-slate-200 bg-white rounded-xl overflow-hidden flex flex-col"
                  >
                    <div className="aspect-square bg-slate-100 relative">
                      {p.images[0] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={p.images[0].url}
                          alt={p.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-300 text-xs">
                          немає фото
                        </div>
                      )}
                      {p.isPromo && (
                        <span className="absolute top-2 left-2 bg-brand text-white text-xs px-2 py-0.5 rounded-full">
                          Акція
                        </span>
                      )}
                      {p.stock <= 0 && (
                        <span className="absolute top-2 right-2 bg-slate-900/80 text-white text-xs px-2 py-0.5 rounded-full">
                          Немає в наявності
                        </span>
                      )}
                    </div>

                    <div className="p-3 flex-1 flex flex-col">
                      <h3 className="text-sm font-medium text-slate-900">{p.name}</h3>
                      {p.description && (
                        <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                          {p.description}
                        </p>
                      )}
                      {p.isPromo && p.promoText && (
                        <p className="text-xs text-brand mt-1">{p.promoText}</p>
                      )}
                      {p.videoUrl && (
                        <video
                          src={p.videoUrl}
                          controls
                          className="mt-2 rounded-lg w-full max-h-40"
                        />
                      )}

                      <div className="mt-auto pt-3 flex items-center justify-between">
                        <div>
                          <div className="text-sm font-semibold text-slate-900">
                            {p.price.toLocaleString("uk-UA")} ₴
                          </div>
                          <div className="text-xs text-slate-400">Залишок: {p.stock}</div>
                        </div>

                        <input
                          type="number"
                          min={0}
                          max={p.stock}
                          disabled={p.stock <= 0 || profileIncomplete}
                          value={cart[p.id] ?? 0}
                          onChange={(e) => setQty(p.id, Number(e.target.value))}
                          className="w-16 border border-slate-300 rounded-lg px-2 py-1 text-sm disabled:bg-slate-100"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <aside className="lg:w-80 shrink-0">
            <div className="sticky top-20 border border-slate-200 bg-white rounded-xl p-4">
              <h2 className="text-sm font-semibold text-slate-900 mb-3">Кошик</h2>

              {cartItems.length === 0 ? (
                <p className="text-xs text-slate-400">Додайте товари з каталогу</p>
              ) : (
                <div className="space-y-2 mb-3">
                  {cartItems.map(({ product, quantity }) => (
                    <div key={product.id} className="flex justify-between text-xs">
                      <span className="text-slate-600 truncate pr-2">
                        {product.name} × {quantity}
                      </span>
                      <span className="text-slate-900 font-medium whitespace-nowrap">
                        {(product.price * quantity).toLocaleString("uk-UA")} ₴
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <div className="mb-3">
                {appliedPromo ? (
                  <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-lg px-2 py-1.5 text-xs">
                    <span className="text-emerald-700 font-medium">
                      Промокод {appliedPromo.code} застосовано
                    </span>
                    <button onClick={removePromo} className="text-emerald-700 hover:text-emerald-900">
                      ✕
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <input
                      placeholder="Промокод"
                      value={promoInput}
                      onChange={(e) => setPromoInput(e.target.value.toUpperCase())}
                      className="flex-1 border border-slate-300 rounded-lg px-2 py-1.5 text-xs font-mono"
                    />
                    <button
                      onClick={applyPromo}
                      disabled={promoChecking || !promoInput.trim()}
                      className="text-xs border border-slate-200 rounded-lg px-3 hover:bg-slate-50 disabled:opacity-50"
                    >
                      {promoChecking ? "..." : "Застосувати"}
                    </button>
                  </div>
                )}
                {promoError && (
                  <p className="text-xs text-red-600 mt-1">{promoError}</p>
                )}
              </div>

              <div className="border-t border-slate-100 pt-2 mb-3 space-y-1">
                <div className="flex justify-between text-sm text-slate-500">
                  <span>Сума</span>
                  <span>{total.toLocaleString("uk-UA")} ₴</span>
                </div>
                {discountAmount > 0 && (
                  <div className="flex justify-between text-sm text-emerald-600">
                    <span>Знижка</span>
                    <span>−{discountAmount.toLocaleString("uk-UA")} ₴</span>
                  </div>
                )}
                <div className="flex justify-between text-sm font-semibold text-slate-900">
                  <span>Разом</span>
                  <span>{finalTotal.toLocaleString("uk-UA")} ₴</span>
                </div>
              </div>

              {shops.length > 0 && (
                <div className="mb-3">
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Магазин доставки
                  </label>
                  <select
                    value={shopId}
                    onChange={(e) => setShopId(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-xs"
                  >
                    {shops.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <textarea
                placeholder="Коментар до замовлення (необов'язково)"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-xs mb-3 resize-none"
                rows={2}
              />

              {message && (
                <p
                  className={`text-xs mb-3 rounded-lg px-2 py-1.5 ${
                    message.type === "ok"
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-red-50 text-red-700"
                  }`}
                >
                  {message.text}
                </p>
              )}

              <button
                onClick={placeOrder}
                disabled={cartItems.length === 0 || placing || !shopId}
                className="w-full bg-brand text-white rounded-lg py-2 text-sm font-medium hover:bg-brand-dark disabled:opacity-50"
              >
                {placing ? "Оформлюємо..." : "Оформити замовлення"}
              </button>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
