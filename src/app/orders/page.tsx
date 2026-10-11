"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  ArrowCounterClockwise,
  ArrowRight,
  CaretDown,
  ChatText,
  Check,
  DownloadSimple,
  ImageSquare,
  MagnifyingGlass,
  Storefront,
  X,
} from "@phosphor-icons/react";
import Navbar from "@/components/Navbar";
import { useCart } from "@/lib/cart";
import { extractAttributes } from "@/lib/similarity";
import { downloadCsv } from "@/lib/csv";

type OrderItem = {
  id: string;
  quantity: number;
  priceAtOrder: number;
  product: {
    id: string;
    name: string;
    price?: number;
    stock?: number;
    isActive?: boolean;
    images?: { id: string; url: string }[];
  };
};

type Order = {
  id: string;
  status: "NEW" | "CONFIRMED" | "SHIPPED" | "CANCELLED";
  comment: string | null;
  createdAt: string;
  items: OrderItem[];
  user?: { name: string; email: string; company: string | null };
  shop?: { id: string; name: string; address: string } | null;
  discountAmount: number;
  promoCode?: { code: string } | null;
  exportedAt?: string | null;
};

const STATUS_LABELS: Record<Order["status"], string> = {
  NEW: "Новий",
  CONFIRMED: "Підтверджено",
  SHIPPED: "Відправлено",
  CANCELLED: "Скасовано",
};

const STATUS_COLORS: Record<Order["status"], string> = {
  NEW: "bg-amber-100/80 text-amber-800",
  CONFIRMED: "bg-blue-100/80 text-blue-800",
  SHIPPED: "bg-emerald-100/80 text-emerald-800",
  CANCELLED: "bg-black/[0.06] text-muted",
};

const STATUS_FILTERS: { value: "ALL" | Order["status"]; label: string }[] = [
  { value: "ALL", label: "Усі" },
  { value: "NEW", label: "Нові" },
  { value: "CONFIRMED", label: "Підтверджені" },
  { value: "SHIPPED", label: "Відправлені" },
  { value: "CANCELLED", label: "Скасовані" },
];

const money = (n: number) => `${n.toLocaleString("uk-UA")} ₴`;
const shortId = (id: string) => id.slice(-6).toUpperCase();
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString("uk-UA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}

// A product can be re-ordered when it is still active and has stock. Old
// API responses without these fields are treated as orderable.
function canReorder(item: OrderItem) {
  const p = item.product;
  if (p.isActive === false) return false;
  if (typeof p.stock === "number" && p.stock <= 0) return false;
  return true;
}

export default function OrdersPage() {
  const { data: session } = useSession();
  const { cart, setQty } = useCart();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | Order["status"]>("ALL");
  // Row-level "added" feedback, keyed by order item id.
  const [justAdded, setJustAdded] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isAdmin = (session?.user as { role?: string } | undefined)?.role === "ADMIN";

  // Admin-only: export new orders into a CSV that can be loaded into 1С
  // (or any other ERP), one row per order line item.
  const [onlyNotExported, setOnlyNotExported] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);

  async function load(keepOpen = false) {
    setLoading((prev) => (keepOpen ? prev : true));
    const res = await fetch("/api/orders");
    const data: Order[] = await res.json();
    setOrders(data);
    // The newest order starts expanded; the rest stay compact.
    if (!keepOpen) setOpen(new Set(data[0] ? [data[0].id] : []));
    setLoading(false);
  }

  useEffect(() => {
    load();
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function updateStatus(orderId: string, status: Order["status"]) {
    await fetch(`/api/orders/${orderId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    load(true);
  }

  async function setExported(orderId: string, exported: boolean) {
    await fetch(`/api/orders/${orderId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ exported }),
    });
    load(true);
  }

  function showToast(text: string) {
    setToast(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  }

  // Adds the item's original quantity on top of whatever is already in the
  // cart, never exceeding the current stock.
  function addToCart(item: OrderItem, current: Record<string, number>) {
    const have = current[item.product.id] ?? 0;
    const stock = typeof item.product.stock === "number" ? item.product.stock : Infinity;
    const next = Math.min(stock, have + item.quantity);
    setQty(item.product.id, next);
    return { ...current, [item.product.id]: next };
  }

  function reorderItem(item: OrderItem) {
    if (!canReorder(item)) return;
    addToCart(item, cart);
    setJustAdded((prev) => new Set(prev).add(item.id));
    setTimeout(() => {
      setJustAdded((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    }, 1600);
    showToast(`Додано в кошик: ${item.product.name}`);
  }

  function reorderAll(order: Order) {
    let current = { ...cart };
    let added = 0;
    for (const item of order.items) {
      if (!canReorder(item)) continue;
      current = addToCart(item, current);
      added++;
    }
    const skipped = order.items.length - added;
    showToast(
      skipped > 0
        ? `Додано ${added} з ${order.items.length} позицій. ${skipped} немає в наявності.`
        : `Усі ${added} ${plural(added, "позиція", "позиції", "позицій")} додано в кошик`
    );
  }

  function toggleOpen(id: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const visibleOrders = useMemo(() => {
    const q = query.trim().toLowerCase();
    return orders.filter((o) => {
      if (isAdmin && onlyNotExported && o.exportedAt) return false;
      if (statusFilter !== "ALL" && o.status !== statusFilter) return false;
      if (q) {
        const hay = [
          o.id.slice(-6),
          o.shop?.name ?? "",
          o.user?.name ?? "",
          o.user?.company ?? "",
          ...o.items.map((i) => i.product.name),
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [orders, isAdmin, onlyNotExported, statusFilter, query]);

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Exports either the checked orders, or, if nothing is checked, every
  // order currently visible under the active filter.
  const exportTargets = useMemo(
    () => (selected.size > 0 ? visibleOrders.filter((o) => selected.has(o.id)) : visibleOrders),
    [visibleOrders, selected]
  );

  function exportToCsv() {
    const rows: (string | number)[][] = [
      [
        "№ замовлення",
        "Дата",
        "Клієнт",
        "Компанія",
        "Email",
        "Магазин",
        "Адреса доставки",
        "Товар",
        "Артикул",
        "Кількість",
        "Ціна за од.",
        "Сума рядка",
        "Промокод",
        "Знижка замовлення",
        "Коментар",
        "Статус",
      ],
    ];

    for (const order of exportTargets) {
      for (const item of order.items) {
        const article = extractAttributes(item.product.name).article ?? "";
        rows.push([
          order.id.slice(-6),
          new Date(order.createdAt).toLocaleString("uk-UA"),
          order.user?.name ?? "",
          order.user?.company ?? "",
          order.user?.email ?? "",
          order.shop?.name ?? "",
          order.shop?.address ?? "",
          item.product.name,
          article,
          item.quantity,
          item.priceAtOrder,
          item.priceAtOrder * item.quantity,
          order.promoCode?.code ?? "",
          order.discountAmount || 0,
          order.comment ?? "",
          STATUS_LABELS[order.status],
        ]);
      }
    }

    downloadCsv(`luxel-zamovlennya-${new Date().toISOString().slice(0, 10)}.csv`, rows);
  }

  async function markExportTargetsExported() {
    setExporting(true);
    try {
      await Promise.all(
        exportTargets.map((o) =>
          fetch(`/api/orders/${o.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ exported: true }),
          })
        )
      );
      setSelected(new Set());
      await load(true);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="min-h-[100dvh] flex flex-col">
      <Navbar />
      <main className="max-w-6xl mx-auto w-full px-4 sm:px-6 pt-8 sm:pt-14 pb-24 flex-1">
        <header className="reveal mb-8">
          <h1 className="text-[40px] leading-[0.95] sm:text-5xl font-semibold tracking-[-0.045em] text-ink">
            {isAdmin ? "Усі замовлення" : "Мої замовлення"}
          </h1>
          {!loading && orders.length > 0 && (
            <p className="mt-3 text-base text-muted tabular">
              {orders.length} {plural(orders.length, "замовлення", "замовлення", "замовлень")}
            </p>
          )}
        </header>

        {isAdmin && !loading && orders.length > 0 && (
          <div className="reveal rounded-[1.75rem] glass-tray p-1.5 mb-6" style={{ ["--i" as string]: 1 }}>
            <div className="rounded-[calc(1.75rem-0.375rem)] glass-card p-5 sm:p-6">
              <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-ink mb-1">
                Вивантаження в 1С
              </h2>
              <p className="text-sm text-muted mb-4 max-w-[70ch]">
                CSV по одному рядку на товар. Позначте вивантажені замовлення, щоб наступного
                разу не експортувати їх повторно.
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  aria-pressed={onlyNotExported}
                  onClick={() => {
                    setOnlyNotExported((v) => !v);
                    setSelected(new Set());
                  }}
                  className={`h-10 rounded-full px-4 text-sm font-medium transition-all duration-300 ease-fluid ${
                    onlyNotExported ? "bg-ink text-white" : "bg-white/70 ring-1 ring-white text-ink"
                  }`}
                >
                  Тільки невивантажені
                </button>
                <button
                  onClick={exportToCsv}
                  disabled={exportTargets.length === 0}
                  className="h-10 inline-flex items-center gap-2 rounded-full bg-brand px-4 text-sm font-medium text-white hover:bg-brand-dark active:scale-[0.98] transition-all duration-300 ease-fluid disabled:opacity-40"
                >
                  <DownloadSimple size={16} weight="bold" />
                  CSV ({exportTargets.length})
                </button>
                <button
                  onClick={markExportTargetsExported}
                  disabled={exportTargets.length === 0 || exporting}
                  className="h-10 rounded-full px-4 text-sm font-medium bg-white/70 ring-1 ring-white text-ink hover:bg-white active:scale-[0.98] transition-all duration-300 ease-fluid disabled:opacity-40"
                >
                  {exporting ? "Позначаю..." : `Позначити вивантаженими (${exportTargets.length})`}
                </button>
                <span className="text-xs text-muted tabular">
                  {selected.size > 0 ? `Обрано: ${selected.size}` : "Буде взято всі показані"}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Search + status filter */}
        {!loading && orders.length > 0 && (
          <div className="reveal mb-6 space-y-3" style={{ ["--i" as string]: 2 }}>
            <div className="relative">
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
                placeholder="Товар, артикул або №"
                aria-label="Пошук у замовленнях"
                className="w-full h-12 rounded-full bg-white/80 ring-1 ring-white shadow-[0_1px_2px_rgba(16,17,20,0.05)] pl-11 pr-11 text-base text-ink placeholder:text-muted focus:outline-none focus:bg-white focus:shadow-[0_0_0_4px_rgba(255,255,255,0.6),0_8px_24px_-10px_rgba(16,17,20,0.25)]"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="Очистити пошук"
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 inline-flex items-center justify-center rounded-full text-muted hover:text-ink hover:bg-ink/[0.05]"
                >
                  <X size={16} weight="light" />
                </button>
              )}
            </div>
            <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0">
              {STATUS_FILTERS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  aria-pressed={statusFilter === f.value}
                  onClick={() => setStatusFilter(f.value)}
                  className={`shrink-0 h-9 rounded-full px-4 text-sm font-medium whitespace-nowrap active:scale-[0.97] transition-all duration-300 ease-fluid ${
                    statusFilter === f.value
                      ? "bg-ink text-white"
                      : "bg-white/70 ring-1 ring-white text-ink hover:bg-white"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {loading ? (
          <div className="space-y-3" aria-busy="true" aria-label="Завантаження замовлень">
            {[0, 1, 2].map((i) => (
              <div key={i} className="rounded-[1.75rem] glass-tray p-1.5">
                <div className="rounded-[calc(1.75rem-0.375rem)] glass-card h-24 animate-pulse" />
              </div>
            ))}
          </div>
        ) : orders.length === 0 ? (
          <div className="rounded-[1.75rem] glass-tray p-1.5">
            <div className="rounded-[calc(1.75rem-0.375rem)] glass-card px-6 py-16 text-center">
              <p className="text-xl font-semibold tracking-[-0.02em] text-ink">Замовлень поки немає</p>
              <p className="mt-1.5 text-[15px] text-muted">Оберіть товари в каталозі.</p>
              <Link
                href="/"
                className="mt-6 inline-flex h-11 items-center rounded-full bg-ink px-6 text-sm font-medium text-white"
              >
                До каталогу
              </Link>
            </div>
          </div>
        ) : visibleOrders.length === 0 ? (
          <p className="px-1 text-[15px] text-muted">
            {isAdmin && onlyNotExported && !query && statusFilter === "ALL"
              ? "Усі замовлення вже вивантажені в 1С."
              : "Нічого не знайдено за цими умовами."}
          </p>
        ) : (
          <div className="space-y-3">
            {visibleOrders.map((order, oi) => {
              const subtotal = order.items.reduce((s, i) => s + i.priceAtOrder * i.quantity, 0);
              const total = Math.max(0, subtotal - (order.discountAmount || 0));
              const isOpen = open.has(order.id) || query.trim().length > 0;
              const units = order.items.reduce((s, i) => s + i.quantity, 0);
              return (
                <section
                  key={order.id}
                  className="reveal rounded-[1.75rem] glass-tray p-1.5"
                  style={{ ["--i" as string]: Math.min(oi + 3, 10) }}
                >
                  <div
                    className={`rounded-[calc(1.75rem-0.375rem)] glass-card overflow-hidden transition-shadow duration-500 ease-fluid ${
                      isOpen ? "shadow-lift" : ""
                    }`}
                  >
                    {/* Order summary row */}
                    <div className="flex items-start gap-3 px-4 sm:px-6 py-4 sm:py-5">
                      {isAdmin && (
                        <input
                          type="checkbox"
                          checked={selected.has(order.id)}
                          onChange={() => toggleSelected(order.id)}
                          aria-label={`Обрати замовлення ${shortId(order.id)}`}
                          className="mt-1.5 w-4 h-4 accent-[var(--ink)]"
                        />
                      )}
                      <button
                        type="button"
                        onClick={() => toggleOpen(order.id)}
                        aria-expanded={isOpen}
                        className="group flex-1 min-w-0 text-left"
                      >
                        <div className="flex items-center gap-x-3 gap-y-1 flex-wrap">
                          <span className="text-lg sm:text-xl font-semibold tracking-[-0.02em] text-ink tabular">
                            № {shortId(order.id)}
                          </span>
                          {!isAdmin && (
                            <span
                              className={`inline-flex items-center h-6 rounded-full px-2.5 text-xs font-medium ${STATUS_COLORS[order.status]}`}
                            >
                              {STATUS_LABELS[order.status]}
                            </span>
                          )}
                        </div>
                        <div className="mt-1 text-sm text-muted tabular">
                          {fmtDate(order.createdAt)}
                          <span className="mx-1.5">·</span>
                          <span className="whitespace-nowrap">
                            {order.items.length} {plural(order.items.length, "позиція", "позиції", "позицій")},{" "}
                            {units} шт
                          </span>
                        </div>
                        {isAdmin && order.user && (
                          <div className="mt-1 text-sm text-ink/75 truncate">
                            {order.user.name} ({order.user.company ?? order.user.email})
                          </div>
                        )}
                        {order.shop && (
                          <div className="mt-1 flex items-start gap-1.5 text-sm text-muted min-w-0">
                            <Storefront size={16} weight="light" className="shrink-0 mt-0.5" />
                            <span className="min-w-0">
                              <span className="text-ink/80">{order.shop.name}</span>
                              <span className="hidden sm:inline">, {order.shop.address}</span>
                            </span>
                          </div>
                        )}
                      </button>

                      <div className="shrink-0 flex flex-col items-end gap-2">
                        <span className="text-lg sm:text-xl font-semibold tracking-[-0.02em] text-ink tabular whitespace-nowrap">
                          {money(total)}
                        </span>
                        <button
                          type="button"
                          onClick={() => toggleOpen(order.id)}
                          aria-label={isOpen ? "Згорнути" : "Розгорнути"}
                          className={`w-9 h-9 inline-flex items-center justify-center rounded-full transition-all duration-500 ease-fluid ${
                            isOpen ? "bg-ink text-white rotate-180" : "bg-ink/[0.05] text-ink"
                          }`}
                        >
                          <CaretDown size={14} weight="bold" />
                        </button>
                      </div>
                    </div>

                    {isAdmin && (
                      <div className="flex items-center gap-2 flex-wrap px-4 sm:px-6 pb-4 -mt-1">
                        <select
                          value={order.status}
                          onChange={(e) => updateStatus(order.id, e.target.value as Order["status"])}
                          aria-label="Статус замовлення"
                          className={`h-8 rounded-full pl-3 pr-2 text-xs font-medium border-0 ${STATUS_COLORS[order.status]}`}
                        >
                          {Object.entries(STATUS_LABELS).map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                        {order.exportedAt ? (
                          <button
                            onClick={() => setExported(order.id, false)}
                            className="h-8 inline-flex items-center gap-1 rounded-full px-3 text-xs font-medium bg-emerald-100/80 text-emerald-800"
                            title="Клацніть, щоб зняти позначку"
                          >
                            <Check size={12} weight="bold" />
                            Вивантажено {new Date(order.exportedAt).toLocaleDateString("uk-UA")}
                          </button>
                        ) : (
                          <span className="h-8 inline-flex items-center rounded-full px-3 text-xs font-medium bg-amber-100/80 text-amber-800">
                            Не вивантажено в 1С
                          </span>
                        )}
                      </div>
                    )}

                    {/* Animated expand */}
                    <div
                      className={`grid transition-all duration-500 ease-fluid ${
                        isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                      }`}
                      aria-hidden={!isOpen}
                    >
                      <div className="min-h-0 overflow-hidden">
                        <div className="border-t border-black/[0.05]">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-xs text-muted">
                                <th scope="col" className="text-left font-medium py-2.5 pl-4 sm:pl-6 pr-2">
                                  Товар
                                </th>
                                <th scope="col" className="hidden sm:table-cell text-right font-medium py-2.5 px-2 w-24">
                                  Ціна
                                </th>
                                <th scope="col" className="text-right font-medium py-2.5 px-2 w-12 sm:w-16">
                                  Шт
                                </th>
                                <th scope="col" className="text-right font-medium py-2.5 px-2 w-20 sm:w-28">
                                  Сума
                                </th>
                                <th scope="col" className="py-2.5 pl-1 pr-3 sm:pr-6 w-11 sm:w-36">
                                  <span className="sr-only">Повторити</span>
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {order.items.map((item, ii) => {
                                const ok = canReorder(item);
                                const added = justAdded.has(item.id);
                                const img = item.product.images?.[0]?.url;
                                const inCart = cart[item.product.id] ?? 0;
                                return (
                                  <tr
                                    key={item.id}
                                    className={`border-t border-black/[0.04] align-middle hover:bg-white/60 transition-colors duration-300 ease-fluid ${
                                      isOpen && ii < 14 ? "rise" : ""
                                    }`}
                                    style={isOpen ? { ["--i" as string]: ii } : undefined}
                                  >
                                    <td className="py-3 pl-4 sm:pl-6 pr-2">
                                      <div className="flex items-center gap-3 min-w-0">
                                        <span className="hidden sm:flex shrink-0 w-11 h-11 rounded-xl bg-paper overflow-hidden items-center justify-center text-muted/60">
                                          {img ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img src={img} alt="" loading="lazy" className="w-full h-full object-cover" />
                                          ) : (
                                            <ImageSquare size={18} weight="light" />
                                          )}
                                        </span>
                                        <span className="min-w-0">
                                          <span className="block text-[14px] leading-snug text-ink line-clamp-2">
                                            {item.product.name}
                                          </span>
                                          <span className="sm:hidden block mt-0.5 text-xs text-muted tabular">
                                            {money(item.priceAtOrder)}/шт
                                          </span>
                                          {inCart > 0 && (
                                            <span className="block mt-0.5 text-xs text-brand tabular">
                                              У кошику: {inCart}
                                            </span>
                                          )}
                                        </span>
                                      </div>
                                    </td>
                                    <td className="hidden sm:table-cell py-3 px-2 text-right text-muted tabular whitespace-nowrap">
                                      {money(item.priceAtOrder)}
                                    </td>
                                    <td className="py-3 px-2 text-right text-ink tabular font-medium">
                                      {item.quantity}
                                    </td>
                                    <td className="py-3 px-2 text-right text-ink tabular font-semibold whitespace-nowrap">
                                      {money(item.priceAtOrder * item.quantity)}
                                    </td>
                                    <td className="py-3 pl-1 pr-3 sm:pr-6 text-right">
                                      <button
                                        type="button"
                                        disabled={!ok}
                                        onClick={() => reorderItem(item)}
                                        title={ok ? `Додати ${item.quantity} шт у кошик` : "Немає в наявності"}
                                        aria-label={
                                          ok
                                            ? `Замовити повторно: ${item.product.name}, ${item.quantity} шт`
                                            : `Немає в наявності: ${item.product.name}`
                                        }
                                        className={`inline-flex items-center justify-center gap-1.5 h-9 w-9 sm:w-auto sm:px-3.5 rounded-full text-xs font-medium whitespace-nowrap active:scale-90 transition-all duration-300 ease-fluid disabled:cursor-not-allowed ${
                                          added
                                            ? "bg-emerald-500 text-white"
                                            : ok
                                              ? "bg-ink/[0.05] text-ink hover:bg-ink hover:text-white"
                                              : "bg-transparent text-muted/60"
                                        }`}
                                      >
                                        {added ? (
                                          <Check size={15} weight="bold" className="pop" />
                                        ) : (
                                          <ArrowCounterClockwise size={15} weight="bold" />
                                        )}
                                        <span className="hidden sm:inline">
                                          {added ? "Додано" : ok ? "Повторити" : "Немає"}
                                        </span>
                                      </button>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>

                        {/* Totals + actions */}
                        <div className="border-t border-black/[0.05] px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
                          <div className="space-y-1 text-sm min-w-0">
                            {order.comment && (
                              <p className="flex items-start gap-1.5 text-muted">
                                <ChatText size={16} weight="light" className="shrink-0 mt-0.5" />
                                <span className="italic">{order.comment}</span>
                              </p>
                            )}
                            {order.discountAmount > 0 && (
                              <p className="text-emerald-700 tabular">
                                Промокод {order.promoCode?.code ?? ""}: -{money(order.discountAmount)}
                              </p>
                            )}
                            <p className="text-ink tabular">
                              <span className="text-muted">Разом: </span>
                              <span className="font-semibold">{money(total)}</span>
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => reorderAll(order)}
                            disabled={!order.items.some(canReorder)}
                            className="group self-stretch sm:self-auto h-12 inline-flex items-center justify-between gap-3 rounded-full bg-ink pl-5 pr-1.5 text-sm font-medium text-white whitespace-nowrap active:scale-[0.98] transition-transform duration-300 ease-fluid disabled:opacity-40"
                          >
                            Повторити все замовлення
                            <span className="w-9 h-9 rounded-full bg-white/15 inline-flex items-center justify-center transition-transform duration-500 ease-fluid group-hover:-rotate-45">
                              <ArrowCounterClockwise size={16} weight="bold" />
                            </span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </main>

      {/* Toast after adding to cart */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="no-print fixed inset-x-3 z-30 bottom-[calc(max(env(safe-area-inset-bottom),12px)+80px)] md:bottom-6 pointer-events-none"
        >
          <div className="reveal glass glass-strong pointer-events-auto mx-auto max-w-lg rounded-full pl-5 pr-1.5 py-1.5 flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 min-w-0 text-sm text-ink">
              <Check size={16} weight="bold" className="shrink-0 text-emerald-600" />
              <span className="truncate">{toast}</span>
            </span>
            <Link
              href="/cart"
              className="group shrink-0 h-10 inline-flex items-center gap-2 rounded-full bg-brand pl-4 pr-1 text-sm font-semibold text-white"
            >
              Кошик
              <span className="w-8 h-8 rounded-full bg-white/15 inline-flex items-center justify-center transition-transform duration-500 ease-fluid group-hover:translate-x-0.5">
                <ArrowRight size={14} weight="bold" />
              </span>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
