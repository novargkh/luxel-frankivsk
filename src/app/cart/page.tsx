"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import QtyInput from "@/components/QtyInput";
import { useCart } from "@/lib/cart";

type ProductImage = { id: string; url: string };
type Product = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  stock: number;
  category: string | null;
  isActive: boolean;
  packQty: number | null;
  boxQty: number | null;
  images: ProductImage[];
};

// Matches the compact "Уп/ящ: 100/20" format used on the catalog cards.
function packagingText(packQty: number | null, boxQty: number | null): string | null {
  if (!packQty && !boxQty) return null;
  return `Уп/ящ: ${packQty ?? "—"}/${boxQty ?? "—"}`;
}
type Shop = { id: string; name: string; address: string };
type AppliedPromo = { code: string; type: "PERCENT" | "FIXED"; value: number };

export default function CartPage() {
  const { cart, setQty, remove, clear } = useCart();
  const [products, setProducts] = useState<Product[]>([]);
  const [shops, setShops] = useState<Shop[]>([]);
  const [shopId, setShopId] = useState("");
  const [loading, setLoading] = useState(true);
  const [comment, setComment] = useState("");
  const [placing, setPlacing] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const [promoInput, setPromoInput] = useState("");
  const [appliedPromo, setAppliedPromo] = useState<AppliedPromo | null>(null);
  const [promoChecking, setPromoChecking] = useState(false);
  const [promoError, setPromoError] = useState("");
  const [placedOrderId, setPlacedOrderId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [productsRes, shopsRes] = await Promise.all([
        fetch("/api/products"),
        fetch("/api/shops"),
      ]);
      setProducts(await productsRes.json());
      const shopsData: Shop[] = await shopsRes.json();
      setShops(shopsData);
      setShopId((prev) => prev || shopsData[0]?.id || "");
      setLoading(false);
    })();
  }, []);

  const items = useMemo(
    () =>
      Object.entries(cart)
        .map(([productId, quantity]) => {
          const product = products.find((p) => p.id === productId);
          return product ? { product, quantity } : null;
        })
        .filter(Boolean) as { product: Product; quantity: number }[],
    [cart, products]
  );

  const subtotal = items.reduce((sum, i) => sum + i.product.price * i.quantity, 0);
  const discountAmount = appliedPromo
    ? appliedPromo.type === "PERCENT"
      ? Math.round(subtotal * (appliedPromo.value / 100) * 100) / 100
      : Math.min(appliedPromo.value, subtotal)
    : 0;
  const total = Math.max(0, subtotal - discountAmount);
  const profileIncomplete = !loading && shops.length === 0;

  async function applyPromo() {
    if (!promoInput.trim()) return;
    setPromoChecking(true);
    setPromoError("");
    const res = await fetch("/api/promo/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: promoInput.trim(), subtotal }),
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
    if (items.length === 0 || !shopId) return;
    setPlacing(true);
    setMessage(null);

    const res = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: items.map((i) => ({ productId: i.product.id, quantity: i.quantity })),
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

    const order = await res.json();
    setPlacedOrderId(order.id);
    clear();
    setComment("");
    removePromo();
  }

  if (placedOrderId) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <main className="max-w-2xl mx-auto w-full px-4 py-16 flex-1 text-center">
          <div className="text-4xl mb-4">✅</div>
          <h1 className="text-lg font-semibold text-slate-900 mb-2">Замовлення оформлено!</h1>
          <p className="text-sm text-slate-500 mb-6">
            Номер замовлення #{placedOrderId.slice(-6)}. Ми зв&apos;яжемося з вами для
            підтвердження.
          </p>
          <div className="flex items-center justify-center gap-3">
            <Link
              href="/orders"
              className="bg-brand text-white text-sm rounded-lg px-4 py-2 hover:bg-brand-dark"
            >
              Переглянути мої замовлення
            </Link>
            <Link
              href="/"
              className="text-sm text-slate-500 border border-slate-200 rounded-lg px-4 py-2 hover:bg-slate-50"
            >
              До каталогу
            </Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="max-w-4xl mx-auto w-full px-4 py-6 flex-1">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-lg font-semibold text-slate-900">Кошик — накладна</h1>
          <Link href="/" className="text-sm text-slate-500 hover:text-slate-900">
            ← Продовжити покупки
          </Link>
        </div>

        {profileIncomplete && (
          <div className="mb-6 rounded-xl border border-brand/30 bg-red-50 p-4 flex items-center justify-between gap-3 flex-wrap">
            <p className="text-sm text-slate-700">
              Щоб оформити замовлення, заповніть профіль і додайте хоча б один магазин
              (адресу доставки).
            </p>
            <Link
              href="/profile"
              className="bg-brand text-white text-sm rounded-lg px-4 py-2 hover:bg-brand-dark whitespace-nowrap"
            >
              Заповнити профіль
            </Link>
          </div>
        )}

        {loading ? (
          <p className="text-sm text-slate-500">Завантаження...</p>
        ) : items.length === 0 ? (
          <div className="border border-slate-200 bg-white rounded-xl p-8 text-center">
            <p className="text-sm text-slate-500 mb-4">Кошик порожній.</p>
            <Link
              href="/"
              className="bg-brand text-white text-sm rounded-lg px-4 py-2 hover:bg-brand-dark"
            >
              Перейти до каталогу
            </Link>
          </div>
        ) : (
          <>
            <div className="border border-slate-200 bg-white rounded-xl overflow-hidden mb-4">
              {/* Desktop/tablet: full invoice table (unchanged). Hidden on
                  mobile — a fixed 5-column table can't reflow on a narrow
                  screen, which is what made the price crowd into the
                  wrapped product name there. */}
              <table className="w-full text-sm hidden sm:table">
                <thead className="bg-slate-50 text-slate-500 text-xs">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">Товар</th>
                    <th className="text-right px-3 py-2 font-medium">Ціна за од.</th>
                    <th className="text-center px-3 py-2 font-medium">Кількість</th>
                    <th className="text-right px-3 py-2 font-medium">Сума</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(({ product, quantity }) => (
                    <tr key={product.id} className="border-t border-slate-100">
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          {product.images[0] ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={product.images[0].url}
                              alt=""
                              className="w-10 h-10 object-cover rounded"
                            />
                          ) : (
                            <div className="w-10 h-10 bg-slate-100 rounded shrink-0" />
                          )}
                          <div>
                            <span className="text-slate-800">{product.name}</span>
                            {packagingText(product.packQty, product.boxQty) && (
                              <div className="text-[11px] text-slate-400">
                                {packagingText(product.packQty, product.boxQty)}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right text-slate-600 whitespace-nowrap">
                        {product.price.toLocaleString("uk-UA")} ₴
                      </td>
                      <td className="px-3 py-2 text-center">
                        <QtyInput
                          value={quantity}
                          min={1}
                          max={product.stock}
                          onChange={(n) => setQty(product.id, n)}
                          className="w-16 border border-slate-200 rounded px-2 py-1 text-xs text-center"
                        />
                      </td>
                      <td className="px-3 py-2 text-right font-medium text-slate-900 whitespace-nowrap">
                        {(product.price * quantity).toLocaleString("uk-UA")} ₴
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          onClick={() => remove(product.id)}
                          className="text-xs text-red-500 hover:text-red-700"
                        >
                          Видалити
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Mobile: stacked cards — the name gets a full-width line of
                  its own, and price/qty/sum sit on a second line below it,
                  so nothing crowds the wrapped product name. */}
              <div className="sm:hidden divide-y divide-slate-100">
                {items.map(({ product, quantity }) => (
                  <div key={product.id} className="p-3">
                    <div className="flex items-start gap-2 mb-2">
                      {product.images[0] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={product.images[0].url}
                          alt=""
                          className="w-12 h-12 object-cover rounded shrink-0"
                        />
                      ) : (
                        <div className="w-12 h-12 bg-slate-100 rounded shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <span className="text-sm text-slate-800">{product.name}</span>
                        {packagingText(product.packQty, product.boxQty) && (
                          <div className="text-[11px] text-slate-400">
                            {packagingText(product.packQty, product.boxQty)}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => remove(product.id)}
                        className="text-xs text-red-500 hover:text-red-700 shrink-0 pt-0.5"
                      >
                        Видалити
                      </button>
                    </div>
                    <div className="flex items-center justify-between gap-2 pl-[56px]">
                      <QtyInput
                        value={quantity}
                        min={1}
                        max={product.stock}
                        onChange={(n) => setQty(product.id, n)}
                        className="w-16 border border-slate-200 rounded px-2 py-1 text-xs text-center"
                      />
                      <div className="text-right shrink-0">
                        <div className="text-xs text-slate-500">
                          {product.price.toLocaleString("uk-UA")} ₴/шт
                        </div>
                        <div className="text-sm font-medium text-slate-900">
                          {(product.price * quantity).toLocaleString("uk-UA")} ₴
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="border border-slate-200 bg-white rounded-xl p-4">
                <div className="mb-3">
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Промокод
                  </label>
                  {appliedPromo ? (
                    <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-lg px-2 py-1.5 text-xs">
                      <span className="text-emerald-700 font-medium">
                        {appliedPromo.code} застосовано
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
                  {promoError && <p className="text-xs text-red-600 mt-1">{promoError}</p>}
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

                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Коментар до замовлення
                </label>
                <textarea
                  placeholder="Необов'язково"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-xs resize-none"
                  rows={3}
                />
              </div>

              <div className="border border-slate-200 bg-white rounded-xl p-4 flex flex-col">
                <h2 className="text-sm font-semibold text-slate-900 mb-3">Підсумок накладної</h2>
                <div className="space-y-1 mb-3">
                  <div className="flex justify-between text-sm text-slate-500">
                    <span>Сума</span>
                    <span>{subtotal.toLocaleString("uk-UA")} ₴</span>
                  </div>
                  {discountAmount > 0 && (
                    <div className="flex justify-between text-sm text-emerald-600">
                      <span>Знижка</span>
                      <span>−{discountAmount.toLocaleString("uk-UA")} ₴</span>
                    </div>
                  )}
                  <div className="flex justify-between text-base font-semibold text-slate-900 border-t border-slate-100 pt-2">
                    <span>Разом</span>
                    <span>{total.toLocaleString("uk-UA")} ₴</span>
                  </div>
                </div>

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
                  disabled={items.length === 0 || placing || !shopId}
                  className="mt-auto w-full bg-brand text-white rounded-lg py-2 text-sm font-medium hover:bg-brand-dark disabled:opacity-50"
                >
                  {placing ? "Оформлюємо..." : "Підтвердити замовлення"}
                </button>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
