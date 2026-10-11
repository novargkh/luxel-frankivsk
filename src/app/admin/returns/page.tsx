"use client";

import { useEffect, useState } from "react";
import Navbar from "@/components/Navbar";
import {
  RETURN_STATUS_COLORS,
  RETURN_STATUS_LABELS,
  type ReturnRequestDto,
  type ReturnStatus,
} from "@/lib/returns";

export default function AdminReturnsPage() {
  const [returns, setReturns] = useState<ReturnRequestDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [onlyNew, setOnlyNew] = useState(true);
  // Draft replies, keyed by return id.
  const [comments, setComments] = useState<Record<string, string>>({});
  const [savedId, setSavedId] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/returns");
    const data = await res.json();
    setReturns(Array.isArray(data) ? data : []);
    setLoading(false);
  }

  useEffect(() => {
    let alive = true;
    fetch("/api/returns")
      .then((r) => r.json())
      .then((data) => {
        if (!alive) return;
        setReturns(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  async function patch(id: string, body: { status?: ReturnStatus; adminComment?: string }) {
    await fetch(`/api/returns/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (body.adminComment !== undefined) {
      setSavedId(id);
      setTimeout(() => setSavedId((s) => (s === id ? null : s)), 1600);
    }
    load();
  }

  const visible = onlyNew ? returns.filter((r) => r.status === "NEW") : returns;

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="max-w-4xl mx-auto w-full px-4 py-6 flex-1">
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <h1 className="text-lg font-semibold text-slate-900">Повернення</h1>
          <label className="inline-flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={onlyNew} onChange={(e) => setOnlyNew(e.target.checked)} />
            Тільки нові
          </label>
        </div>

        {loading ? (
          <p className="text-sm text-slate-500">Завантаження...</p>
        ) : visible.length === 0 ? (
          <p className="text-sm text-slate-500">
            {onlyNew ? "Нових запитів на повернення немає." : "Запитів на повернення ще не було."}
          </p>
        ) : (
          <div className="space-y-3">
            {visible.map((r) => {
              const total = r.items.reduce((s, i) => s + i.orderItem.priceAtOrder * i.quantity, 0);
              const draft = comments[r.id] ?? r.adminComment ?? "";
              return (
                <div key={r.id} className="border border-slate-200 bg-white rounded-xl p-4">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <div className="text-sm font-medium text-slate-900">
                        {r.user?.company || r.user?.name}
                        <span className="text-slate-400 font-normal"> · {r.user?.email}</span>
                      </div>
                      <div className="text-xs text-slate-500">
                        {new Date(r.createdAt).toLocaleString("uk-UA")}
                      </div>
                    </div>
                    <select
                      value={r.status}
                      onChange={(e) => patch(r.id, { status: e.target.value as ReturnStatus })}
                      aria-label="Статус повернення"
                      className={`h-8 rounded-full pl-3 pr-2 text-xs font-medium border-0 ${RETURN_STATUS_COLORS[r.status]}`}
                    >
                      {Object.entries(RETURN_STATUS_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <table className="w-full text-sm mt-3">
                    <tbody>
                      {r.items.map((i) => (
                        <tr key={i.id} className="border-t border-slate-100">
                          <td className="py-1.5 pr-2 text-slate-800">
                            {i.orderItem.product.name}
                            {i.orderNumber && (
                              <span className="text-xs text-slate-400"> · № {i.orderNumber}</span>
                            )}
                          </td>
                          <td className="py-1.5 px-2 text-right text-slate-600 whitespace-nowrap">
                            {i.quantity} з {i.orderItem.quantity} шт
                          </td>
                          <td className="py-1.5 pl-2 text-right text-slate-900 whitespace-nowrap">
                            {(i.orderItem.priceAtOrder * i.quantity).toLocaleString("uk-UA")} ₴
                          </td>
                        </tr>
                      ))}
                      <tr className="border-t border-slate-200">
                        <td colSpan={2} className="py-1.5 text-right text-xs text-slate-500">
                          Сума повернення
                        </td>
                        <td className="py-1.5 pl-2 text-right font-semibold text-slate-900 whitespace-nowrap">
                          {total.toLocaleString("uk-UA")} ₴
                        </td>
                      </tr>
                    </tbody>
                  </table>

                  <p className="mt-2 text-sm text-slate-700 whitespace-pre-line">
                    <span className="text-slate-400">Причина: </span>
                    {r.reason}
                  </p>

                  <div className="mt-3 flex gap-2 items-start">
                    <textarea
                      value={draft}
                      onChange={(e) => setComments((c) => ({ ...c, [r.id]: e.target.value }))}
                      rows={2}
                      placeholder="Відповідь клієнту (необов'язково)"
                      className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm resize-none"
                    />
                    <button
                      onClick={() => patch(r.id, { adminComment: draft })}
                      className="text-sm border border-slate-200 rounded-lg px-3 py-2 hover:bg-slate-50 whitespace-nowrap"
                    >
                      {savedId === r.id ? "Збережено" : "Зберегти"}
                    </button>
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
