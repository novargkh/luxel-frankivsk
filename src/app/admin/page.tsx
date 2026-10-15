"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, CalendarBlank } from "@phosphor-icons/react";
import { kyivDateTime, money } from "@/lib/adminOrders";
import { SyncCard } from "@/components/admin/SyncProgress";

type Summary = {
  today: { count: number; total: number };
  week: { count: number; total: number; clients: number; days: { day: string; count: number; total: number }[] };
  newOrders: number;
  newReturns: number;
  openRequests: number;
  basErrors: number;
  baf: { waiting: number; oldestMin: number | null; lastMin: number | null };
  latestNew: {
    id: string;
    number: string;
    createdAt: string;
    client: string;
    shop: string | null;
    positions: number;
    total: number;
  }[];
};

const WD = ["Нд", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];

// Admin overview: what needs attention now and how the last week went.
export default function AdminDashboard() {
  const [s, setS] = useState<Summary | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/admin/summary")
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Не вдалося завантажити");
        setS(d);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  const cards: { label: string; value: string; note?: string; href: string; alert?: boolean }[] = s
    ? [
        { label: "Нові замовлення", value: String(s.newOrders), note: "чекають підтвердження", href: "/admin/orders", alert: s.newOrders > 0 },
        { label: "Сьогодні", value: String(s.today.count), note: money(s.today.total), href: "/admin/orders" },
        { label: "За 7 днів", value: money(s.week.total), note: `${s.week.count} замовл. · ${s.week.clients} клієнтів`, href: "/admin/orders?view=calendar" },
        { label: "Повернення", value: String(s.newReturns), note: "нові заявки", href: "/admin/returns", alert: s.newReturns > 0 },
        { label: "Запити клієнтів", value: String(s.openRequests), note: "зміна даних", href: "/admin/clients", alert: s.openRequests > 0 },
        { label: "Помилки обміну BAF", value: String(s.basErrors), note: s.basErrors ? "потрібна увага" : "усе гаразд", href: "/admin/orders", alert: s.basErrors > 0 },
      ]
    : [];
  const maxDay = Math.max(1, ...(s?.week.days.map((d) => d.total) ?? [1]));

  return (
    <main className="w-full max-w-7xl mx-auto px-4 sm:px-6 py-6 flex-1">
      <h1 className="text-2xl font-semibold tracking-tight">Огляд</h1>
      <p className="text-sm text-slate-500 mb-5">Що потребує уваги зараз і як пройшов тиждень.</p>
      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 mb-6">
        {(s ? cards : Array.from({ length: 6 }, () => null)).map((c, i) =>
          c ? (
            <Link
              key={c.label}
              href={c.href}
              className={`rounded-xl bg-white p-4 ring-1 hover:ring-slate-400 transition ${c.alert ? "ring-red-200" : "ring-slate-200"}`}
            >
              <p className="text-xs text-slate-500">{c.label}</p>
              <p className={`mt-1 text-2xl font-semibold tabular ${c.alert ? "text-red-600" : ""}`}>{c.value}</p>
              {c.note && <p className="text-xs text-slate-500 mt-0.5 tabular">{c.note}</p>}
            </Link>
          ) : (
            <div key={i} className="rounded-xl bg-white ring-1 ring-slate-200 p-4 h-[92px] animate-pulse" />
          )
        )}
      </div>

      {s && <BafQueue baf={s.baf} />}

      <div className="mb-4">
        <SyncCard />
      </div>

      <div className="grid lg:grid-cols-5 gap-4">
        <section className="lg:col-span-3 rounded-xl bg-white ring-1 ring-slate-200">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <h2 className="text-sm font-semibold">Нові замовлення</h2>
            <Link href="/admin/orders" className="text-sm text-slate-600 hover:text-slate-900 inline-flex items-center gap-1">
              Усі <ArrowRight size={14} />
            </Link>
          </div>
          {s && s.latestNew.length === 0 && <p className="px-4 py-8 text-sm text-slate-500 text-center">Нових замовлень немає.</p>}
          <ul className="divide-y divide-slate-100">
            {s?.latestNew.map((o) => (
              <li key={o.id}>
                <Link href={`/admin/orders?open=${o.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{o.client}</p>
                    <p className="text-xs text-slate-500 tabular">
                      № {o.number} · {kyivDateTime(o.createdAt)} · {o.positions} поз.{o.shop ? ` · ${o.shop}` : ""}
                    </p>
                  </div>
                  <span className="text-sm font-medium tabular whitespace-nowrap">{money(o.total)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="lg:col-span-2 rounded-xl bg-white ring-1 ring-slate-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold">Останні 7 днів, сума замовлень</h2>
            <Link href="/admin/orders?view=calendar" className="text-sm text-slate-600 hover:text-slate-900 inline-flex items-center gap-1">
              <CalendarBlank size={14} /> Календар
            </Link>
          </div>
          <ul className="space-y-2">
            {s?.week.days.map((d) => {
              const wd = WD.at(new Date(`${d.day}T12:00:00Z`).getUTCDay());
              return (
                <li key={d.day}>
                  <Link href={`/admin/orders?from=${d.day}&to=${d.day}`} className="grid grid-cols-[4.5rem_1fr_6.5rem] items-center gap-2 text-sm group">
                    <span className="text-slate-500 tabular">
                      {wd} {d.day.slice(8)}.{d.day.slice(5, 7)}
                    </span>
                    <span className="h-5 rounded bg-slate-100 overflow-hidden">
                      <span className="block h-full rounded bg-blue-500 group-hover:bg-blue-600" style={{ width: `${(d.total / maxDay) * 100}%` }} />
                    </span>
                    <span className="text-right tabular text-slate-700">
                      {d.count ? money(d.total) : "—"}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </main>
  );
}

function ago(m: number | null) {
  if (m === null) return "ще не було";
  if (m < 60) return `${m} хв тому`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} год тому` : `${Math.round(h / 24)} дн тому`;
}

// BAF lives on an office computer: orders wait on the site until it is on.
function BafQueue({ baf }: { baf: Summary["baf"] }) {
  const late = baf.waiting > 0 && (baf.oldestMin ?? 0) >= 240;
  return (
    <Link
      href="/admin/exchange"
      className={`mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl bg-white px-4 py-3 text-sm ring-1 hover:ring-slate-400 ${late ? "ring-amber-300 bg-amber-50" : "ring-slate-200"}`}
    >
      <span className="font-semibold">Обмін з BAF</span>
      <span className="text-slate-600">
        останній обмін: <b className="tabular">{ago(baf.lastMin)}</b>
      </span>
      <span className={late ? "text-amber-800" : "text-slate-600"}>
        {baf.waiting ? (
          <>
            чекають BAF: <b className="tabular">{baf.waiting} замовл.</b>, найстаріше {ago(baf.oldestMin)}
            {late && " — увімкніть комп'ютер з BAF"}
          </>
        ) : (
          "усі замовлення передані"
        )}
      </span>
    </Link>
  );
}
