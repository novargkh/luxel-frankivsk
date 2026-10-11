"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import {
  ArrowRight,
  ArrowUUpLeft,
  CaretDown,
  Check,
  MagnifyingGlass,
  Minus,
  Plus,
  X,
} from "@phosphor-icons/react";
import Navbar from "@/components/Navbar";
import QtyInput from "@/components/QtyInput";
import { textMatches } from "@/lib/itemSearch";

type OrderItem = {
  id: string;
  quantity: number;
  priceAtOrder: number;
  product: { id: string; name: string };
};
type Order = {
  id: string;
  number?: string | null;
  status: "NEW" | "CONFIRMED" | "SHIPPED" | "CANCELLED";
  createdAt: string;
  items: OrderItem[];
};
type ReturnStatus = "NEW" | "APPROVED" | "REJECTED" | "COMPLETED";
type ReturnRequest = {
  id: string;
  number: string | null;
  reason: string;
  adminComment: string | null;
  status: ReturnStatus;
  createdAt: string;
  user?: { name: string; company: string | null; email: string };
  items: {
    id: string;
    quantity: number;
    orderItem: OrderItem & { order: { id: string; createdAt: string; number: string | null } };
  }[];
};

const STATUS: Record<ReturnStatus, { label: string; cls: string }> = {
  NEW: { label: "Нова", cls: "bg-amber-100/80 text-amber-800" },
  APPROVED: { label: "Погоджено", cls: "bg-blue-100/80 text-blue-800" },
  REJECTED: { label: "Відхилено", cls: "bg-black/[0.06] text-muted" },
  COMPLETED: { label: "Виконано", cls: "bg-emerald-100/80 text-emerald-800" },
};

const money = (n: number) => `${n.toLocaleString("uk-UA")} ₴`;
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit", year: "numeric" });

function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}

const fieldCls =
  "w-full rounded-2xl bg-white/80 ring-1 ring-white text-base text-ink placeholder:text-muted shadow-[0_1px_2px_rgba(16,17,20,0.05)] focus:outline-none focus:bg-white focus:shadow-[0_0_0_4px_rgba(255,255,255,0.6),0_8px_24px_-10px_rgba(16,17,20,0.25)]";

export default function ReturnsPage() {
  const { data: session } = useSession();
  const isAdmin = (session?.user as { role?: string } | undefined)?.role === "ADMIN";

  const [orders, setOrders] = useState<Order[]>([]);
  const [requests, setRequests] = useState<ReturnRequest[]>([]);
  const [returned, setReturned] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Set<string>>(new Set());
  // orderItemId -> quantity to return
  const [picked, setPicked] = useState<Record<string, number>>({});
  const [reason, setReason] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<string | null>(null);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const [reasonFocus, setReasonFocus] = useState(false);

  async function load() {
    const [oRes, rRes] = await Promise.all([fetch("/api/orders"), fetch("/api/returns")]);
    const o: Order[] = oRes.ok ? await oRes.json() : [];
    const r = rRes.ok ? await rRes.json() : { requests: [], returned: {} };
    setOrders(Array.isArray(o) ? o.filter((x) => x.status !== "CANCELLED") : []);
    setRequests(r.requests ?? []);
    setReturned(r.returned ?? {});
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const left = (item: OrderItem) => Math.max(0, item.quantity - (returned[item.id] ?? 0));

  // Orders (and their lines) shown in the picker, narrowed by search.
  const q = query.trim();
  const pickerOrders = useMemo(() => {
    return orders
      .map((o) => {
        const lines = o.items.filter((i) => left(i) > 0 && (!q || textMatches(i.product.name, q)));
        const byNumber = q && textMatches(o.number ?? "", q);
        return { order: o, lines: byNumber ? o.items.filter((i) => left(i) > 0) : lines };
      })
      .filter((x) => x.lines.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, q, returned]);

  const allLines = useMemo(() => new Map(orders.flatMap((o) => o.items.map((i) => [i.id, { item: i, order: o }]))), [orders]);
  const pickedEntries = Object.entries(picked).filter(([, n]) => n > 0);
  const pickedUnits = pickedEntries.reduce((s, [, n]) => s + n, 0);

  function toggleLine(item: OrderItem, orderId?: string) {
    // Keep the order expanded once something in it is picked, so the choice
    // stays visible after the search is cleared to look for the next item.
    if (orderId && !picked[item.id]) setOpen((prev) => new Set(prev).add(orderId));
    setPicked((prev) => {
      const next = { ...prev };
      if (next[item.id]) delete next[item.id];
      else next[item.id] = left(item);
      return next;
    });
  }

  function goToReason() {
    reasonRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => reasonRef.current?.focus({ preventScroll: true }), 350);
  }

  function setLineQty(item: OrderItem, n: number) {
    setPicked((prev) => {
      const next = { ...prev };
      const v = Math.max(0, Math.min(left(item), n));
      if (v === 0) delete next[item.id];
      else next[item.id] = v;
      return next;
    });
  }

  async function submit() {
    setSending(true);
    setError("");
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
      const e = await res.json().catch(() => ({}));
      setError(e.error || "Не вдалося надіслати заявку");
      return;
    }
    const created = await res.json();
    setDone(created.number ?? "");
    setPicked({});
    setReason("");
    setQuery("");
    load();
  }

  async function patchReturn(id: string, body: { status?: ReturnStatus; adminComment?: string }) {
    await fetch(`/api/returns/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    load();
  }
  const setStatus = (id: string, status: ReturnStatus) => patchReturn(id, { status });
  const [replyDraft, setReplyDraft] = useState<Record<string, string>>({});

  const canSend = pickedEntries.length > 0 && reason.trim().length >= 3 && !sending;

  return (
    <div className="min-h-[100dvh] flex flex-col">
      <Navbar />
      <main className="max-w-4xl mx-auto w-full px-4 sm:px-6 pt-8 sm:pt-14 pb-24 flex-1">
        <header className="reveal mb-8">
          <h1 className="text-[40px] leading-[0.95] sm:text-5xl font-semibold tracking-[-0.045em] text-ink">
            Повернення
          </h1>
          <p className="mt-3 text-base text-muted max-w-[55ch]">
            {isAdmin
              ? "Заявки клієнтів на повернення товару."
              : "Оберіть позиції з ваших замовлень, вкажіть кількість і причину."}
          </p>
        </header>

        {!isAdmin && (
          <section className="reveal rounded-[1.75rem] glass-tray p-1.5 mb-10" style={{ ["--i" as string]: 1 }}>
            <div className="rounded-[calc(1.75rem-0.375rem)] glass-card p-4 sm:p-6">
              {done !== null && (
                <div className="rise mb-5 flex items-start gap-3 rounded-2xl bg-emerald-50/90 ring-1 ring-emerald-100 p-4">
                  <Check size={20} weight="bold" className="text-emerald-600 shrink-0 mt-0.5" />
                  <p className="text-sm text-emerald-900 flex-1">
                    Заявку{done ? ` № ${done}` : ""} надіслано. Менеджер розгляне її і зв&apos;яжеться з вами.
                  </p>
                  <button onClick={() => setDone(null)} aria-label="Закрити" className="text-emerald-700">
                    <X size={16} weight="bold" />
                  </button>
                </div>
              )}

              <h2 className="text-[15px] font-semibold text-ink">1. Позиції для повернення</h2>
              <p className="mt-1 mb-3 text-sm text-muted">
                Позначте всі товари, які повертаєте. Можна обрати кілька позицій, навіть з різних замовлень.
              </p>
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
                  placeholder="Артикул, товар або № замовлення"
                  aria-label="Пошук позиції"
                  className={`${fieldCls} h-12 pl-11 pr-4`}
                />
              </div>

              {loading ? (
                <div className="h-24 rounded-2xl bg-white/60 animate-pulse" />
              ) : pickerOrders.length === 0 ? (
                <p className="rounded-2xl bg-white/60 px-4 py-6 text-sm text-muted text-center">
                  {q ? "Нічого не знайдено." : "Немає позицій, які можна повернути."}
                </p>
              ) : (
                <ul className="space-y-2">
                  {pickerOrders.map(({ order, lines }) => {
                    const isOpen = open.has(order.id) || !!q;
                    const pickedHere = lines.filter((l) => picked[l.id]).length;
                    return (
                      <li key={order.id} className="rounded-2xl bg-white/70 ring-1 ring-white overflow-hidden">
                        <button
                          type="button"
                          onClick={() =>
                            setOpen((prev) => {
                              const n = new Set(prev);
                              if (n.has(order.id)) n.delete(order.id);
                              else n.add(order.id);
                              return n;
                            })
                          }
                          aria-expanded={isOpen}
                          className="w-full flex items-center gap-3 px-4 py-3 text-left"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block text-[15px] font-semibold text-ink tabular">
                              № {order.number ?? order.id.slice(-6)}
                            </span>
                            <span className="block text-xs text-muted tabular">
                              {fmtDate(order.createdAt)}, {lines.length}{" "}
                              {plural(lines.length, "позиція", "позиції", "позицій")}
                            </span>
                          </span>
                          {pickedHere > 0 && (
                            <span className="h-6 inline-flex items-center rounded-full bg-ink text-white px-2.5 text-xs font-medium tabular">
                              {pickedHere}
                            </span>
                          )}
                          <CaretDown
                            size={14}
                            weight="bold"
                            className={`text-muted transition-transform duration-500 ease-fluid ${isOpen ? "rotate-180" : ""}`}
                          />
                        </button>
                        <div
                          className={`grid transition-all duration-500 ease-fluid ${
                            isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                          }`}
                          aria-hidden={!isOpen}
                        >
                          <div className="min-h-0 overflow-hidden">
                            <ul className="border-t border-black/[0.05]">
                              {lines.map((l, i) => {
                                const on = !!picked[l.id];
                                const max = left(l);
                                return (
                                  <li
                                    key={l.id}
                                    className={`${isOpen ? "rise" : ""} flex items-center gap-3 px-4 py-3 border-t border-black/[0.04] first:border-t-0 ${
                                      on ? "bg-brand/[0.04]" : ""
                                    }`}
                                    style={{ ["--i" as string]: i }}
                                  >
                                    <button
                                      type="button"
                                      onClick={() => toggleLine(l, order.id)}
                                      aria-pressed={on}
                                      aria-label={`${on ? "Прибрати" : "Обрати"}: ${l.product.name}`}
                                      className={`w-6 h-6 shrink-0 rounded-lg inline-flex items-center justify-center transition-all duration-300 ease-fluid active:scale-90 ${
                                        on ? "bg-ink text-white" : "ring-1 ring-black/20 bg-white"
                                      }`}
                                    >
                                      {on && <Check size={14} weight="bold" className="pop" />}
                                    </button>
                                    <button type="button" onClick={() => toggleLine(l, order.id)} className="min-w-0 flex-1 text-left">
                                      <span className="block text-[14px] leading-snug text-ink line-clamp-2">
                                        {l.product.name}
                                      </span>
                                      <span className="block mt-0.5 text-xs text-muted tabular">
                                        {money(l.priceAtOrder)}/шт, можна повернути {max} шт
                                      </span>
                                    </button>
                                    {on && (
                                      <div className="shrink-0 inline-flex items-center h-9 rounded-full bg-white ring-1 ring-ink">
                                        <button
                                          type="button"
                                          aria-label="Менше"
                                          onClick={() => setLineQty(l, (picked[l.id] ?? 0) - 1)}
                                          className="w-9 h-9 inline-flex items-center justify-center rounded-full"
                                        >
                                          <Minus size={12} weight="bold" />
                                        </button>
                                        <QtyInput
                                          value={picked[l.id] ?? 0}
                                          max={max}
                                          onChange={(n) => setLineQty(l, n)}
                                          className="w-8 bg-transparent text-center text-base font-semibold tabular focus:outline-none"
                                        />
                                        <button
                                          type="button"
                                          aria-label="Більше"
                                          disabled={(picked[l.id] ?? 0) >= max}
                                          onClick={() => setLineQty(l, (picked[l.id] ?? 0) + 1)}
                                          className="w-9 h-9 inline-flex items-center justify-center rounded-full disabled:opacity-30"
                                        >
                                          <Plus size={12} weight="bold" />
                                        </button>
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

              {pickedEntries.length > 0 && (
                <div className="rise mt-4 rounded-2xl bg-white/80 ring-1 ring-white p-3">
                  <p className="px-1 text-sm font-medium text-ink tabular">
                    Обрано: {pickedEntries.length} {plural(pickedEntries.length, "позиція", "позиції", "позицій")},{" "}
                    {pickedUnits} шт
                  </p>
                  <p className="px-1 text-xs text-muted">Щоб додати ще, знайдіть товар вище і поставте позначку.</p>
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {pickedEntries.map(([id, n]) => {
                      const line = allLines.get(id);
                      if (!line) return null;
                      return (
                        <li
                          key={id}
                          className="inline-flex items-center gap-1.5 max-w-full h-8 rounded-full bg-ink/[0.05] pl-3 pr-1 text-xs text-ink"
                        >
                          <span className="truncate max-w-[14rem]">{line.item.product.name}</span>
                          <span className="tabular font-semibold whitespace-nowrap shrink-0">× {n}</span>
                          <button
                            type="button"
                            aria-label="Прибрати"
                            onClick={() => toggleLine(line.item)}
                            className="w-6 h-6 inline-flex items-center justify-center rounded-full hover:bg-white"
                          >
                            <X size={11} weight="bold" />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              <h2 className="text-[15px] font-semibold text-ink mt-6 mb-2">2. Причина повернення</h2>
              <textarea
                ref={reasonRef}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                onFocus={() => setReasonFocus(true)}
                onBlur={() => setReasonFocus(false)}
                rows={3}
                placeholder="Наприклад: брак, не працює після встановлення; помилка в замовленні"
                aria-label="Причина повернення"
                className={`${fieldCls} px-4 py-3`}
              />

              {error && <p className="mt-3 text-sm text-brand">{error}</p>}

              <button
                type="button"
                onClick={submit}
                disabled={!canSend}
                className="group mt-5 w-full sm:w-auto h-12 inline-flex items-center justify-between gap-3 rounded-full bg-ink pl-5 pr-1.5 text-sm font-medium text-white active:scale-[0.98] transition-transform duration-300 ease-fluid disabled:opacity-40"
              >
                {sending ? "Надсилаю..." : "Надіслати заявку"}
                <span className="w-9 h-9 rounded-full bg-white/15 inline-flex items-center justify-center transition-transform duration-500 ease-fluid group-hover:-rotate-45">
                  <ArrowUUpLeft size={16} weight="bold" />
                </span>
              </button>
            </div>
          </section>
        )}

        {/* Floating summary: shows the return keeps collecting positions and
            leads on to the reason / sending. */}
        {!isAdmin && pickedEntries.length > 0 && !reasonFocus && (
          <div className="no-print fixed inset-x-3 z-20 bottom-[calc(max(env(safe-area-inset-bottom),12px)+80px)] md:bottom-6 pointer-events-none">
            <div className="reveal glass glass-strong pointer-events-auto mx-auto max-w-xl rounded-[1.75rem] pl-5 pr-1.5 py-1.5 flex items-center justify-between gap-3">
              <div className="min-w-0 leading-tight">
                <div className="text-xs text-muted">Можна додати ще</div>
                <div key={pickedUnits} className="pop text-[15px] font-semibold tracking-[-0.01em] tabular text-ink">
                  {pickedEntries.length} {plural(pickedEntries.length, "позиція", "позиції", "позицій")}, {pickedUnits} шт
                </div>
              </div>
              <button
                type="button"
                onClick={reason.trim().length >= 3 ? submit : goToReason}
                disabled={sending}
                className="group h-12 inline-flex items-center gap-3 rounded-full bg-ink pl-5 pr-1.5 text-sm font-semibold text-white whitespace-nowrap disabled:opacity-40 active:scale-[0.98] transition-transform duration-300 ease-fluid"
              >
                {reason.trim().length >= 3 ? (sending ? "Надсилаю..." : "Надіслати") : "Далі: причина"}
                <span className="w-9 h-9 rounded-full bg-white/15 inline-flex items-center justify-center transition-transform duration-500 ease-fluid group-hover:translate-x-0.5">
                  <ArrowRight size={16} weight="bold" />
                </span>
              </button>
            </div>
          </div>
        )}

        <section>
          <h2 className="text-xl font-semibold tracking-[-0.02em] text-ink mb-3">
            {isAdmin ? "Усі заявки" : "Мої заявки"}
          </h2>
          {loading ? (
            <div className="h-24 rounded-[1.75rem] bg-white/60 animate-pulse" />
          ) : requests.length === 0 ? (
            <p className="text-[15px] text-muted">Заявок на повернення поки немає.</p>
          ) : (
            <ul className="space-y-3">
              {requests.map((r, ri) => {
                const sum = r.items.reduce((s, i) => s + i.quantity * i.orderItem.priceAtOrder, 0);
                return (
                  <li
                    key={r.id}
                    className="reveal rounded-[1.75rem] glass-tray p-1.5"
                    style={{ ["--i" as string]: Math.min(ri + 2, 10) }}
                  >
                    <div className="rounded-[calc(1.75rem-0.375rem)] glass-card p-4 sm:p-5">
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-lg font-semibold tracking-[-0.02em] text-ink tabular">
                              П № {r.number ?? r.id.slice(-6)}
                            </span>
                            {!isAdmin && (
                              <span className={`h-6 inline-flex items-center rounded-full px-2.5 text-xs font-medium ${STATUS[r.status].cls}`}>
                                {STATUS[r.status].label}
                              </span>
                            )}
                          </div>
                          <p className="mt-0.5 text-sm text-muted tabular">{fmtDate(r.createdAt)}</p>
                          {isAdmin && r.user && (
                            <p className="mt-0.5 text-sm text-ink/80">
                              {r.user.name}
                              {r.user.company ? ` (${r.user.company})` : ""}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-lg font-semibold text-ink tabular">{money(sum)}</span>
                          {isAdmin && (
                            <select
                              value={r.status}
                              onChange={(e) => setStatus(r.id, e.target.value as ReturnStatus)}
                              aria-label="Статус заявки"
                              className={`h-8 rounded-full pl-3 pr-2 text-xs font-medium border-0 ${STATUS[r.status].cls}`}
                            >
                              {Object.entries(STATUS).map(([v, s]) => (
                                <option key={v} value={v}>
                                  {s.label}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                      </div>

                      <table className="w-full text-sm mt-3">
                        <thead>
                          <tr className="text-xs text-muted">
                            <th scope="col" className="text-left font-medium py-2 pr-2">Товар</th>
                            <th scope="col" className="text-left font-medium py-2 px-2 hidden sm:table-cell">Замовлення</th>
                            <th scope="col" className="text-right font-medium py-2 pl-2 w-12">Шт</th>
                          </tr>
                        </thead>
                        <tbody>
                          {r.items.map((i) => (
                            <tr key={i.id} className="border-t border-black/[0.05]">
                              <td className="py-2 pr-2 text-ink">
                                <span className="line-clamp-2">{i.orderItem.product.name}</span>
                                <span className="sm:hidden block text-xs text-muted tabular">
                                  № {i.orderItem.order.number ?? i.orderItem.order.id.slice(-6)}
                                </span>
                              </td>
                              <td className="py-2 px-2 text-muted tabular whitespace-nowrap hidden sm:table-cell">
                                № {i.orderItem.order.number ?? i.orderItem.order.id.slice(-6)}
                              </td>
                              <td className="py-2 pl-2 text-right text-ink font-medium tabular">{i.quantity}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <p className="mt-3 text-sm text-ink/80">
                        <span className="text-muted">Причина: </span>
                        {r.reason}
                      </p>
                      {!isAdmin && r.adminComment && (
                        <p className="mt-2 rounded-2xl bg-white/80 ring-1 ring-white px-4 py-3 text-sm text-ink/80">
                          <span className="text-muted">Відповідь менеджера: </span>
                          {r.adminComment}
                        </p>
                      )}
                      {isAdmin && (
                        <div className="mt-3 flex gap-2">
                          <input
                            value={replyDraft[r.id] ?? r.adminComment ?? ""}
                            onChange={(e) => setReplyDraft((d) => ({ ...d, [r.id]: e.target.value }))}
                            placeholder="Відповідь клієнту"
                            aria-label="Відповідь клієнту"
                            className={`${fieldCls} h-10 px-4 text-sm`}
                          />
                          <button
                            type="button"
                            onClick={() => patchReturn(r.id, { adminComment: replyDraft[r.id] ?? r.adminComment ?? "" })}
                            className="shrink-0 h-10 rounded-full bg-ink px-4 text-sm font-medium text-white"
                          >
                            Зберегти
                          </button>
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
