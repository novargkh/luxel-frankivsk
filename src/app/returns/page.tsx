"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowUUpLeft, CaretDown, Check, ImageSquare, MagnifyingGlass, X } from "@phosphor-icons/react";
import Navbar from "@/components/Navbar";
import QtyInput from "@/components/QtyInput";
import { extractAttributes } from "@/lib/similarity";
import {
  RETURN_STATUS_COLORS,
  RETURN_STATUS_LABELS,
  type ReturnRequestDto,
} from "@/lib/returns";

type OrderItem = {
  id: string;
  quantity: number;
  priceAtOrder: number;
  product: { id: string; name: string; article?: string | null; images?: { url: string }[] };
};

type Order = {
  id: string;
  displayNumber?: string;
  status: "NEW" | "CONFIRMED" | "SHIPPED" | "CANCELLED";
  createdAt: string;
  items: OrderItem[];
};

const norm = (s: string) => s.toLowerCase().replace(/[\s\-_./()«»"',]+/g, "");
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit", year: "numeric" });

function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}

function articleOf(item: OrderItem) {
  return item.product.article ?? extractAttributes(item.product.name).article ?? "";
}

export default function ReturnsPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [returns, setReturns] = useState<ReturnRequestDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  // orderItemId -> quantity being returned
  const [picked, setPicked] = useState<Record<string, number>>({});
  const [reason, setReason] = useState("");
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  async function load() {
    const [ordersRes, returnsRes] = await Promise.all([fetch("/api/orders"), fetch("/api/returns")]);
    const o = await ordersRes.json();
    const r = await returnsRes.json();
    setOrders(Array.isArray(o) ? o : []);
    setReturns(Array.isArray(r) ? r : []);
    setLoading(false);
  }

  useEffect(() => {
    let alive = true;
    Promise.all([fetch("/api/orders"), fetch("/api/returns")])
      .then(([a, b]) => Promise.all([a.json(), b.json()]))
      .then(([o, r]) => {
        if (!alive) return;
        setOrders(Array.isArray(o) ? o : []);
        setReturns(Array.isArray(r) ? r : []);
        setLoading(false);
      })
      .catch(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  // How many units of each order line are already in a (not rejected) return.
  const alreadyReturned = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of returns) {
      if (r.status === "REJECTED") continue;
      for (const i of r.items) m.set(i.orderItemId, (m.get(i.orderItemId) ?? 0) + i.quantity);
    }
    return m;
  }, [returns]);

  const q = norm(query.trim());

  // Orders with something still returnable; while searching, only the
  // matching positions are listed.
  const groups = useMemo(() => {
    return orders
      .filter((o) => o.status !== "CANCELLED")
      .map((o) => ({
        order: o,
        items: o.items
          .map((item) => ({ item, available: item.quantity - (alreadyReturned.get(item.id) ?? 0) }))
          .filter(({ item, available }) => {
            if (available <= 0) return false;
            if (!q) return true;
            return norm(item.product.name).includes(q) || norm(articleOf(item)).includes(q);
          }),
      }))
      .filter((g) => g.items.length > 0);
  }, [orders, alreadyReturned, q]);

  const pickedEntries = Object.entries(picked).filter(([, n]) => n > 0);
  const pickedUnits = pickedEntries.reduce((s, [, n]) => s + n, 0);

  function toggleGroup(id: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function togglePick(itemId: string, available: number) {
    setPicked((prev) => {
      const next = { ...prev };
      if (next[itemId]) delete next[itemId];
      else next[itemId] = available;
      return next;
    });
  }

  async function submit() {
    if (pickedEntries.length === 0 || !reason.trim()) return;
    setSending(true);
    setMessage(null);
    const res = await fetch("/api/returns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reason,
        items: pickedEntries.map(([orderItemId, quantity]) => ({ orderItemId, quantity })),
      }),
    });
    setSending(false);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setMessage({ type: "error", text: err.error || "Не вдалося надіслати запит" });
      return;
    }
    setPicked({});
    setReason("");
    setOpen(new Set());
    setMessage({ type: "ok", text: "Запит на повернення надіслано. Ми зв'яжемося з вами." });
    load();
  }

  return (
    <div className="min-h-[100dvh] flex flex-col">
      <Navbar />
      <main className="max-w-3xl mx-auto w-full px-4 sm:px-6 pt-8 sm:pt-14 pb-24 flex-1">
        <header className="reveal mb-8">
          <h1 className="text-[40px] leading-[0.95] sm:text-5xl font-semibold tracking-[-0.045em] text-ink">
            Повернення
          </h1>
          <p className="mt-3 text-base text-muted">
            Оберіть позиції з ваших замовлень і опишіть причину.
          </p>
        </header>

        {loading ? (
          <div className="rounded-[1.75rem] glass-tray p-1.5" aria-busy="true">
            <div className="rounded-[calc(1.75rem-0.375rem)] glass-card h-40 animate-pulse" />
          </div>
        ) : (
          <>
            <section className="reveal rounded-[1.75rem] glass-tray p-1.5 mb-8" style={{ ["--i" as string]: 1 }}>
              <div className="rounded-[calc(1.75rem-0.375rem)] glass-card p-4 sm:p-6">
                <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-ink mb-3">
                  1. Що повертаєте
                </h2>

                {orders.length === 0 ? (
                  <p className="text-sm text-muted">У вас ще немає замовлень.</p>
                ) : (
                  <>
                    <div className="relative mb-3">
                      <MagnifyingGlass
                        size={18}
                        weight="light"
                        className="absolute left-4 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
                      />
                      <input
                        type="text"
                        inputMode="search"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Артикул або назва товару"
                        aria-label="Пошук позиції для повернення"
                        className="w-full h-11 rounded-full bg-white/80 ring-1 ring-white pl-11 pr-10 text-base text-ink placeholder:text-muted focus:outline-none focus:bg-white"
                      />
                      {query && (
                        <button
                          type="button"
                          onClick={() => setQuery("")}
                          aria-label="Очистити пошук"
                          className="absolute right-1.5 top-1/2 -translate-y-1/2 w-8 h-8 inline-flex items-center justify-center rounded-full text-muted hover:text-ink"
                        >
                          <X size={14} weight="light" />
                        </button>
                      )}
                    </div>

                    {groups.length === 0 ? (
                      <p className="px-1 text-sm text-muted">
                        {q ? "Такої позиції немає у ваших замовленнях." : "Немає позицій, які можна повернути."}
                      </p>
                    ) : (
                      <ul className="divide-y divide-black/[0.05] rounded-2xl bg-white/60 ring-1 ring-white overflow-hidden">
                        {groups.map(({ order, items }) => {
                          const isOpen = open.has(order.id) || q.length > 0;
                          const pickedHere = items.filter(({ item }) => picked[item.id]).length;
                          return (
                            <li key={order.id}>
                              <button
                                type="button"
                                onClick={() => toggleGroup(order.id)}
                                aria-expanded={isOpen}
                                className="w-full flex items-center gap-3 px-4 py-3 text-left"
                              >
                                <span className="flex-1 min-w-0">
                                  <span className="block text-[15px] font-semibold text-ink tabular">
                                    № {order.displayNumber ?? order.id.slice(-6).toUpperCase()}
                                  </span>
                                  <span className="block text-xs text-muted tabular">
                                    {fmtDate(order.createdAt)} · {items.length}{" "}
                                    {plural(items.length, "позиція", "позиції", "позицій")}
                                  </span>
                                </span>
                                {pickedHere > 0 && (
                                  <span className="pop shrink-0 rounded-full bg-brand text-white text-[11px] font-semibold px-2 py-0.5 tabular">
                                    {pickedHere}
                                  </span>
                                )}
                                <CaretDown
                                  size={14}
                                  weight="bold"
                                  className={`shrink-0 text-ink transition-transform duration-500 ease-fluid ${isOpen ? "rotate-180" : ""}`}
                                />
                              </button>

                              <div
                                className={`grid transition-all duration-500 ease-fluid ${
                                  isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                                }`}
                                aria-hidden={!isOpen}
                              >
                                <div className="min-h-0 overflow-hidden">
                                  <ul className="pb-2">
                                    {items.map(({ item, available }) => {
                                      const qty = picked[item.id] ?? 0;
                                      const checked = qty > 0;
                                      const img = item.product.images?.[0]?.url;
                                      return (
                                        <li
                                          key={item.id}
                                          className={`mx-2 px-2 py-2 rounded-xl flex items-center gap-3 transition-colors duration-300 ease-fluid ${
                                            checked ? "bg-brand/[0.06]" : ""
                                          }`}
                                        >
                                          <label className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer">
                                            <input
                                              type="checkbox"
                                              checked={checked}
                                              onChange={() => togglePick(item.id, available)}
                                              tabIndex={isOpen ? 0 : -1}
                                              className="w-5 h-5 shrink-0 accent-[var(--brand)]"
                                            />
                                            <span className="hidden sm:flex shrink-0 w-10 h-10 rounded-lg bg-paper overflow-hidden items-center justify-center text-muted/60">
                                              {img ? (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img src={img} alt="" loading="lazy" className="w-full h-full object-cover" />
                                              ) : (
                                                <ImageSquare size={16} weight="light" />
                                              )}
                                            </span>
                                            <span className="min-w-0">
                                              <span className="block text-[14px] leading-snug text-ink line-clamp-2">
                                                {item.product.name}
                                              </span>
                                              <span className="block text-xs text-muted tabular">
                                                Замовлено {item.quantity} шт
                                                {available < item.quantity && ` · можна повернути ${available}`}
                                              </span>
                                            </span>
                                          </label>
                                          {checked && (
                                            <div className="shrink-0 flex items-center gap-1 text-xs text-muted">
                                              <QtyInput
                                                value={qty}
                                                min={1}
                                                max={available}
                                                onChange={(n) => setPicked((p) => ({ ...p, [item.id]: n }))}
                                                className="w-14 h-9 rounded-lg bg-white ring-1 ring-black/10 px-2 text-center text-sm"
                                              />
                                              шт
                                            </div>
                                          )}
                                        </li>
                                      );
                                    })}
                                  </ul>
                                </div>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </>
                )}

                <h2 className="mt-6 text-[15px] font-semibold tracking-[-0.01em] text-ink mb-2">
                  2. Причина повернення
                </h2>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={3}
                  placeholder="Напр. «2 лампи не вмикаються», «пошкоджена упаковка», «помилилися з артикулом»"
                  className="w-full rounded-2xl bg-white/80 ring-1 ring-white px-4 py-3 text-base text-ink placeholder:text-muted focus:outline-none focus:bg-white resize-none"
                />

                {message && (
                  <p
                    role="status"
                    className={`mt-3 rounded-xl px-3 py-2 text-sm ${
                      message.type === "ok" ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"
                    }`}
                  >
                    {message.text}
                  </p>
                )}

                <div className="mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <span className="text-sm text-muted tabular">
                    {pickedEntries.length > 0
                      ? `Обрано: ${pickedEntries.length} ${plural(pickedEntries.length, "позиція", "позиції", "позицій")}, ${pickedUnits} шт`
                      : "Нічого не обрано"}
                  </span>
                  <button
                    type="button"
                    onClick={submit}
                    disabled={sending || pickedEntries.length === 0 || !reason.trim()}
                    className="h-12 inline-flex items-center justify-center gap-2 rounded-full bg-brand px-6 text-sm font-semibold text-white hover:bg-brand-dark active:scale-[0.98] transition-all duration-300 ease-fluid disabled:opacity-40"
                  >
                    <ArrowUUpLeft size={18} weight="bold" />
                    {sending ? "Надсилаємо..." : "Надіслати запит"}
                  </button>
                </div>
              </div>
            </section>

            {returns.length > 0 && (
              <section className="reveal" style={{ ["--i" as string]: 2 }}>
                <h2 className="text-xl font-semibold tracking-[-0.02em] text-ink mb-3">Мої повернення</h2>
                <ul className="space-y-3">
                  {returns.map((r) => (
                    <li key={r.id} className="rounded-[1.5rem] glass-tray p-1.5">
                      <div className="rounded-[calc(1.5rem-0.375rem)] glass-card px-4 sm:px-5 py-4">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-sm text-muted tabular">{fmtDate(r.createdAt)}</span>
                          <span
                            className={`inline-flex items-center gap-1 h-6 rounded-full px-2.5 text-xs font-medium ${RETURN_STATUS_COLORS[r.status]}`}
                          >
                            {r.status === "COMPLETED" && <Check size={12} weight="bold" />}
                            {RETURN_STATUS_LABELS[r.status]}
                          </span>
                        </div>
                        <ul className="mt-2 space-y-1">
                          {r.items.map((i) => (
                            <li key={i.id} className="flex items-baseline justify-between gap-3 text-sm">
                              <span className="min-w-0 text-ink line-clamp-2">
                                {i.orderItem.product.name}
                                {i.orderNumber && (
                                  <span className="text-muted tabular"> · № {i.orderNumber}</span>
                                )}
                              </span>
                              <span className="shrink-0 font-medium text-ink tabular">{i.quantity} шт</span>
                            </li>
                          ))}
                        </ul>
                        <p className="mt-2 text-sm text-ink/75 whitespace-pre-line">
                          <span className="text-muted">Причина: </span>
                          {r.reason}
                        </p>
                        {r.adminComment && (
                          <p className="mt-2 rounded-xl bg-white/70 px-3 py-2 text-sm text-ink whitespace-pre-line">
                            <span className="text-muted">Відповідь LUXEL: </span>
                            {r.adminComment}
                          </p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
