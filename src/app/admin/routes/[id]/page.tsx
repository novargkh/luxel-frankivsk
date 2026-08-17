"use client";

import { use, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import { buildGoogleMapsRouteUrl, routeLegs } from "@/lib/geo";

type StopOrder = {
  id: string;
  orderId: string;
  order: {
    id: string;
    comment: string | null;
    createdAt: string;
    items: { id: string; quantity: number; priceAtOrder: number; product: { name: string } }[];
    user: { name: string; company: string | null };
  };
};

type Stop = {
  id: string;
  position: number;
  label: string;
  address: string;
  contactPerson: string | null;
  phone: string | null;
  lat: number | null;
  lng: number | null;
  orders: StopOrder[];
};

type RouteDetail = {
  id: string;
  name: string | null;
  date: string;
  stops: Stop[];
};

function aggregateItems(stop: Stop) {
  const map = new Map<string, number>();
  for (const so of stop.orders) {
    for (const item of so.order.items) {
      map.set(item.product.name, (map.get(item.product.name) ?? 0) + item.quantity);
    }
  }
  return Array.from(map.entries());
}

export default function RouteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [route, setRoute] = useState<RouteDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    const res = await fetch(`/api/routes/${id}`);
    setRoute(await res.json());
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const legs = useMemo(() => {
    if (!route) return [];
    return routeLegs(route.stops.map((s) => ({ lat: s.lat, lng: s.lng, address: s.address })));
  }, [route]);

  const totalKm = legs.reduce((sum: number, l) => (l != null ? sum + l : sum), 0);
  const hasAllCoords = route?.stops.every((s) => s.lat != null && s.lng != null) ?? false;

  const mapsUrl = route
    ? buildGoogleMapsRouteUrl(
        route.stops.map((s) => ({ lat: s.lat, lng: s.lng, address: s.address }))
      )
    : "";

  async function move(index: number, direction: -1 | 1) {
    if (!route) return;
    const stops = [...route.stops];
    const target = index + direction;
    if (target < 0 || target >= stops.length) return;
    [stops[index], stops[target]] = [stops[target], stops[index]];
    setRoute({ ...route, stops });
    setBusy(true);
    await fetch(`/api/routes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stopOrder: stops.map((s) => s.id) }),
    });
    setBusy(false);
    load();
  }

  async function markDelivered() {
    if (!confirm("Позначити всі замовлення цього маршруту як відправлені?")) return;
    setBusy(true);
    await fetch(`/api/routes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ markDelivered: true }),
    });
    setBusy(false);
    load();
  }

  async function deleteRoute() {
    if (!confirm("Видалити маршрут? Замовлення знову стануть доступні для нового маршруту.")) return;
    await fetch(`/api/routes/${id}`, { method: "DELETE" });
    router.push("/admin/routes");
  }

  if (loading || !route) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <main className="max-w-4xl mx-auto w-full px-4 py-6 flex-1">
          <p className="text-sm text-slate-500">Завантаження...</p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="max-w-4xl mx-auto w-full px-4 py-6 flex-1">
        <div className="no-print">
          <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
            <h1 className="text-lg font-semibold text-slate-900">
              {route.name || `Маршрут на ${new Date(route.date).toLocaleDateString("uk-UA")}`}
            </h1>
            <div className="flex gap-2">
              <button
                onClick={() => window.print()}
                className="text-sm border border-slate-200 rounded-lg px-4 py-2 hover:bg-slate-50"
              >
                Друк погрузочного листа
              </button>
              {mapsUrl && (
                <a
                  href={mapsUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="bg-brand text-white text-sm rounded-lg px-4 py-2 hover:bg-brand-dark"
                >
                  Відкрити в Google Maps
                </a>
              )}
            </div>
          </div>
          <p className="text-sm text-slate-500 mb-4">
            {new Date(route.date).toLocaleDateString("uk-UA")} · {route.stops.length} зупинок
            {hasAllCoords && totalKm > 0 && (
              <> · ≈ {totalKm.toFixed(1)} км по прямій (орієнтовно)</>
            )}
          </p>

          {!hasAllCoords && (
            <div className="mb-4 border border-amber-200 bg-amber-50 rounded-lg px-3 py-2 text-xs text-amber-800">
              Для деяких зупинок не встановлено геомітку — вони відкриються в Google
              Maps за адресою, а не за точними координатами.
            </div>
          )}

          <div className="space-y-3 mb-6">
            {route.stops.map((stop, index) => {
              const items = aggregateItems(stop);
              const legToNext = legs[index];
              return (
                <div key={stop.id} className="border border-slate-200 bg-white rounded-xl p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex gap-3">
                      <div className="w-7 h-7 rounded-full bg-brand text-white text-sm font-semibold flex items-center justify-center shrink-0">
                        {index + 1}
                      </div>
                      <div>
                        <div className="text-sm font-medium text-slate-900">{stop.label}</div>
                        <div className="text-xs text-slate-500">{stop.address}</div>
                        {(stop.contactPerson || stop.phone) && (
                          <div className="text-xs text-slate-500">
                            {stop.contactPerson}
                            {stop.contactPerson && stop.phone ? " · " : ""}
                            {stop.phone}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button
                        onClick={() => move(index, -1)}
                        disabled={busy || index === 0}
                        className="w-7 h-7 border border-slate-200 rounded text-xs hover:bg-slate-50 disabled:opacity-30"
                      >
                        ↑
                      </button>
                      <button
                        onClick={() => move(index, 1)}
                        disabled={busy || index === route.stops.length - 1}
                        className="w-7 h-7 border border-slate-200 rounded text-xs hover:bg-slate-50 disabled:opacity-30"
                      >
                        ↓
                      </button>
                    </div>
                  </div>

                  <div className="mt-3 pl-10 space-y-0.5">
                    {items.map(([name, qty]) => (
                      <div key={name} className="text-xs text-slate-600 flex justify-between max-w-sm">
                        <span>{name}</span>
                        <span className="font-medium">× {qty}</span>
                      </div>
                    ))}
                  </div>

                  <div className="mt-2 pl-10 text-xs text-slate-400">
                    Замовлення: {stop.orders.map((o) => `#${o.orderId.slice(-6)}`).join(", ")}
                  </div>

                  {legToNext != null && (
                    <div className="mt-2 pl-10 text-xs text-slate-400">
                      → до наступної зупинки ≈ {legToNext.toFixed(1)} км
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex gap-2">
            <button
              onClick={markDelivered}
              disabled={busy}
              className="bg-emerald-600 text-white text-sm rounded-lg px-4 py-2 hover:bg-emerald-700 disabled:opacity-50"
            >
              Позначити доставленим
            </button>
            <button
              onClick={deleteRoute}
              className="text-sm text-red-500 border border-red-200 rounded-lg px-4 py-2 hover:bg-red-50"
            >
              Видалити маршрут
            </button>
          </div>
        </div>

        {/* Printable loading list */}
        <div className="print-only">
          <h1 className="text-xl font-bold mb-1">
            Погрузочний лист — {route.name || new Date(route.date).toLocaleDateString("uk-UA")}
          </h1>
          <p className="text-sm mb-4">
            Дата: {new Date(route.date).toLocaleDateString("uk-UA")}
          </p>
          {route.stops.map((stop, index) => {
            const items = aggregateItems(stop);
            return (
              <div key={stop.id} style={{ marginBottom: 16, breakInside: "avoid" }}>
                <h2 className="text-base font-semibold">
                  {index + 1}. {stop.label}
                </h2>
                <p className="text-sm">{stop.address}</p>
                {(stop.contactPerson || stop.phone) && (
                  <p className="text-sm">
                    {stop.contactPerson} {stop.phone}
                  </p>
                )}
                <table className="w-full text-sm mt-1" style={{ borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left", borderBottom: "1px solid #000" }}>Товар</th>
                      <th style={{ textAlign: "right", borderBottom: "1px solid #000" }}>
                        Кількість
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map(([name, qty]) => (
                      <tr key={name}>
                        <td>{name}</td>
                        <td style={{ textAlign: "right" }}>{qty}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
