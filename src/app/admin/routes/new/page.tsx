"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";

type AvailableOrder = {
  id: string;
  comment: string | null;
  createdAt: string;
  items: { id: string; quantity: number; priceAtOrder: number; product: { name: string } }[];
  user: { name: string; company: string | null };
  shop: { id: string; name: string; address: string } | null;
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function NewRoutePage() {
  const router = useRouter();
  const [orders, setOrders] = useState<AvailableOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [date, setDate] = useState(todayISO());
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/orders/available")
      .then((r) => r.json())
      .then((data) => {
        setOrders(data);
        setLoading(false);
      });
  }, []);

  const groups = useMemo(() => {
    const map = new Map<string, { label: string; orders: AvailableOrder[] }>();
    for (const o of orders) {
      const key = o.shop?.id ?? `no-shop-${o.id}`;
      const label = o.shop
        ? `${o.shop.name} (${o.user.company ?? o.user.name})`
        : `Без магазину — ${o.user.company ?? o.user.name}`;
      if (!map.has(key)) map.set(key, { label, orders: [] });
      map.get(key)!.orders.push(o);
    }
    return Array.from(map.values());
  }, [orders]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleGroup(group: AvailableOrder[]) {
    const allSelected = group.every((o) => selected.has(o.id));
    setSelected((prev) => {
      const next = new Set(prev);
      for (const o of group) {
        if (allSelected) next.delete(o.id);
        else next.add(o.id);
      }
      return next;
    });
  }

  async function submit() {
    if (selected.size === 0) {
      setError("Оберіть хоча б одне замовлення");
      return;
    }
    setSaving(true);
    setError("");

    const res = await fetch("/api/routes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date,
        name: name || undefined,
        orderIds: Array.from(selected),
      }),
    });

    setSaving(false);

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setError(err.error || "Не вдалося створити маршрут");
      return;
    }

    const route = await res.json();
    router.push(`/admin/routes/${route.id}`);
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="max-w-4xl mx-auto w-full px-4 py-6 flex-1">
        <h1 className="text-lg font-semibold text-slate-900 mb-4">Новий маршрут</h1>

        <div className="border border-slate-200 bg-white rounded-xl p-4 mb-6">
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Дата доставки
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Назва маршруту (необов&apos;язково)
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Напр. Маршрут — центр міста"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>
        </div>

        <h2 className="text-sm font-semibold text-slate-900 mb-2">
          Оберіть замовлення для маршруту
        </h2>

        {loading ? (
          <p className="text-sm text-slate-500">Завантаження...</p>
        ) : orders.length === 0 ? (
          <p className="text-sm text-slate-500">
            Немає замовлень, які ще не включені в маршрут.
          </p>
        ) : (
          <div className="space-y-4 mb-6">
            {groups.map((g) => (
              <div key={g.label} className="border border-slate-200 bg-white rounded-xl p-4">
                <label className="flex items-center gap-2 text-sm font-medium text-slate-900 mb-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={g.orders.every((o) => selected.has(o.id))}
                    onChange={() => toggleGroup(g.orders)}
                  />
                  {g.label}
                </label>
                <div className="space-y-1 pl-6">
                  {g.orders.map((o) => {
                    const total = o.items.reduce(
                      (s, i) => s + i.priceAtOrder * i.quantity,
                      0
                    );
                    return (
                      <label
                        key={o.id}
                        className="flex items-center justify-between text-xs text-slate-600 cursor-pointer py-1"
                      >
                        <span className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={selected.has(o.id)}
                            onChange={() => toggle(o.id)}
                          />
                          Замовлення #{o.id.slice(-6)} —{" "}
                          {o.items.map((i) => `${i.product.name} ×${i.quantity}`).join(", ")}
                        </span>
                        <span className="text-slate-900 font-medium whitespace-nowrap ml-2">
                          {total.toLocaleString("uk-UA")} ₴
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {error && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-3">
            {error}
          </p>
        )}

        <button
          onClick={submit}
          disabled={saving || selected.size === 0}
          className="bg-brand text-white text-sm rounded-lg px-4 py-2 hover:bg-brand-dark disabled:opacity-50"
        >
          {saving ? "Створення..." : `Створити маршрут (${selected.size})`}
        </button>
      </main>
    </div>
  );
}
