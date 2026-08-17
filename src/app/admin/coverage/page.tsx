"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Navbar from "@/components/Navbar";
import type { CoveragePoint } from "@/components/CoverageMap";

const CoverageMap = dynamic(() => import("@/components/CoverageMap"), {
  ssr: false,
  loading: () => (
    <div className="h-[420px] rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-center text-xs text-slate-400">
      Завантаження карти...
    </div>
  ),
});

type Shop = {
  id: string;
  name: string;
  address: string;
  contactPerson: string | null;
  phone: string | null;
  lat: number | null;
  lng: number | null;
  workingHours: string | null;
  user: { name: string; company: string | null; email: string };
  _count: { orders: number };
};

function toCsvValue(v: string | number) {
  const s = String(v ?? "");
  if (s.includes(";") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function downloadCsv(shops: Shop[]) {
  const headers = [
    "Компанія",
    "Контактна особа",
    "Магазин",
    "Адреса",
    "Телефон",
    "Години роботи",
    "Широта",
    "Довгота",
    "Кількість замовлень",
  ];
  const rows = shops.map((s) => [
    s.user.company ?? s.user.name,
    s.contactPerson ?? "",
    s.name,
    s.address,
    s.phone ?? "",
    s.workingHours ?? "",
    s.lat ?? "",
    s.lng ?? "",
    s._count.orders,
  ]);

  const csv =
    "﻿" +
    [headers, ...rows].map((row) => row.map(toCsvValue).join(";")).join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `luxel-pokryttya-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function CoveragePage() {
  const [shops, setShops] = useState<Shop[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/shops")
      .then((r) => r.json())
      .then((data) => {
        setShops(data);
        setLoading(false);
      });
  }, []);

  const points: CoveragePoint[] = useMemo(
    () =>
      shops
        .filter((s) => s.lat != null && s.lng != null)
        .map((s) => ({
          id: s.id,
          lat: s.lat as number,
          lng: s.lng as number,
          label: s.name,
          address: s.address,
          subtitle: s.user.company ?? s.user.name,
          workingHours: s.workingHours ?? undefined,
        })),
    [shops]
  );

  const withoutGeo = shops.filter((s) => s.lat == null || s.lng == null);

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="max-w-5xl mx-auto w-full px-4 py-6 flex-1">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h1 className="text-lg font-semibold text-slate-900">Карта покриття</h1>
          <button
            onClick={() => downloadCsv(shops)}
            disabled={shops.length === 0}
            className="bg-brand text-white text-sm rounded-lg px-4 py-2 hover:bg-brand-dark disabled:opacity-50"
          >
            Завантажити CSV
          </button>
        </div>

        {loading ? (
          <p className="text-sm text-slate-500">Завантаження...</p>
        ) : shops.length === 0 ? (
          <p className="text-sm text-slate-500">У клієнтів ще немає доданих магазинів.</p>
        ) : (
          <>
            <p className="text-sm text-slate-500 mb-3">
              Усього точок: {shops.length}. На карті: {points.length}
              {withoutGeo.length > 0 && ` · без геомітки: ${withoutGeo.length}`}
            </p>

            <div className="mb-6">
              <CoverageMap points={points} />
            </div>

            <div className="border border-slate-200 bg-white rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-500 text-xs">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">Клієнт</th>
                    <th className="text-left px-3 py-2 font-medium">Магазин</th>
                    <th className="text-left px-3 py-2 font-medium">Адреса</th>
                    <th className="text-left px-3 py-2 font-medium">Години роботи</th>
                    <th className="text-left px-3 py-2 font-medium">Геомітка</th>
                    <th className="text-left px-3 py-2 font-medium">Замовлень</th>
                  </tr>
                </thead>
                <tbody>
                  {shops.map((s) => (
                    <tr key={s.id} className="border-t border-slate-100">
                      <td className="px-3 py-2 text-slate-800">
                        {s.user.company ?? s.user.name}
                      </td>
                      <td className="px-3 py-2 text-slate-600">{s.name}</td>
                      <td className="px-3 py-2 text-slate-600">{s.address}</td>
                      <td className="px-3 py-2 text-slate-600">{s.workingHours ?? "—"}</td>
                      <td className="px-3 py-2">
                        {s.lat != null && s.lng != null ? (
                          <span className="text-xs text-emerald-600">є</span>
                        ) : (
                          <span className="text-xs text-amber-600">немає</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-slate-600">{s._count.orders}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
