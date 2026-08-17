"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Navbar from "@/components/Navbar";

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

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="max-w-4xl mx-auto w-full px-4 py-6 flex-1">
        <h1 className="text-lg font-semibold text-slate-900 mb-4">
          {isAdmin ? "Усі замовлення" : "Мої замовлення"}
        </h1>

        {loading ? (
          <p className="text-sm text-slate-500">Завантаження...</p>
        ) : orders.length === 0 ? (
          <p className="text-sm text-slate-500">Замовлень поки немає.</p>
        ) : (
          <div className="space-y-3">
            {orders.map((order) => {
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
