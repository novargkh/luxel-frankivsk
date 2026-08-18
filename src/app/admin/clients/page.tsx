"use client";

import { useEffect, useState } from "react";
import Navbar from "@/components/Navbar";

type Client = {
  id: string;
  name: string;
  email: string;
  company: string | null;
  phone: string | null;
  basId: string | null;
  createdAt: string;
  shops: { id: string; name: string; address: string }[];
  _count: { orders: number };
};

const emptyForm = { name: "", email: "", password: "", company: "" };

function generatePassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 10; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export default function AdminClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<{ email: string; password: string } | null>(
    null
  );
  // Inline BAS ID editing — keyed by client id, so each card edits
  // independently without a separate modal/page.
  const [basIdDrafts, setBasIdDrafts] = useState<Record<string, string>>({});
  const [savingBasId, setSavingBasId] = useState<string | null>(null);
  const [basIdError, setBasIdError] = useState<Record<string, string>>({});

  async function load() {
    setLoading(true);
    const res = await fetch("/api/admin/clients");
    setClients(await res.json());
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  function startCreate() {
    setForm({ ...emptyForm, password: generatePassword() });
    setCreating(true);
    setCreated(null);
    setError("");
  }

  async function saveBasId(client: Client) {
    const value = basIdDrafts[client.id] ?? client.basId ?? "";
    setSavingBasId(client.id);
    setBasIdError((e) => ({ ...e, [client.id]: "" }));
    const res = await fetch(`/api/admin/clients/${client.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ basId: value }),
    });
    setSavingBasId(null);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setBasIdError((e) => ({ ...e, [client.id]: err.error || "Не вдалося зберегти" }));
      return;
    }
    load();
  }

  async function submit() {
    setSaving(true);
    setError("");
    const res = await fetch("/api/admin/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setError(err.error || "Не вдалося створити клієнта");
      return;
    }

    setCreated({ email: form.email, password: form.password });
    setCreating(false);
    setForm(emptyForm);
    load();
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="max-w-4xl mx-auto w-full px-4 py-6 flex-1">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-lg font-semibold text-slate-900">Клієнти</h1>
          <button
            onClick={startCreate}
            className="bg-brand text-white text-sm rounded-lg px-4 py-2 hover:bg-brand-dark"
          >
            + Додати клієнта
          </button>
        </div>

        {created && (
          <div className="mb-6 border border-emerald-200 bg-emerald-50 rounded-xl p-4 text-sm text-emerald-900">
            Клієнта створено. Передайте йому дані для входу:
            <div className="mt-2 font-mono text-xs bg-white border border-emerald-200 rounded-lg p-2 inline-block">
              {created.email} / {created.password}
            </div>
          </div>
        )}

        {creating && (
          <div className="border border-slate-200 bg-white rounded-xl p-4 mb-6">
            <h2 className="text-sm font-semibold text-slate-900 mb-3">Новий клієнт</h2>
            <div className="grid sm:grid-cols-2 gap-3 mb-3">
              <input
                placeholder="Ім'я / контактна особа"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
              />
              <input
                placeholder="Компанія"
                value={form.company}
                onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))}
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
              />
              <input
                type="email"
                placeholder="Email (логін)"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
              />
              <div className="flex gap-2">
                <input
                  placeholder="Пароль"
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono"
                />
                <button
                  onClick={() => setForm((f) => ({ ...f, password: generatePassword() }))}
                  className="text-xs text-slate-500 border border-slate-200 rounded-lg px-3 hover:bg-slate-50"
                  type="button"
                >
                  Згенерувати
                </button>
              </div>
            </div>

            {error && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-3">
                {error}
              </p>
            )}

            <div className="flex gap-2">
              <button
                onClick={submit}
                disabled={saving || !form.name || !form.email || !form.password}
                className="bg-brand text-white text-sm rounded-lg px-4 py-2 hover:bg-brand-dark disabled:opacity-50"
              >
                {saving ? "Створення..." : "Створити клієнта"}
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
        ) : clients.length === 0 ? (
          <p className="text-sm text-slate-500">Клієнтів ще немає.</p>
        ) : (
          <div className="space-y-2">
            {clients.map((c) => (
              <div key={c.id} className="border border-slate-200 bg-white rounded-xl p-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <div className="text-sm font-medium text-slate-900">
                      {c.name} {c.company && <span className="text-slate-400">— {c.company}</span>}
                    </div>
                    <div className="text-xs text-slate-500">
                      {c.email}
                      {c.phone && <span> · {c.phone}</span>}
                    </div>
                  </div>
                  <div className="text-xs text-slate-500 text-right">
                    <div>{c._count.orders} замовлень</div>
                    <div>{c.shops.length} магазин(ів)</div>
                  </div>
                </div>
                {c.shops.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-slate-100 space-y-0.5">
                    {c.shops.map((s) => (
                      <div key={s.id} className="text-xs text-slate-400">
                        {s.name} — {s.address}
                      </div>
                    ))}
                  </div>
                )}
                <div className="mt-2 pt-2 border-t border-slate-100 flex items-center gap-2">
                  <label className="text-xs text-slate-500 shrink-0" title="Ідентифікатор контрагента в BAS — основний ключ зіставлення клієнта для обміну CommerceML">
                    BAS ID:
                  </label>
                  <input
                    value={basIdDrafts[c.id] ?? c.basId ?? ""}
                    onChange={(e) => setBasIdDrafts((d) => ({ ...d, [c.id]: e.target.value }))}
                    placeholder="ще не вказано — зіставлення по email+телефону"
                    className="flex-1 border border-slate-200 rounded-lg px-2 py-1 text-xs font-mono"
                  />
                  <button
                    onClick={() => saveBasId(c)}
                    disabled={savingBasId === c.id}
                    className="text-xs bg-white text-brand border border-brand rounded-lg px-3 py-1 hover:bg-red-50 disabled:opacity-50"
                  >
                    {savingBasId === c.id ? "..." : "Зберегти"}
                  </button>
                </div>
                {basIdError[c.id] && (
                  <p className="mt-1 text-xs text-red-600">{basIdError[c.id]}</p>
                )}
                {!c.phone && !c.basId && (
                  <p className="mt-1 text-xs text-amber-600">
                    Немає ні BAS ID, ні телефону — замовлення цього клієнта не будуть передані в BAS
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
