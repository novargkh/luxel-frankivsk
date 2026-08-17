"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";

type Route = {
  id: string;
  name: string | null;
  date: string;
  stops: { id: string; orders: { id: string }[] }[];
};

export default function AdminRoutesPage() {
  const [routes, setRoutes] = useState<Route[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/routes")
      .then((r) => r.json())
      .then((data) => {
        setRoutes(data);
        setLoading(false);
      });
  }, []);

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="max-w-4xl mx-auto w-full px-4 py-6 flex-1">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-lg font-semibold text-slate-900">Маршрути доставки</h1>
          <Link
            href="/admin/routes/new"
            className="bg-brand text-white text-sm rounded-lg px-4 py-2 hover:bg-brand-dark"
          >
            + Новий маршрут
          </Link>
        </div>

        {loading ? (
          <p className="text-sm text-slate-500">Завантаження...</p>
        ) : routes.length === 0 ? (
          <p className="text-sm text-slate-500">
            Маршрутів ще немає. Створіть перший маршрут із замовлень клієнтів.
          </p>
        ) : (
          <div className="space-y-2">
            {routes.map((r) => {
              const orderCount = r.stops.reduce((s, st) => s + st.orders.length, 0);
              return (
                <Link
                  key={r.id}
                  href={`/admin/routes/${r.id}`}
                  className="block border border-slate-200 bg-white rounded-xl p-4 hover:border-brand transition"
                >
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <div className="text-sm font-medium text-slate-900">
                        {r.name || `Маршрут на ${new Date(r.date).toLocaleDateString("uk-UA")}`}
                      </div>
                      <div className="text-xs text-slate-500">
                        {new Date(r.date).toLocaleDateString("uk-UA")}
                      </div>
                    </div>
                    <div className="text-xs text-slate-500 text-right">
                      <div>{r.stops.length} зупинок</div>
                      <div>{orderCount} замовлень</div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
