"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  CalendarBlank,
  CaretLeft,
  CaretRight,
  DownloadSimple,
  ListBullets,
  MagnifyingGlass,
} from "@phosphor-icons/react";
import OrderEditor from "@/components/admin/OrderEditor";
import { downloadCsv } from "@/lib/csv";
import {
  BAS_LABEL,
  BAS_STYLE,
  ORDER_STATUSES,
  STATUS_LABEL,
  STATUS_STYLE,
  addDays,
  kyivDateTime,
  kyivDayKey,
  money,
  type AdminOrderStatus,
} from "@/lib/adminOrders";

type Row = {
  id: string;
  number: string;
  createdAt: string;
  status: AdminOrderStatus;
  basStatus: string;
  basError: string | null;
  exportedAt: string | null;
  comment: string | null;
  user: { id: string; name: string; company: string | null; phone: string | null };
  shop: { id: string; name: string; address: string } | null;
  promoCode: string | null;
  discountAmount: number;
  positions: number;
  units: number;
  subtotal: number;
  total: number;
  productNames: string[];
};

type CalDay = { count: number; newCount: number; cancelled: number; total: number };

const today = () => kyivDayKey(new Date());

const PRESETS: { key: string; label: string; range: () => [string, string] }[] = [
  { key: "today", label: "Сьогодні", range: () => [today(), today()] },
  { key: "yesterday", label: "Вчора", range: () => [addDays(today(), -1), addDays(today(), -1)] },
  { key: "7", label: "7 днів", range: () => [addDays(today(), -6), today()] },
  { key: "30", label: "30 днів", range: () => [addDays(today(), -29), today()] },
  { key: "month", label: "Цей місяць", range: () => [`${today().slice(0, 7)}-01`, today()] },
];

export default function AdminOrdersPage() {
  return (
    <Suspense fallback={null}>
      <OrdersInner />
    </Suspense>
  );
}

function OrdersInner() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const view = params.get("view") === "calendar" ? "calendar" : "list";
  const openId = params.get("open");
  const from = params.get("from") ?? addDays(today(), -29);
  const to = params.get("to") ?? today();

  const setParams = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === null) next.delete(k);
        else next.set(k, v);
      }
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router]
  );

  return (
    <main className="w-full max-w-7xl mx-auto px-4 sm:px-6 py-6 flex-1">
      <div className="flex flex-wrap items-end gap-3 mb-5">
        <div className="flex-1 min-w-[12rem]">
          <h1 className="text-2xl font-semibold tracking-tight">{view === "calendar" ? "Календар замовлень" : "Замовлення"}</h1>
          <p className="text-sm text-slate-500">Замовлення клієнтів із сайту: перевірка, правки, статуси.</p>
        </div>
        <div className="inline-flex rounded-lg bg-white ring-1 ring-slate-200 p-1" role="tablist" aria-label="Вигляд">
          <button
            type="button"
            role="tab"
            aria-selected={view === "list"}
            onClick={() => setParams({ view: null })}
            className={`h-8 inline-flex items-center gap-1.5 rounded-md px-3 text-sm ${view === "list" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}
          >
            <ListBullets size={16} /> Список
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === "calendar"}
            onClick={() => setParams({ view: "calendar" })}
            className={`h-8 inline-flex items-center gap-1.5 rounded-md px-3 text-sm ${view === "calendar" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}
          >
            <CalendarBlank size={16} /> Календар
          </button>
        </div>
      </div>

      {view === "calendar" ? (
        <CalendarView
          month={params.get("month") ?? (params.get("from") ? from.slice(0, 7) : today().slice(0, 7))}
          onMonth={(m) => setParams({ month: m })}
          onPickDay={(d) => setParams({ view: null, from: d, to: d, month: null })}
        />
      ) : (
        <ListView from={from} to={to} setParams={setParams} onOpen={(id) => setParams({ open: id })} />
      )}

      {openId && (
        <OrderEditor
          key={openId}
          id={openId}
          onClose={() => setParams({ open: null })}
          onSaved={() => window.dispatchEvent(new Event("admin-orders-changed"))}
        />
      )}
    </main>
  );
}

// ── list ────────────────────────────────────────────────────────────

function ListView({
  from,
  to,
  setParams,
  onOpen,
}: {
  from: string;
  to: string;
  setParams: (p: Record<string, string | null>) => void;
  onOpen: (id: string) => void;
}) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);

  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"ALL" | AdminOrderStatus>("ALL");
  const [client, setClient] = useState("");
  const [bas, setBas] = useState("ALL");
  const [notExported, setNotExported] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onChange = () => setReload((n) => n + 1);
    window.addEventListener("admin-orders-changed", onChange);
    return () => window.removeEventListener("admin-orders-changed", onChange);
  }, []);

  useEffect(() => {
    let alive = true;
    fetch(`/api/admin/orders?from=${from}&to=${to}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Не вдалося завантажити замовлення");
        return d.orders as Row[];
      })
      .then((o) => {
        if (!alive) return;
        setRows(o);
        setError("");
      })
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [from, to, reload]);

  const clients = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rows ?? []) m.set(r.user.id, r.user.company || r.user.name);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], "uk"));
  }, [rows]);

  // Everything except the status filter: the status chips show counts.
  const base = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return (rows ?? []).filter((r) => {
      if (client && r.user.id !== client) return false;
      if (bas !== "ALL" && r.basStatus !== bas) return false;
      if (notExported && r.exportedAt) return false;
      if (words.length) {
        const hay = [r.number, r.user.name, r.user.company, r.user.phone, r.shop?.name, r.shop?.address, r.comment, ...r.productNames]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!words.every((w) => hay.includes(w))) return false;
      }
      return true;
    });
  }, [rows, q, client, bas, notExported]);

  const shown = useMemo(() => (status === "ALL" ? base : base.filter((r) => r.status === status)), [base, status]);
  const counts = useMemo(() => {
    const c: Record<string, number> = { ALL: base.length };
    for (const s of ORDER_STATUSES) c[s] = base.filter((r) => r.status === s).length;
    return c;
  }, [base]);
  const sum = shown.filter((r) => r.status !== "CANCELLED").reduce((s, r) => s + r.total, 0);

  const preset = PRESETS.find((p) => {
    const [a, b] = p.range();
    return a === from && b === to;
  })?.key;

  const allChecked = shown.length > 0 && shown.every((r) => selected.has(r.id));
  const picked = shown.filter((r) => selected.has(r.id));

  async function bulk(patch: { status?: AdminOrderStatus; exported?: boolean }) {
    if (picked.length === 0) return;
    setBusy(true);
    try {
      for (const r of picked) {
        if (patch.status) {
          await fetch(`/api/admin/orders/${r.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: patch.status }),
          });
        }
        if (patch.exported !== undefined) {
          await fetch(`/api/orders/${r.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ exported: patch.exported }),
          });
        }
      }
      setSelected(new Set());
      setReload((n) => n + 1);
    } finally {
      setBusy(false);
    }
  }

  function exportCsv() {
    const list = picked.length ? picked : shown;
    downloadCsv(`luxel-zamovlennya-${from}_${to}.csv`, [
      ["№", "Дата", "Клієнт", "Телефон", "Магазин", "Адреса", "Статус", "Обмін BAF", "Позицій", "Одиниць", "Знижка", "Сума", "Коментар"],
      ...list.map((r) => [
        r.number,
        kyivDateTime(r.createdAt),
        r.user.company || r.user.name,
        r.user.phone ?? "",
        r.shop?.name ?? "",
        r.shop?.address ?? "",
        STATUS_LABEL[r.status],
        BAS_LABEL[r.basStatus] ?? r.basStatus,
        r.positions,
        r.units,
        r.discountAmount,
        r.total,
        r.comment ?? "",
      ]),
    ]);
  }

  return (
    <>
      <section className="rounded-xl bg-white ring-1 ring-slate-200 p-4 space-y-3 mb-4">
        <div className="flex flex-wrap items-center gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => {
                const [a, b] = p.range();
                setParams({ from: a, to: b });
              }}
              className={`h-8 rounded-md px-3 text-sm ring-1 ${preset === p.key ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50"}`}
            >
              {p.label}
            </button>
          ))}
          <span className="flex w-full sm:w-auto items-center gap-1.5 text-sm text-slate-600 sm:ml-1">
            з
            <input
              type="date"
              value={from}
              max={to}
              onChange={(e) => e.target.value && setParams({ from: e.target.value })}
              className="h-8 min-w-0 flex-1 sm:flex-none rounded-md border border-slate-300 px-2 text-sm"
              aria-label="Від дати"
            />
            по
            <input
              type="date"
              value={to}
              min={from}
              onChange={(e) => e.target.value && setParams({ to: e.target.value })}
              className="h-8 min-w-0 flex-1 sm:flex-none rounded-md border border-slate-300 px-2 text-sm"
              aria-label="До дати"
            />
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[14rem]">
            <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Пошук: №, клієнт, телефон, магазин, товар"
              aria-label="Пошук замовлень"
              className="w-full h-9 rounded-md border border-slate-300 pl-9 pr-3 text-sm"
            />
          </div>
          <select
            value={client}
            onChange={(e) => setClient(e.target.value)}
            aria-label="Клієнт"
            className="h-9 rounded-md border border-slate-300 bg-white px-2 text-sm max-w-[16rem]"
          >
            <option value="">Усі клієнти</option>
            {clients.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
          <select
            value={bas}
            onChange={(e) => setBas(e.target.value)}
            aria-label="Обмін з BAF"
            className="h-9 rounded-md border border-slate-300 bg-white px-2 text-sm"
          >
            <option value="ALL">BAF: усі</option>
            <option value="NEW">Чекає обміну</option>
            <option value="SENT_TO_BAS">У BAF</option>
            <option value="ERROR">Помилка обміну</option>
          </select>
          <label className="inline-flex items-center gap-2 text-sm text-slate-700 h-9">
            <input type="checkbox" checked={notExported} onChange={(e) => setNotExported(e.target.checked)} />
            Не вивантажені в CSV
          </label>
        </div>

        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Статус">
          {(["ALL", ...ORDER_STATUSES] as const).map((s) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={status === s}
              onClick={() => setStatus(s)}
              className={`h-8 inline-flex items-center gap-2 rounded-full px-3 text-sm ${
                status === s ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              {s === "ALL" ? "Усі" : STATUS_LABEL[s]}
              <span className={`tabular text-xs ${status === s ? "text-white/70" : "text-slate-500"}`}>{counts[s] ?? 0}</span>
            </button>
          ))}
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-2 mb-2 min-h-9">
        <p className="text-sm text-slate-600 mr-auto">
          {rows === null ? "Завантаження…" : `${shown.length} замовл. · ${money(sum)}`}
          {picked.length > 0 && <span className="ml-2 text-slate-900 font-medium">Вибрано: {picked.length}</span>}
        </p>
        {picked.length > 0 && (
          <>
            <button type="button" disabled={busy} onClick={() => bulk({ status: "CONFIRMED" })} className="h-9 rounded-md bg-blue-600 px-3 text-sm text-white disabled:opacity-50">
              Підтвердити
            </button>
            <button type="button" disabled={busy} onClick={() => bulk({ status: "SHIPPED" })} className="h-9 rounded-md bg-emerald-600 px-3 text-sm text-white disabled:opacity-50">
              Відвантажено
            </button>
            <button type="button" disabled={busy} onClick={() => bulk({ exported: true })} className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm disabled:opacity-50">
              Позначити вивантаженими
            </button>
          </>
        )}
        <button type="button" onClick={exportCsv} disabled={!shown.length} className="h-9 inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-sm disabled:opacity-50">
          <DownloadSimple size={16} /> CSV{picked.length ? " (вибрані)" : ""}
        </button>
      </div>

      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

      <div className="rounded-xl bg-white ring-1 ring-slate-200 overflow-hidden">
        {/* Desktop table */}
        <table className="hidden md:table w-full text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500">
            <tr>
              <th className="w-10 px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={allChecked}
                  onChange={(e) => setSelected(e.target.checked ? new Set(shown.map((r) => r.id)) : new Set())}
                  aria-label="Вибрати всі"
                />
              </th>
              <th className="text-left font-medium px-2 py-2.5">№ / дата</th>
              <th className="text-left font-medium px-2 py-2.5">Клієнт / магазин</th>
              <th className="text-right font-medium px-2 py-2.5">Позицій</th>
              <th className="text-right font-medium px-2 py-2.5">Сума</th>
              <th className="text-left font-medium px-2 py-2.5">Статус</th>
              <th className="text-left font-medium px-3 py-2.5">BAF</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr
                key={r.id}
                onClick={() => onOpen(r.id)}
                className={`border-t border-slate-100 cursor-pointer hover:bg-slate-50 ${r.status === "NEW" ? "bg-red-50/30" : ""}`}
              >
                <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selected.has(r.id)}
                    onChange={(e) =>
                      setSelected((s) => {
                        const n = new Set(s);
                        if (e.target.checked) n.add(r.id);
                        else n.delete(r.id);
                        return n;
                      })
                    }
                    aria-label={`Вибрати ${r.number}`}
                  />
                </td>
                <td className="px-2 py-2.5 whitespace-nowrap">
                  <p className="font-medium tabular">{r.number}</p>
                  <p className="text-xs text-slate-500 tabular">{kyivDateTime(r.createdAt)}</p>
                </td>
                <td className="px-2 py-2.5">
                  <p className="font-medium">{r.user.company || r.user.name}</p>
                  <p className="text-xs text-slate-500">
                    {r.shop ? `${r.shop.name} · ${r.shop.address}` : "магазин не вказано"}
                    {r.comment && <span className="text-slate-400"> · є коментар</span>}
                  </p>
                </td>
                <td className="px-2 py-2.5 text-right tabular">{r.positions}</td>
                <td className="px-2 py-2.5 text-right tabular whitespace-nowrap font-medium">{money(r.total)}</td>
                <td className="px-2 py-2.5">
                  <span className={`inline-flex h-6 items-center rounded-full px-2.5 text-xs ring-1 ${STATUS_STYLE[r.status]}`}>
                    {STATUS_LABEL[r.status]}
                  </span>
                </td>
                <td className={`px-3 py-2.5 text-xs ${BAS_STYLE[r.basStatus] ?? ""}`} title={r.basError ?? undefined}>
                  {BAS_LABEL[r.basStatus] ?? r.basStatus}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Phone cards */}
        <ul className="md:hidden divide-y divide-slate-100">
          {shown.map((r) => (
            <li key={r.id}>
              <button type="button" onClick={() => onOpen(r.id)} className="w-full text-left px-4 py-3 active:bg-slate-50">
                <div className="flex items-center gap-2">
                  <span className="font-medium tabular">{r.number}</span>
                  <span className={`inline-flex h-5 items-center rounded-full px-2 text-[11px] ring-1 ${STATUS_STYLE[r.status]}`}>
                    {STATUS_LABEL[r.status]}
                  </span>
                  <span className="ml-auto font-medium tabular">{money(r.total)}</span>
                </div>
                <p className="text-sm">{r.user.company || r.user.name}</p>
                <p className="text-xs text-slate-500">
                  {kyivDateTime(r.createdAt)} · {r.positions} поз. ·{" "}
                  <span className={BAS_STYLE[r.basStatus] ?? ""}>{BAS_LABEL[r.basStatus] ?? r.basStatus}</span>
                </p>
              </button>
            </li>
          ))}
        </ul>

        {rows !== null && shown.length === 0 && (
          <p className="px-4 py-10 text-center text-sm text-slate-500">За цими умовами замовлень немає.</p>
        )}
      </div>
    </>
  );
}

// ── calendar ────────────────────────────────────────────────────────

const MONTHS = ["Січень", "Лютий", "Березень", "Квітень", "Травень", "Червень", "Липень", "Серпень", "Вересень", "Жовтень", "Листопад", "Грудень"];
const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"];

function shiftMonth(m: string, n: number) {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(Date.UTC(y, mo - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

function CalendarView({
  month,
  onMonth,
  onPickDay,
}: {
  month: string;
  onMonth: (m: string) => void;
  onPickDay: (day: string) => void;
}) {
  const [days, setDays] = useState<Record<string, CalDay> | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/admin/orders/calendar?month=${month}`)
      .then((r) => r.json())
      .then((d) => alive && setDays(d.days ?? {}))
      .catch(() => alive && setDays({}));
    return () => {
      alive = false;
    };
  }, [month]);

  const [y, m] = month.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const lead = (first.getUTCDay() + 6) % 7; // Monday first
  const total = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells: (string | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: total }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`),
  ];
  while (cells.length % 7) cells.push(null);

  const t = today();
  const max = Math.max(1, ...Object.values(days ?? {}).map((d) => d.count));
  const monthSum = Object.values(days ?? {}).reduce((s, d) => s + d.total, 0);
  const monthCount = Object.values(days ?? {}).reduce((s, d) => s + d.count, 0);

  return (
    <section className="rounded-xl bg-white ring-1 ring-slate-200 p-4">
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <button type="button" onClick={() => onMonth(shiftMonth(month, -1))} aria-label="Попередній місяць" className="h-9 w-9 inline-flex items-center justify-center rounded-md ring-1 ring-slate-200 hover:bg-slate-50">
          <CaretLeft size={16} />
        </button>
        <h2 className="text-lg font-semibold w-44 text-center">
          {MONTHS.at(m - 1)} {y}
        </h2>
        <button type="button" onClick={() => onMonth(shiftMonth(month, 1))} aria-label="Наступний місяць" className="h-9 w-9 inline-flex items-center justify-center rounded-md ring-1 ring-slate-200 hover:bg-slate-50">
          <CaretRight size={16} />
        </button>
        <button type="button" onClick={() => onMonth(t.slice(0, 7))} className="h-9 rounded-md px-3 text-sm ring-1 ring-slate-200 hover:bg-slate-50">
          Сьогодні
        </button>
        <p className="ml-auto text-sm text-slate-600">
          За місяць: <span className="font-medium text-slate-900">{monthCount}</span> замовл. ·{" "}
          <span className="font-medium text-slate-900">{money(monthSum)}</span>
        </p>
      </div>

      <div className="grid grid-cols-7 gap-1.5 text-xs text-slate-500 mb-1.5">
        {WEEKDAYS.map((w) => (
          <div key={w} className="px-2">
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {cells.map((d, i) => {
          if (!d) return <div key={`e${i}`} className="min-h-[5.5rem] rounded-lg bg-slate-50/60" />;
          const info = days?.[d];
          const level = info ? info.count / max : 0;
          const isToday = d === t;
          return (
            <button
              key={d}
              type="button"
              onClick={() => onPickDay(d)}
              disabled={!info}
              className={`min-h-[5.5rem] rounded-lg p-2 text-left ring-1 transition-colors ${
                isToday ? "ring-2 ring-slate-900" : "ring-slate-200"
              } ${info ? "hover:ring-slate-400" : "cursor-default"}`}
              style={info ? { backgroundColor: `rgba(37, 99, 235, ${0.06 + level * 0.22})` } : undefined}
              aria-label={info ? `${d}: ${info.count} замовлень` : d}
            >
              <div className="flex items-center justify-between">
                <span className={`text-sm tabular ${isToday ? "font-bold" : "text-slate-700"}`}>{Number(d.slice(8))}</span>
                {info && info.newCount > 0 && (
                  <span className="min-w-5 h-5 px-1 rounded-full bg-brand text-white text-[11px] leading-5 text-center font-semibold tabular" title="Нових">
                    {info.newCount}
                  </span>
                )}
              </div>
              {info && (
                <div className="mt-1.5">
                  <p className="text-sm font-semibold tabular">{info.count} замовл.</p>
                  <p className="hidden sm:block text-xs text-slate-600 tabular">{money(info.total)}</p>
                  {info.cancelled > 0 && <p className="hidden sm:block text-[11px] text-slate-500">скасовано: {info.cancelled}</p>}
                </div>
              )}
            </button>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-slate-500">
        Число в червоному кружечку — нові замовлення, ще не підтверджені. Натисніть на день, щоб відкрити його замовлення списком.
      </p>
    </section>
  );
}
