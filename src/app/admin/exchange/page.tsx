"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowsClockwise, CheckCircle, WarningCircle } from "@phosphor-icons/react";
import { kyivDateTime } from "@/lib/adminOrders";

type Row = {
  id: string;
  at: string;
  type: string | null;
  mode: string | null;
  filename: string | null;
  bytes: number;
  status: number;
  ok: boolean;
  answer: string;
  detail: string | null;
  ms: number;
  ip: string | null;
  agent: string | null;
};
type Data = { configured: boolean; login: string | null; lastOk: string | null; lastFail: Row | null; rows: Row[] };

const MODE: Record<string, string> = {
  checkauth: "Перевірка з'єднання",
  init: "Початок обміну",
  file: "Передача файлу",
  import: "Завантаження даних",
  query: "Запит замовлень",
  success: "Підтвердження",
  complete: "Завершення",
  deactivate: "Завершення",
};
const TYPE: Record<string, string> = { sale: "Замовлення", catalog: "Товари" };

const size = (b: number) => (b > 1_000_000 ? `${(b / 1_000_000).toFixed(1)} МБ` : b > 1000 ? `${Math.round(b / 1000)} КБ` : b ? `${b} Б` : "");

// Admin → "Обмін з BAF": what BAF sent to the site and what it got back.
export default function ExchangeLogPage() {
  const [d, setD] = useState<Data | null>(null);
  const [onlyErrors, setOnlyErrors] = useState(false);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((n) => n + 1), []);
  useEffect(() => {
    let alive = true;
    fetch(`/api/admin/baf/log${onlyErrors ? "?only=errors" : ""}`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "Не вдалося завантажити");
        if (alive) setD(j);
      })
      .catch((e: Error) => alive && setError(e.message));
    const t = setInterval(refresh, 15_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [onlyErrors, tick, refresh]);

  const failing = d?.lastFail && (!d.lastOk || new Date(d.lastFail.at) > new Date(d.lastOk));

  return (
    <main className="w-full max-w-7xl mx-auto px-4 sm:px-6 py-6 flex-1">
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Обмін з BAF</h1>
          <p className="text-sm text-slate-500">
            Кожен запит, який BAF надсилає на сайт, і що сайт відповів. Оновлюється кожні 15 секунд.
          </p>
        </div>
        <button
          onClick={refresh}
          className="h-9 inline-flex items-center gap-2 rounded-lg bg-white ring-1 ring-slate-200 px-3 text-sm hover:ring-slate-400"
        >
          <ArrowsClockwise size={16} /> Оновити
        </button>
      </div>
      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      {d && (
        <div className="grid sm:grid-cols-3 gap-3 mb-5">
          <div className="rounded-xl bg-white ring-1 ring-slate-200 p-4">
            <p className="text-xs text-slate-500">Налаштування на сайті</p>
            <p className={`mt-1 font-semibold ${d.configured ? "" : "text-red-600"}`}>
              {d.configured ? `Логін обміну: ${d.login}` : "Логін/пароль обміну не задані"}
            </p>
          </div>
          <div className="rounded-xl bg-white ring-1 ring-slate-200 p-4">
            <p className="text-xs text-slate-500">Останнє успішне з&apos;єднання</p>
            <p className="mt-1 font-semibold tabular">{d.lastOk ? kyivDateTime(d.lastOk) : "ще не було"}</p>
          </div>
          <div className={`rounded-xl bg-white ring-1 p-4 ${failing ? "ring-red-300" : "ring-slate-200"}`}>
            <p className="text-xs text-slate-500">Остання помилка</p>
            {d.lastFail ? (
              <>
                <p className={`mt-1 font-semibold tabular ${failing ? "text-red-600" : ""}`}>{kyivDateTime(d.lastFail.at)}</p>
                <p className="text-xs text-slate-600 mt-0.5">{d.lastFail.detail || d.lastFail.answer.replace(/^failure\n?/, "")}</p>
              </>
            ) : (
              <p className="mt-1 font-semibold">немає</p>
            )}
          </div>
        </div>
      )}

      <div className="flex gap-2 mb-3">
        {[false, true].map((v) => (
          <button
            key={String(v)}
            onClick={() => setOnlyErrors(v)}
            className={`h-9 rounded-full px-4 text-sm ${onlyErrors === v ? "bg-slate-900 text-white" : "bg-white ring-1 ring-slate-200"}`}
          >
            {v ? "Лише помилки" : "Усі запити"}
          </button>
        ))}
      </div>

      <div className="rounded-xl bg-white ring-1 ring-slate-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-slate-500 border-b border-slate-100">
            <tr>
              <th className="px-3 py-2 font-medium">Час</th>
              <th className="px-3 py-2 font-medium">Що</th>
              <th className="px-3 py-2 font-medium">Відповідь сайту</th>
              <th className="px-3 py-2 font-medium text-right">Тривалість</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {d?.rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-10 text-center text-slate-500">
                  Запитів від BAF ще не було. Запустіть обмін у BAF, і він з&apos;явиться тут.
                </td>
              </tr>
            )}
            {d?.rows.map((r) => (
              <tr key={r.id} className={r.ok ? "" : "bg-red-50/60"}>
                <td className="px-3 py-2 whitespace-nowrap tabular text-slate-600 align-top">{kyivDateTime(r.at)}</td>
                <td className="px-3 py-2 align-top">
                  <span className="font-medium">{MODE[r.mode ?? ""] ?? r.mode ?? "—"}</span>
                  <span className="text-slate-500"> · {TYPE[r.type ?? ""] ?? r.type ?? "?"}</span>
                  {(r.filename || r.bytes > 0) && (
                    <span className="block text-xs text-slate-500">
                      {r.filename} {size(r.bytes)}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 align-top">
                  <span className={`inline-flex items-start gap-1.5 ${r.ok ? "text-emerald-700" : "text-red-700"}`}>
                    {r.ok ? <CheckCircle size={16} weight="fill" className="mt-0.5 shrink-0" /> : <WarningCircle size={16} weight="fill" className="mt-0.5 shrink-0" />}
                    <span className="whitespace-pre-line break-all">
                      {r.mode === "checkauth" && r.ok ? "success (з'єднання встановлено)" : r.answer.slice(0, 200) || "(порожньо)"}
                    </span>
                  </span>
                  {r.detail && <span className="block text-xs text-slate-600 mt-0.5">{r.detail}</span>}
                </td>
                <td className="px-3 py-2 text-right tabular text-slate-500 align-top whitespace-nowrap">{(r.ms / 1000).toFixed(1)} с</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
