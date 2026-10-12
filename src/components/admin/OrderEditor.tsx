"use client";

import { useEffect, useMemo, useState } from "react";
import { CircleNotch, MagnifyingGlass, Plus, Trash, X } from "@phosphor-icons/react";
import {
  BAS_LABEL,
  BAS_STYLE,
  ORDER_STATUSES,
  STATUS_LABEL,
  kyivDateTime,
  money,
  type AdminOrderStatus,
} from "@/lib/adminOrders";

type Shop = { id: string; name: string; address: string };
type Line = {
  key: string;
  id?: string;
  productId: string;
  name: string;
  article: string | null;
  quantity: number;
  priceAtOrder: number;
};
type Loaded = {
  id: string;
  number: string;
  createdAt: string;
  status: AdminOrderStatus;
  basStatus: string;
  basError: string | null;
  comment: string | null;
  discountAmount: number;
  shopId: string | null;
  promoCode: { code: string } | null;
  user: { id: string; name: string; company: string | null; phone: string | null; email: string | null; shops: Shop[] };
  items: {
    id: string;
    productId: string;
    quantity: number;
    priceAtOrder: number;
    product: { id: string; name: string; article: string | null };
  }[];
};
type CatalogItem = { id: string; name: string; price: number; isActive?: boolean };

let seq = 0;
const nextKey = () => `n${++seq}`;

function toLines(o: Loaded): Line[] {
  return o.items.map((i) => ({
    key: i.id,
    id: i.id,
    productId: i.productId,
    name: i.product.name,
    article: i.product.article,
    quantity: i.quantity,
    priceAtOrder: i.priceAtOrder,
  }));
}

// Side panel where the admin checks and corrects a received order:
// status, delivery shop, comment, lines (quantity, price, add / remove)
// and the discount. Nothing is saved until "Зберегти".
export default function OrderEditor({
  id,
  onClose,
  onSaved,
}: {
  id: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [order, setOrder] = useState<Loaded | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  const [status, setStatus] = useState<AdminOrderStatus>("NEW");
  const [shopId, setShopId] = useState<string>("");
  const [comment, setComment] = useState("");
  const [discount, setDiscount] = useState("0");
  const [lines, setLines] = useState<Line[]>([]);

  const [catalog, setCatalog] = useState<CatalogItem[] | null>(null);
  const [search, setSearch] = useState("");

  function reset(o: Loaded) {
    setOrder(o);
    setStatus(o.status);
    setShopId(o.shopId ?? "");
    setComment(o.comment ?? "");
    setDiscount(String(o.discountAmount || 0));
    setLines(toLines(o));
  }

  useEffect(() => {
    let alive = true;
    fetch(`/api/admin/orders/${id}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Не вдалося відкрити замовлення");
        return d as Loaded;
      })
      .then((o) => alive && reset(o))
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const subtotal = useMemo(
    () => Math.round(lines.reduce((s, l) => s + l.quantity * l.priceAtOrder, 0) * 100) / 100,
    [lines]
  );
  const disc = Math.max(0, Number(discount.replace(",", ".")) || 0);
  const total = Math.max(0, Math.round((subtotal - disc) * 100) / 100);

  const dirty = useMemo(() => {
    if (!order) return false;
    const sig = (ls: Line[]) => JSON.stringify(ls.map((l) => [l.id, l.productId, l.quantity, l.priceAtOrder]));
    const a = sig(toLines(order));
    const b = sig(lines);
    return (
      a !== b ||
      status !== order.status ||
      (shopId || null) !== (order.shopId || null) ||
      comment.trim() !== (order.comment ?? "") ||
      disc !== (order.discountAmount || 0)
    );
  }, [order, lines, status, shopId, comment, disc]);

  const results = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!catalog || q.length < 2) return [];
    const words = q.split(/\s+/);
    return catalog
      .filter((p) => p.isActive !== false && words.every((w) => p.name.toLowerCase().includes(w)))
      .slice(0, 8);
  }, [catalog, search]);

  function ensureCatalog() {
    if (catalog) return;
    fetch("/api/products")
      .then((r) => r.json())
      .then((d: CatalogItem[]) => setCatalog(d))
      .catch(() => setCatalog([]));
  }

  function addProduct(p: CatalogItem) {
    setLines((ls) => {
      const same = ls.find((l) => l.productId === p.id);
      if (same) return ls.map((l) => (l === same ? { ...l, quantity: l.quantity + 1 } : l));
      return [...ls, { key: nextKey(), productId: p.id, name: p.name, article: null, quantity: 1, priceAtOrder: p.price }];
    });
    setSearch("");
  }

  async function save() {
    if (!order) return;
    if (lines.length === 0) {
      setError("У замовленні має лишитися хоча б одна позиція. Щоб прибрати все, поставте статус «Скасоване».");
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch(`/api/admin/orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          shopId: shopId || null,
          comment,
          discountAmount: disc,
          items: lines.map((l) => ({ id: l.id, productId: l.productId, quantity: l.quantity, priceAtOrder: l.priceAtOrder })),
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Не вдалося зберегти");
      reset(d as Loaded);
      setNotice("Збережено. Зміни підуть у BAF з найближчим обміном.");
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="Замовлення">
      <button type="button" aria-label="Закрити" className="absolute inset-0 bg-slate-900/40" onClick={onClose} />
      <section className="relative h-full w-full max-w-2xl bg-white shadow-2xl flex flex-col">
        <header className="flex items-start gap-3 px-5 py-4 border-b border-slate-200">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-slate-500">Замовлення</p>
            <h2 className="text-lg font-semibold tabular">
              № {order?.number ?? "…"}
              {order && <span className="ml-2 text-sm font-normal text-slate-500">{kyivDateTime(order.createdAt)}</span>}
            </h2>
            {order && (
              <p className="text-sm text-slate-700 truncate">
                {order.user.company || order.user.name}
                {order.user.phone && <span className="text-slate-500"> · {order.user.phone}</span>}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрити"
            className="h-9 w-9 inline-flex items-center justify-center rounded-lg hover:bg-slate-100"
          >
            <X size={18} />
          </button>
        </header>

        {!order && !error && (
          <div className="flex-1 flex items-center justify-center text-slate-500">
            <CircleNotch size={22} className="animate-spin" />
          </div>
        )}
        {!order && error && <p className="p-5 text-sm text-red-600">{error}</p>}

        {order && (
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs font-medium text-slate-600">Статус</span>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as AdminOrderStatus)}
                  className="mt-1 w-full h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm"
                >
                  {ORDER_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABEL[s]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-600">Магазин доставки</span>
                <select
                  value={shopId}
                  onChange={(e) => setShopId(e.target.value)}
                  className="mt-1 w-full h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm"
                >
                  <option value="">— не вказано —</option>
                  {order.user.shops.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} · {s.address}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <p className="text-xs text-slate-500">
              Обмін з BAF:{" "}
              <span className={BAS_STYLE[order.basStatus] ?? ""}>{BAS_LABEL[order.basStatus] ?? order.basStatus}</span>
              {order.basError && <span className="text-red-600"> — {order.basError}</span>}
              {order.basStatus === "SENT_TO_BAS" && " · після змін замовлення піде в BAF повторно"}
            </p>

            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold">Позиції ({lines.length})</h3>
              </div>
              <div className="rounded-xl border border-slate-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-xs text-slate-500">
                    <tr>
                      <th className="text-left font-medium px-3 py-2">Товар</th>
                      <th className="text-right font-medium px-2 py-2 w-20">К-сть</th>
                      <th className="text-right font-medium px-2 py-2 w-28">Ціна, ₴</th>
                      <th className="text-right font-medium px-3 py-2 w-24">Сума</th>
                      <th className="w-9" />
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l) => (
                      <tr key={l.key} className="border-t border-slate-100 align-top">
                        <td className="px-3 py-2">
                          <p className="leading-snug">{l.name}</p>
                          {!l.id && <p className="text-[11px] text-blue-600">додано</p>}
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            type="number"
                            inputMode="numeric"
                            min={1}
                            max={99999}
                            value={l.quantity}
                            onChange={(e) => {
                              const v = Math.max(1, Math.min(99999, Math.round(Number(e.target.value) || 1)));
                              setLines((ls) => ls.map((x) => (x.key === l.key ? { ...x, quantity: v } : x)));
                            }}
                            aria-label={`Кількість: ${l.name}`}
                            className="w-full h-9 rounded-md border border-slate-300 px-2 text-right tabular"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            type="number"
                            inputMode="decimal"
                            min={0}
                            step="0.01"
                            value={l.priceAtOrder}
                            onChange={(e) => {
                              const v = Math.max(0, Number(e.target.value) || 0);
                              setLines((ls) => ls.map((x) => (x.key === l.key ? { ...x, priceAtOrder: v } : x)));
                            }}
                            aria-label={`Ціна: ${l.name}`}
                            className="w-full h-9 rounded-md border border-slate-300 px-2 text-right tabular"
                          />
                        </td>
                        <td className="px-3 py-2 text-right tabular whitespace-nowrap">{money(l.quantity * l.priceAtOrder)}</td>
                        <td className="pr-2 py-1.5">
                          <button
                            type="button"
                            onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                            aria-label={`Прибрати: ${l.name}`}
                            className="h-9 w-8 inline-flex items-center justify-center rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50"
                          >
                            <Trash size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="relative mt-2">
                <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  onFocus={ensureCatalog}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Додати товар: назва або артикул"
                  aria-label="Додати товар"
                  className="w-full h-10 rounded-lg border border-dashed border-slate-300 pl-9 pr-3 text-sm"
                />
                {results.length > 0 && (
                  <ul className="absolute z-10 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg max-h-72 overflow-y-auto">
                    {results.map((p) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          onClick={() => addProduct(p)}
                          className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50"
                        >
                          <Plus size={14} className="text-slate-400 shrink-0" />
                          <span className="flex-1">{p.name}</span>
                          <span className="tabular text-slate-500">{money(p.price)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <label className="block">
              <span className="text-xs font-medium text-slate-600">Коментар</span>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={2}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </label>

            <div className="rounded-xl bg-slate-50 p-4 text-sm space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-600">Сума позицій</span>
                <span className="tabular">{money(subtotal)}</span>
              </div>
              <div className="flex justify-between items-center gap-3">
                <span className="text-slate-600">
                  Знижка{order.promoCode && <span className="text-slate-500"> (промокод {order.promoCode.code})</span>}
                </span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                  aria-label="Знижка, ₴"
                  className="w-28 h-8 rounded-md border border-slate-300 bg-white px-2 text-right tabular"
                />
              </div>
              <div className="flex justify-between pt-1.5 border-t border-slate-200 font-semibold">
                <span>Разом</span>
                <span className="tabular">{money(total)}</span>
              </div>
            </div>
          </div>
        )}

        {order && (
          <footer className="border-t border-slate-200 px-5 py-3 space-y-2">
            {error && <p className="text-sm text-red-600">{error}</p>}
            {notice && !dirty && <p className="text-sm text-emerald-700">{notice}</p>}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={save}
                disabled={!dirty || saving}
                className="h-10 rounded-lg bg-slate-900 px-5 text-sm font-semibold text-white disabled:opacity-40"
              >
                {saving ? "Зберігаю…" : "Зберегти зміни"}
              </button>
              <button
                type="button"
                onClick={() => order && reset(order)}
                disabled={!dirty || saving}
                className="h-10 rounded-lg border border-slate-300 px-4 text-sm disabled:opacity-40"
              >
                Скасувати зміни
              </button>
              <span className="ml-auto text-xs text-slate-500">{dirty ? "Є незбережені зміни" : ""}</span>
            </div>
          </footer>
        )}
      </section>
    </div>
  );
}
