"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import Navbar from "@/components/Navbar";
import { extractAttributes } from "@/lib/similarity";
import { downloadCsv } from "@/lib/csv";

type OrderItem = {
  id: string;
  quantity: number;
  priceAtOrder: number;
  product: { id: string; name: string };
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
  NEW: "bg-amber-50 text-amber-700",
  CONFIRMED: "bg-blue-50 text-blue-700",
  SHIPPED: "bg-emerald-50 text-emerald-700",
  CANCELLED: "bg-red-50 text-red-700",
};

export default function OrdersPage() {
  const { data: session } = useSession();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  const isAdmin = (session?.user as { role?: string } | undefined)?.role === "ADMIN";

  // Admin-only: export new orders into a CSV that can be loaded into 1С
  // (or any other ERP) — one row per order line item.
  const [onlyNotExported, setOnlyNotExported] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/orders");
    setOrders(await res.json());
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function updateStatus(orderId: string, status: Order["status"]) {
    await fetch(`/api/orders/${orderId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    load();
  }

  async function setExported(orderId: string, exported: boolean) {
    await fetch(`/api/orders/${orderId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ exported }),
    });
    load();
  }

  const visibleOrders = useMemo(
    () => (isAdmin && onlyNotExported ? orders.filter((o) => !o.exportedAt) : orders),
    [orders, isAdmin, onlyNotExported]
  );

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Exports either the checked orders, or — if nothing is checked — every
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
      await Promise.all(exportTargets.map((o) => setExported(o.id, true)));
      setSelected(new Set());
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="max-w-4xl mx-auto w-full px-4 py-6 flex-1">
        <h1 className="text-lg font-semibold text-slate-900 mb-4">
          {isAdmin ? "Усі замовлення" : "Мої замовлення"}
        </h1>

        {isAdmin && !loading && orders.length > 0 && (
          <div className="border border-slate-200 bg-white rounded-xl p-4 mb-4">
            <h2 className="text-sm font-semibold text-slate-900 mb-2">Вивантаження в 1С</h2>
            <p className="text-xs text-slate-500 mb-3">
              Експортує список замовлень у CSV (по одному рядку на товар у замовленні) — файл
              можна завантажити в 1С через стандартний майстер завантаження з таблиці. Позначте
              вивантажені замовлення, щоб наступного разу не експортувати їх повторно.
            </p>
            <div className="flex items-center gap-3 flex-wrap mb-3">
              <label className="flex items-center gap-1.5 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={onlyNotExported}
                  onChange={(e) => {
                    setOnlyNotExported(e.target.checked);
                    setSelected(new Set());
                  }}
                />
                Тільки невивантажені
              </label>
              <span className="text-xs text-slate-400">
                {selected.size > 0
                  ? `Обрано: ${selected.size}`
                  : `Буде експортовано: ${visibleOrders.length} (усі показані)`}
              </span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={exportToCsv}
                disabled={exportTargets.length === 0}
                className="bg-brand text-white text-sm rounded-lg px-4 py-2 hover:bg-brand-dark disabled:opacity-50"
              >
                Експортувати в CSV ({exportTargets.length})
              </button>
              <button
                onClick={markExportTargetsExported}
                disabled={exportTargets.length === 0 || exporting}
                className="bg-white text-brand border border-brand text-sm rounded-lg px-4 py-2 hover:bg-red-50 disabled:opacity-50"
              >
                {exporting ? "Позначення..." : `Позначити вивантаженими (${exportTargets.length})`}
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <p className="text-sm text-slate-500">Завантаження...</p>
        ) : orders.length === 0 ? (
          <p className="text-sm text-slate-500">Замовлень поки немає.</p>
        ) : visibleOrders.length === 0 ? (
          <p className="text-sm text-slate-500">Усі замовлення вже вивантажені в 1С.</p>
        ) : (
          <div className="space-y-3">
            {visibleOrders.map((order) => {
              const subtotal = order.items.reduce(
                (s, i) => s + i.priceAtOrder * i.quantity,
                0
              );
              const total = Math.max(0, subtotal - (order.discountAmount || 0));
              return (
                <div
                  key={order.id}
                  className="border border-slate-200 bg-white rounded-xl p-4"
                >
                  <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
                    <div className="flex items-start gap-2">
                      {isAdmin && (
                        <input
                          type="checkbox"
                          checked={selected.has(order.id)}
                          onChange={() => toggleSelected(order.id)}
                          className="mt-1"
                        />
                      )}
                      <div>
                        <span className="text-sm font-medium text-slate-900">
                          Замовлення #{order.id.slice(-6)}
                        </span>
                        <span className="text-xs text-slate-400 ml-2">
                          {new Date(order.createdAt).toLocaleString("uk-UA")}
                        </span>
                        {isAdmin && order.user && (
                          <span className="text-xs text-slate-500 ml-2">
                            — {order.user.name} ({order.user.company ?? order.user.email})
                          </span>
                        )}
                        {order.shop && (
                          <div className="text-xs text-slate-400 mt-0.5">
                            Магазин: {order.shop.name} — {order.shop.address}
                          </div>
                        )}
                        {isAdmin && (
                          <div className="mt-0.5">
                            {order.exportedAt ? (
                              <button
                                onClick={() => setExported(order.id, false)}
                                className="text-xs text-emerald-600 hover:text-emerald-800"
                                title="Клацніть, щоб зняти позначку"
                              >
                                ✓ Вивантажено в 1С{" "}
                                {new Date(order.exportedAt).toLocaleDateString("uk-UA")}
                              </button>
                            ) : (
                              <span className="text-xs text-amber-600">Не вивантажено в 1С</span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {isAdmin ? (
                      <select
                        value={order.status}
                        onChange={(e) =>
                          updateStatus(order.id, e.target.value as Order["status"])
                        }
                        className={`text-xs rounded-full px-2 py-1 border-0 ${STATUS_COLORS[order.status]}`}
                      >
                        {Object.entries(STATUS_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span
                        className={`text-xs rounded-full px-2 py-1 ${STATUS_COLORS[order.status]}`}
                      >
                        {STATUS_LABELS[order.status]}
                      </span>
                    )}
                  </div>

                  <div className="space-y-1 mb-2">
                    {order.items.map((item) => (
                      <div key={item.id} className="flex justify-between text-xs text-slate-600">
                        <span>
                          {item.product.name} × {item.quantity}
                        </span>
                        <span>{(item.priceAtOrder * item.quantity).toLocaleString("uk-UA")} ₴</span>
                      </div>
                    ))}
                  </div>

                  {order.comment && (
                    <p className="text-xs text-slate-500 italic mb-2">
                      Коментар: {order.comment}
                    </p>
                  )}

                  {order.discountAmount > 0 && (
                    <div className="text-xs text-emerald-600 text-right mb-1">
                      Промокод {order.promoCode?.code ?? ""}: −
                      {order.discountAmount.toLocaleString("uk-UA")} ₴
                    </div>
                  )}

                  <div className="text-sm font-semibold text-slate-900 text-right">
                    Разом: {total.toLocaleString("uk-UA")} ₴
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
