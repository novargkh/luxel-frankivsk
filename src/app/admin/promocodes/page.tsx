"use client";

import { useEffect, useState } from "react";
import Navbar from "@/components/Navbar";

type PromoCode = {
  id: string;
  code: string;
  type: "PERCENT" | "FIXED";
  value: number;
  usageLimit: number | null;
  isActive: boolean;
  expiresAt: string | null;
  createdAt: string;
  _count: { orders: number };
};

const emptyForm = {
  code: "",
  type: "PERCENT" as "PERCENT" | "FIXED",
  value: "",
  usageLimit: "",
  expiresAt: "",
};

function generateCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "LUXEL-";
  for (let i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export default function AdminPromoCodesPage() {
  const [codes, setCodes] = useState<PromoCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    const res = await fetch("/api/admin/promocodes");
    setCodes(await res.json());
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  function startCreate() {
    setForm({ ...emptyForm, code: generateCode() });
    setCreating(true);
    setError("");
  }

  async function submit() {
    setSaving(true);
    setError("");

    const res = await fetch("/api/admin/promocodes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: form.code,
        type: form.type,
        value: Number(form.value),
        usageLimit: form.usageLimit ? Number(form.usageLimit) : null,
        expiresAt: form.expiresAt || null,
      }),
    });

    setSaving(false);

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setError(err.error || "Не вдалося створити промокод");
      return;
    }

    setCreating(false);
    setForm(emptyForm);
    load();
  }

  async function toggleActive(id: string, isActive: boolean) {
    await fetch(`/api/admin/promocodes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !isActive }),
    });
    load();
  }

  async function remove(id: string) {
    if (!confirm("Видалити промокод?")) return;
    await fetch(`/api/admin/promocodes/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="max-w-4xl mx-auto w-full px-4 py-6 flex-1">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-lg font-semibold text-slate-900">Промокоди</h1>
          <button
            onClick={startCreate}
            className="bg-brand text-white text-sm rounded-lg px-4 py-2 hover:bg-brand-dark"
          >
            + Створити промокод
          </button>
        </div>

        {creating && (
          <div className="border border-slate-200 bg-white rounded-xl p-4 mb-6">
            <h2 className="text-sm font-semibold text-slate-900 mb-3">Новий промокод</h2>

            <div className="grid sm:grid-cols-2 gap-3 mb-3">
              <div className="flex gap-2">
                <input
                  placeholder="Код"
                  value={form.code}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))
                  }
                  className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono"
                />
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, code: generateCode() }))}
                  className="text-xs text-slate-500 border border-slate-200 rounded-lg px-3 hover:bg-slate-50"
                >
                  Згенерувати
                </button>
              </div>

              <select
                value={form.type}
                onChange={(e) =>
                  setForm((f) => ({ ...f, type: e.target.value as "PERCENT" | "FIXED" }))
                }
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
              >
                <option value="PERCENT">Відсоток від суми (%)</option>
                <option value="FIXED">Фіксована сума (грн)</option>
              </select>

              <input
                type="number"
                placeholder={form.type === "PERCENT" ? "Розмір знижки, %" : "Розмір знижки, грн"}
                value={form.value}
                onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
              />

              <input
                type="number"
                placeholder="Ліміт використань (порожньо = без ліміту)"
                value={form.usageLimit}
                onChange={(e) => setForm((f) => ({ ...f, usageLimit: e.target.value }))}
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
              />

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Діє до (необов&apos;язково)
                </label>
                <input
                  type="date"
                  value={form.expiresAt}
                  onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
            </div>

            <p className="text-xs text-slate-400 mb-3">
              Для розіграшу з одним переможцем поставте ліміт використань «1». Для
              масової акції залиште поле порожнім (без обмежень) або вкажіть потрібну
              кількість.
            </p>

            {error && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-3">
                {error}
              </p>
            )}

            <div className="flex gap-2">
              <button
                onClick={submit}
                disabled={saving || !form.code || !form.value}
                className="bg-brand text-white text-sm rounded-lg px-4 py-2 hover:bg-brand-dark disabled:opacity-50"
              >
                {saving ? "Створення..." : "Створити"}
              </button>
              <button
                onClick={() => setCreating(false)}
                className="text-sm text-slate-500 border border-slate-200 rounded-lg px-4 py-2 hover:bg-slate-50"
              >
                Скасувати
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <p className="text-sm text-slate-500">Завантаження...</p>
        ) : codes.length === 0 ? (
          <p className="text-sm text-slate-500">Промокодів ще немає.</p>
        ) : (
          <div className="border border-slate-200 bg-white rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Код</th>
                  <th className="text-left px-3 py-2 font-medium">Знижка</th>
                  <th className="text-left px-3 py-2 font-medium">Використано</th>
                  <th className="text-left px-3 py-2 font-medium">Діє до</th>
                  <th className="text-left px-3 py-2 font-medium">Статус</th>
                  <th className="text-right px-3 py-2 font-medium">Дії</th>
                </tr>
              </thead>
              <tbody>
                {codes.map((c) => {
                  const expired = c.expiresAt && new Date(c.expiresAt) < new Date();
                  const limitReached =
                    c.usageLimit != null && c._count.orders >= c.usageLimit;
                  return (
                    <tr key={c.id} className="border-t border-slate-100">
                      <td className="px-3 py-2 font-mono text-slate-800">{c.code}</td>
                      <td className="px-3 py-2 text-slate-600">
                        {c.type === "PERCENT" ? `${c.value}%` : `${c.value} грн`}
                      </td>
                      <td className="px-3 py-2 text-slate-600">
                        {c._count.orders}
                        {c.usageLimit != null ? ` / ${c.usageLimit}` : " / ∞"}
                      </td>
                      <td className="px-3 py-2 text-slate-600">
                        {c.expiresAt
                          ? new Date(c.expiresAt).toLocaleDateString("uk-UA")
                          : "—"}
                      </td>
                      <td className="px-3 py-2">
                        {!c.isActive ? (
                          <span className="text-xs text-slate-400">вимкнено</span>
                        ) : expired ? (
                          <span className="text-xs text-red-500">прострочено</span>
                        ) : limitReached ? (
                          <span className="text-xs text-red-500">ліміт вичерпано</span>
                        ) : (
                          <span className="text-xs text-emerald-600">активний</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right space-x-2">
                        <button
                          onClick={() => toggleActive(c.id, c.isActive)}
                          className="text-xs text-slate-600 hover:text-slate-900"
                        >
                          {c.isActive ? "Вимкнути" : "Увімкнути"}
                        </button>
                        <button
                          onClick={() => remove(c.id)}
                          className="text-xs text-red-500 hover:text-red-700"
                        >
                          Видалити
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
