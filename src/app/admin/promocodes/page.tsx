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
  description: string | null;
  showToClients: boolean;
  clients: { id: string; name: string; company: string | null }[];
  _count: { orders: number };
};

type Client = { id: string; name: string; company: string | null; email: string };

const emptyForm = {
  code: "",
  type: "PERCENT" as "PERCENT" | "FIXED",
  value: "",
  usageLimit: "",
  expiresAt: "",
  description: "",
  // "hidden": not shown in any cabinet (code is passed on by hand);
  // "all": every client sees it; "selected": only the chosen clients.
  audience: "all" as "hidden" | "all" | "selected",
  clientIds: [] as string[],
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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [clients, setClients] = useState<Client[]>([]);
  const [clientQuery, setClientQuery] = useState("");

  async function load() {
    setLoading(true);
    const res = await fetch("/api/admin/promocodes");
    setCodes(await res.json());
    setLoading(false);
  }

  useEffect(() => {
    load();
    fetch("/api/admin/clients")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setClients(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  function startCreate() {
    setForm({ ...emptyForm, code: generateCode() });
    setEditingId(null);
    setCreating(true);
    setError("");
  }

  function startEdit(c: PromoCode) {
    setForm({
      code: c.code,
      type: c.type,
      value: String(c.value),
      usageLimit: c.usageLimit != null ? String(c.usageLimit) : "",
      expiresAt: c.expiresAt ? c.expiresAt.slice(0, 10) : "",
      description: c.description ?? "",
      audience: !c.showToClients ? "hidden" : c.clients.length > 0 ? "selected" : "all",
      clientIds: c.clients.map((cl) => cl.id),
    });
    setEditingId(c.id);
    setCreating(true);
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function toggleClient(id: string) {
    setForm((f) => ({
      ...f,
      clientIds: f.clientIds.includes(id)
        ? f.clientIds.filter((x) => x !== id)
        : [...f.clientIds, id],
    }));
  }

  function audienceLabel(c: PromoCode) {
    if (!c.showToClients) return "Прихований";
    if (c.clients.length === 0) return "Усім клієнтам";
    if (c.clients.length === 1) return c.clients[0].company || c.clients[0].name;
    return `Клієнтів: ${c.clients.length}`;
  }

  async function submit() {
    if (form.audience === "selected" && form.clientIds.length === 0) {
      setError("Оберіть хоча б одного клієнта");
      return;
    }
    setSaving(true);
    setError("");

    const audience = {
      description: form.description,
      showToClients: form.audience !== "hidden",
      clientIds: form.audience === "selected" ? form.clientIds : [],
    };

    const res = editingId
      ? await fetch(`/api/admin/promocodes/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(audience),
        })
      : await fetch("/api/admin/promocodes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code: form.code,
            type: form.type,
            value: Number(form.value),
            usageLimit: form.usageLimit ? Number(form.usageLimit) : null,
            expiresAt: form.expiresAt || null,
            ...audience,
          }),
        });

    setSaving(false);

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setError(err.error || "Не вдалося зберегти промокод");
      return;
    }

    setCreating(false);
    setEditingId(null);
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
            <h2 className="text-sm font-semibold text-slate-900 mb-3">
              {editingId ? `Промокод ${form.code}` : "Новий промокод"}
            </h2>
            {editingId && (
              <p className="text-xs text-slate-400 mb-3">
                Код, знижку, ліміт і термін дії не змінюємо — вони вже могли бути
                використані в замовленнях. Можна змінити опис і кому показувати.
              </p>
            )}

            <div className="grid sm:grid-cols-2 gap-3 mb-3">
              <div className="flex gap-2">
                <input
                  placeholder="Код"
                  value={form.code}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))
                  }
                  disabled={!!editingId}
                  className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono disabled:bg-slate-50 disabled:text-slate-400"
                />
                <button
                  type="button"
                  disabled={!!editingId}
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
                disabled={!!editingId}
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm disabled:bg-slate-50 disabled:text-slate-400"
              >
                <option value="PERCENT">Відсоток від суми (%)</option>
                <option value="FIXED">Фіксована сума (грн)</option>
              </select>

              <input
                type="number"
                placeholder={form.type === "PERCENT" ? "Розмір знижки, %" : "Розмір знижки, грн"}
                value={form.value}
                onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
                disabled={!!editingId}
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm disabled:bg-slate-50 disabled:text-slate-400"
              />

              <input
                type="number"
                placeholder="Ліміт використань (порожньо = без ліміту)"
                value={form.usageLimit}
                onChange={(e) => setForm((f) => ({ ...f, usageLimit: e.target.value }))}
                disabled={!!editingId}
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm disabled:bg-slate-50 disabled:text-slate-400"
              />

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Діє до (необов&apos;язково)
                </label>
                <input
                  type="date"
                  value={form.expiresAt}
                  onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))}
                  disabled={!!editingId}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm disabled:bg-slate-50 disabled:text-slate-400"
                />
              </div>
            </div>

            <div className="mb-3">
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Опис для клієнта
              </label>
              <textarea
                placeholder="Напр. «Знижка 10% на всі LED-лампи до кінця місяця»"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                rows={2}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm resize-none"
              />
            </div>

            <div className="mb-3">
              <p className="text-xs font-medium text-slate-600 mb-1.5">
                Кому показати в кабінеті («Доступні промокоди»)
              </p>
              <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-slate-700">
                {(
                  [
                    ["all", "Усім клієнтам"],
                    ["selected", "Обраним клієнтам"],
                    ["hidden", "Нікому (передам код сам)"],
                  ] as const
                ).map(([value, label]) => (
                  <label key={value} className="inline-flex items-center gap-1.5">
                    <input
                      type="radio"
                      name="audience"
                      checked={form.audience === value}
                      onChange={() => setForm((f) => ({ ...f, audience: value }))}
                    />
                    {label}
                  </label>
                ))}
              </div>

              {form.audience === "selected" && (
                <div className="mt-2 border border-slate-200 rounded-lg p-2">
                  <input
                    placeholder="Пошук клієнта"
                    value={clientQuery}
                    onChange={(e) => setClientQuery(e.target.value)}
                    className="w-full border border-slate-200 rounded-md px-2 py-1.5 text-sm mb-2"
                  />
                  <div className="max-h-48 overflow-y-auto space-y-0.5">
                    {clients
                      .filter((cl) => {
                        const q = clientQuery.trim().toLowerCase();
                        if (!q) return true;
                        return [cl.name, cl.company ?? "", cl.email].some((v) =>
                          v.toLowerCase().includes(q)
                        );
                      })
                      .map((cl) => (
                        <label
                          key={cl.id}
                          className="flex items-center gap-2 px-1.5 py-1 rounded hover:bg-slate-50 text-sm"
                        >
                          <input
                            type="checkbox"
                            checked={form.clientIds.includes(cl.id)}
                            onChange={() => toggleClient(cl.id)}
                          />
                          <span className="text-slate-800">{cl.company || cl.name}</span>
                          <span className="text-xs text-slate-400 truncate">{cl.email}</span>
                        </label>
                      ))}
                  </div>
                  <p className="text-xs text-slate-400 mt-1.5">
                    Обрано: {form.clientIds.length}. Застосувати такий код зможуть лише
                    обрані клієнти.
                  </p>
                </div>
              )}
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
                {saving ? "Збереження..." : editingId ? "Зберегти" : "Створити"}
              </button>
              <button
                onClick={() => {
                  setCreating(false);
                  setEditingId(null);
                }}
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
                  <th className="text-left px-3 py-2 font-medium">Кому</th>
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
                      <td className="px-3 py-2">
                        <div className="font-mono text-slate-800">{c.code}</div>
                        {c.description && (
                          <div className="text-xs text-slate-400 max-w-[16rem] truncate">
                            {c.description}
                          </div>
                        )}
                      </td>
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
                      <td className="px-3 py-2 text-xs text-slate-600">{audienceLabel(c)}</td>
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
                      <td className="px-3 py-2 text-right space-x-2 whitespace-nowrap">
                        <button
                          onClick={() => startEdit(c)}
                          className="text-xs text-slate-600 hover:text-slate-900"
                        >
                          Змінити
                        </button>
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
