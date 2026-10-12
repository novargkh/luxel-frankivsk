"use client";

import { useEffect, useState } from "react";
import * as XLSX from "xlsx";
import { FileXls } from "@phosphor-icons/react";
import { parseBafSheet } from "@/lib/bafMatch";

type Info = { count: number; updatedAt: string | null };

// In the client's card (admin): the client's own price list from BAF. While
// it is loaded, the client sees these prices; products missing from it use
// the base price minus the client's discount.
export default function ClientPriceList({ clientId }: { clientId: string }) {
  const [info, setInfo] = useState<Info | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; details?: string[] } | null>(null);

  async function load() {
    const r = await fetch(`/api/admin/clients/${clientId}/prices`);
    if (r.ok) setInfo(await r.json());
  }
  useEffect(() => {
    let alive = true;
    fetch(`/api/admin/clients/${clientId}/prices`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => alive && d && setInfo(d));
    return () => {
      alive = false;
    };
  }, [clientId]);

  async function onFile(file: File) {
    setBusy(true);
    setMsg(null);
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const sheet = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "" }) as unknown[][];
      const rows = parseBafSheet(sheet);
      const res = await fetch(`/api/admin/clients/${clientId}/prices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Не вдалося завантажити прайс");
      setMsg({
        ok: true,
        text: `Завантажено цін: ${d.saved} з ${d.total}.${d.unmatchedCount ? ` Не знайдено на сайті: ${d.unmatchedCount}.` : ""}`,
        details: d.unmatched,
      });
      await load();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    if (!confirm("Прибрати індивідуальний прайс клієнта? Він бачитиме базові ціни мінус свою знижку.")) return;
    setBusy(true);
    await fetch(`/api/admin/clients/${clientId}/prices`, { method: "DELETE" });
    setMsg(null);
    await load();
    setBusy(false);
  }

  return (
    <section className="border border-slate-200 bg-white rounded-xl p-4 mb-6">
      <h2 className="text-sm font-semibold text-slate-900">Індивідуальний прайс з BAF</h2>
      <p className="text-xs text-slate-500 mt-0.5">
        Вивантажте з BAF прайс-лист з типом цін цього клієнта (той самий вигляд, що й загальний прайс) і завантажте тут.
        Клієнт бачитиме ці ціни; товари, яких немає у прайсі, — за базовою ціною мінус знижка.
      </p>
      <p className="mt-2 text-sm">
        {info === null
          ? "…"
          : info.count
            ? `Завантажено цін: ${info.count}${info.updatedAt ? `, оновлено ${new Date(info.updatedAt).toLocaleDateString("uk-UA")}` : ""}`
            : "Індивідуальних цін немає — діють базові ціни мінус знижка."}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <label className="inline-flex items-center gap-2 h-9 rounded-lg bg-slate-900 px-3 text-sm text-white cursor-pointer">
          <FileXls size={16} />
          {busy ? "Завантажую…" : info?.count ? "Оновити прайс" : "Завантажити прайс клієнта"}
          <input
            type="file"
            accept=".xls,.xlsx"
            className="sr-only"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) onFile(f);
            }}
          />
        </label>
        {!!info?.count && (
          <button type="button" onClick={clear} disabled={busy} className="h-9 rounded-lg border border-slate-300 px-3 text-sm">
            Прибрати прайс
          </button>
        )}
      </div>
      {msg && (
        <div className={`mt-3 text-sm rounded-lg px-3 py-2 ${msg.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>
          {msg.text}
          {msg.details && msg.details.length > 0 && (
            <details className="mt-1">
              <summary className="cursor-pointer text-xs">Яких позицій не знайдено</summary>
              <ul className="mt-1 text-xs space-y-0.5 max-h-48 overflow-y-auto">
                {msg.details.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </section>
  );
}
