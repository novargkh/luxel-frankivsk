"use client";

import { useEffect, useState } from "react";
import { ArrowsClockwise, CheckCircle, Warning } from "@phosphor-icons/react";

type Run = {
  id: string;
  status: "running" | "done" | "error";
  stage: string;
  processed: number;
  total: number;
  bytes: number;
  created: number;
  updated: number;
  unchanged: number;
  archived: number;
  full: boolean;
  message: string | null;
  startedAt: string;
  finishedAt: string | null;
};

const kb = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} МБ` : `${Math.round(n / 1024)} КБ`);
const time = (s: string) =>
  new Date(s).toLocaleString("uk-UA", { timeZone: "Europe/Kyiv", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/** The latest BAF catalog exchanges; polls fast while one is running. */
export function useSync() {
  const [data, setData] = useState<{ runs: Run[]; archived: number } | null>(null);
  const running = data?.runs[0]?.status === "running";
  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/admin/baf/sync")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => alive && d && setData(d))
        .catch(() => {});
    load();
    const t = setInterval(load, running ? 2000 : 30000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [running]);
  return data;
}

function percent(r: Run) {
  if (r.status !== "running") return 100;
  // Files arriving: unknown size, show a slow start; then goods 10–70%,
  // prices 70–100%.
  if (r.stage === "Отримання файлів") return 5;
  const part = r.total ? r.processed / r.total : 0;
  if (r.stage.startsWith("Товари")) return 10 + Math.round(part * 60);
  if (r.stage === "Ціни") return 70 + Math.round(part * 30);
  return 10;
}

/** Thin bar across the admin workspace while BAF is uploading. */
export function SyncBar() {
  const data = useSync();
  const r = data?.runs[0];
  if (!r || r.status !== "running") return null;
  const p = percent(r);
  return (
    <div className="sticky top-14 lg:top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200 px-4 sm:px-6 py-2">
      <div className="max-w-7xl mx-auto flex items-center gap-3 text-xs text-slate-600">
        <ArrowsClockwise size={14} className="animate-spin text-blue-600" />
        <span className="font-medium text-slate-900">Обмін з BAF</span>
        <span>
          {r.stage}
          {r.stage === "Отримання файлів" ? ` · ${kb(r.bytes)}` : r.total ? ` · ${r.processed} з ${r.total}` : ""}
        </span>
        <div className="flex-1 h-1.5 rounded-full bg-slate-200 overflow-hidden">
          <div className="h-full rounded-full bg-blue-600 transition-all duration-700" style={{ width: `${p}%` }} />
        </div>
        <span className="tabular w-9 text-right">{p}%</span>
      </div>
    </div>
  );
}

/** Card with the last exchange for the products page / overview. */
export function SyncCard() {
  const data = useSync();
  const r = data?.runs[0];
  return (
    <section className="rounded-xl bg-white ring-1 ring-slate-200 p-4">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold">Обмін товарами з BAF</h2>
        {r?.status === "running" && <ArrowsClockwise size={14} className="animate-spin text-blue-600" />}
        {r?.status === "done" && <CheckCircle size={16} weight="fill" className="text-emerald-600" />}
        {r?.status === "error" && <Warning size={16} weight="fill" className="text-red-600" />}
      </div>
      {!r ? (
        <p className="mt-1 text-sm text-slate-500">
          Ще не було. Увімкніть у BAF «Вивантаження товарів» у налаштуваннях обміну з сайтом.
        </p>
      ) : (
        <>
          <div className="mt-2 h-2 rounded-full bg-slate-100 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ${r.status === "error" ? "bg-red-500" : r.status === "done" ? "bg-emerald-500" : "bg-blue-600"}`}
              style={{ width: `${percent(r)}%` }}
            />
          </div>
          <p className="mt-2 text-sm text-slate-700">
            {r.status === "running"
              ? `${r.stage}${r.total ? `: ${r.processed} з ${r.total}` : ` · отримано ${kb(r.bytes)}`}`
              : r.status === "done"
                ? `${time(r.finishedAt ?? r.startedAt)} · ${r.full ? "повне вивантаження" : "тільки зміни"} · отримано ${kb(r.bytes)}`
                : `Помилка${r.message ? `: ${r.message}` : ""}`}
          </p>
          {r.status !== "running" && (
            <p className="text-xs text-slate-500 mt-0.5">
              Нових: {r.created} · змінено: {r.updated} · без змін: {r.unchanged} · приховано (немає в BAF): {r.archived}
            </p>
          )}
          {r.message && r.status === "done" && <p className="text-xs text-amber-700 mt-1">{r.message}</p>}
          {!!data?.archived && (
            <p className="text-xs text-slate-500 mt-1">Зараз приховано товарів, яких немає в BAF: {data.archived}</p>
          )}
        </>
      )}
    </section>
  );
}
