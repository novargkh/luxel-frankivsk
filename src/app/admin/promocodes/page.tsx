"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Plus, Sparkle, Users, UsersThree, EyeSlash } from "@phosphor-icons/react";
import Navbar from "@/components/Navbar";

type Client = { id: string; name: string; company: string | null; email?: string };

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
  clients: Client[];
  _count: { orders: number };
};

type Audience = "NONE" | "ALL" | "SELECTED";

const emptyForm = {
  code: "",
  type: "PERCENT" as "PERCENT" | "FIXED",
  value: "",
  usageLimit: "",
  expiresAt: "",
  description: "",
  audience: "ALL" as Audience,
  clientIds: [] as string[],
};

function generateCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "LUXEL-";
  for (let i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

// showToClients off = hidden; on + no clients = everyone; on + clients =
// only those clients.
function audienceOf(c: PromoCode): Audience {
  if (!c.showToClients) return "NONE";
  return c.clients.length > 0 ? "SELECTED" : "ALL";
}

const inputCls =
  "w-full h-11 rounded-2xl bg-white/80 ring-1 ring-white px-4 text-sm text-ink placeholder:text-muted focus:outline-none focus:bg-white focus:shadow-[0_0_0_4px_rgba(255,255,255,0.6),0_8px_24px_-10px_rgba(16,17,20,0.25)]";

function AudiencePicker({
  audience,
  clientIds,
  clients,
  onChange,
}: {
  audience: Audience;
  clientIds: string[];
  clients: Client[];
  onChange: (a: Audience, ids: string[]) => void;
}) {
  const [filter, setFilter] = useState("");
  const shown = clients.filter((c) =>
    `${c.name} ${c.company ?? ""} ${c.email ?? ""}`.toLowerCase().includes(filter.trim().toLowerCase())
  );
  const opts: { v: Audience; label: string; icon: React.ReactNode }[] = [
    { v: "ALL", label: "Усім клієнтам", icon: <UsersThree size={16} weight="light" /> },
    { v: "SELECTED", label: "Обраним", icon: <Users size={16} weight="light" /> },
    { v: "NONE", label: "Нікому", icon: <EyeSlash size={16} weight="light" /> },
  ];
  return (
    <div>
      <div className="flex gap-2 flex-wrap">
        {opts.map((o) => (
          <button
            key={o.v}
            type="button"
            aria-pressed={audience === o.v}
            onClick={() => onChange(o.v, clientIds)}
            className={`h-10 inline-flex items-center gap-2 rounded-full px-4 text-sm font-medium transition-all duration-300 ease-fluid ${
              audience === o.v ? "bg-ink text-white" : "bg-white/70 ring-1 ring-white text-ink hover:bg-white"
            }`}
          >
            {o.icon}
            {o.label}
          </button>
        ))}
      </div>
      {audience === "SELECTED" && (
        <div className="mt-3 rounded-2xl bg-white/70 ring-1 ring-white p-2">
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Пошук клієнта"
            className={inputCls}
          />
          <ul className="mt-2 max-h-56 overflow-y-auto">
            {shown.map((c) => {
              const on = clientIds.includes(c.id);
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() =>
                      onChange(
                        "SELECTED",
                        on ? clientIds.filter((x) => x !== c.id) : [...clientIds, c.id]
                      )
                    }
                    className="w-full flex items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-white"
                  >
                    <span
                      className={`w-5 h-5 shrink-0 rounded-md inline-flex items-center justify-center ${
                        on ? "bg-ink text-white" : "ring-1 ring-black/15"
                      }`}
                    >
                      {on && <Check size={12} weight="bold" />}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm text-ink truncate">{c.name}</span>
                      {c.company && <span className="block text-xs text-muted truncate">{c.company}</span>}
                    </span>
                  </button>
                </li>
              );
            })}
            {shown.length === 0 && <li className="px-3 py-2 text-sm text-muted">Нікого не знайдено</li>}
          </ul>
          <p className="px-3 pt-1 pb-1 text-xs text-muted">Обрано: {clientIds.length}</p>
        </div>
      )}
    </div>
  );
}

export default function AdminPromoCodesPage() {
  const [codes, setCodes] = useState<PromoCode[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  // Editing who sees an existing code.
  const [editId, setEditId] = useState<string | null>(null);
  const [editAudience, setEditAudience] = useState<Audience>("ALL");
  const [editIds, setEditIds] = useState<string[]>([]);
  const [editDesc, setEditDesc] = useState("");

  async function load() {
    const [res, cRes] = await Promise.all([fetch("/api/admin/promocodes"), fetch("/api/admin/clients")]);
    setCodes(await res.json());
    if (cRes.ok) setClients(await cRes.json());
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const clientName = useMemo(() => new Map(clients.map((c) => [c.id, c.name])), [clients]);

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
        description: form.description,
        showToClients: form.audience !== "NONE" && !(form.audience === "SELECTED" && form.clientIds.length === 0),
        clientIds: form.audience === "SELECTED" ? form.clientIds : [],
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

  async function patch(id: string, body: Record<string, unknown>) {
    await fetch(`/api/admin/promocodes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    load();
  }

  async function remove(id: string) {
    if (!confirm("Видалити промокод?")) return;
    await fetch(`/api/admin/promocodes/${id}`, { method: "DELETE" });
    load();
  }

  function startEdit(c: PromoCode) {
    setEditId(c.id);
    setEditAudience(audienceOf(c));
    setEditIds(c.clients.map((x) => x.id));
    setEditDesc(c.description ?? "");
  }

  async function saveEdit() {
    if (!editId) return;
    await patch(editId, {
      description: editDesc,
      showToClients: editAudience !== "NONE" && !(editAudience === "SELECTED" && editIds.length === 0),
      clientIds: editAudience === "SELECTED" ? editIds : [],
    });
    setEditId(null);
  }

  return (
    <div className="min-h-[100dvh] flex flex-col">
      <Navbar />
      <main className="max-w-5xl mx-auto w-full px-4 sm:px-6 pt-8 sm:pt-14 pb-24 flex-1">
        <header className="flex items-end justify-between gap-4 flex-wrap mb-8">
          <div>
            <h1 className="text-[40px] leading-[0.95] sm:text-5xl font-semibold tracking-[-0.045em] text-ink">
              Промокоди
            </h1>
            <p className="mt-3 text-base text-muted">
              Видані клієнтам коди з&apos;являються в їхньому меню і в кошику.
            </p>
          </div>
          <button
            onClick={startCreate}
            className="group h-12 inline-flex items-center gap-3 rounded-full bg-ink pl-5 pr-1.5 text-sm font-medium text-white active:scale-[0.98] transition-transform duration-300 ease-fluid"
          >
            Новий промокод
            <span className="w-9 h-9 rounded-full bg-white/15 inline-flex items-center justify-center transition-transform duration-500 ease-fluid group-hover:rotate-90">
              <Plus size={16} weight="bold" />
            </span>
          </button>
        </header>

        {creating && (
          <div className="reveal rounded-[1.75rem] glass-tray p-1.5 mb-6">
            <div className="rounded-[calc(1.75rem-0.375rem)] glass-card p-5 sm:p-6 space-y-4">
              <h2 className="text-[15px] font-semibold text-ink">Новий промокод</h2>
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="flex gap-2">
                  <input
                    placeholder="Код"
                    value={form.code}
                    onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                    className={`${inputCls} font-mono`}
                  />
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, code: generateCode() }))}
                    aria-label="Згенерувати код"
                    className="shrink-0 w-11 h-11 rounded-2xl bg-white/80 ring-1 ring-white inline-flex items-center justify-center text-ink"
                  >
                    <Sparkle size={18} weight="light" />
                  </button>
                </div>
                <select
                  value={form.type}
                  onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as "PERCENT" | "FIXED" }))}
                  className={inputCls}
                >
                  <option value="PERCENT">Відсоток від суми (%)</option>
                  <option value="FIXED">Фіксована сума (грн)</option>
                </select>
                <input
                  type="number"
                  placeholder={form.type === "PERCENT" ? "Розмір знижки, %" : "Розмір знижки, грн"}
                  value={form.value}
                  onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
                  className={inputCls}
                />
                <input
                  type="number"
                  placeholder="Ліміт використань (порожньо = без ліміту)"
                  value={form.usageLimit}
                  onChange={(e) => setForm((f) => ({ ...f, usageLimit: e.target.value }))}
                  className={inputCls}
                />
                <label className="block">
                  <span className="block text-xs text-muted mb-1 px-1">Діє до (необов&apos;язково)</span>
                  <input
                    type="date"
                    value={form.expiresAt}
                    onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))}
                    className={inputCls}
                  />
                </label>
              </div>
              <label className="block">
                <span className="block text-xs text-muted mb-1 px-1">Опис для клієнта</span>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  rows={2}
                  placeholder="Наприклад: знижка 10% на розетки JAZZ до кінця місяця"
                  className={`${inputCls} h-auto py-3`}
                />
              </label>
              <div>
                <span className="block text-xs text-muted mb-2 px-1">Кому видати</span>
                <AudiencePicker
                  audience={form.audience}
                  clientIds={form.clientIds}
                  clients={clients}
                  onChange={(a, ids) => setForm((f) => ({ ...f, audience: a, clientIds: ids }))}
                />
              </div>
              {error && <p className="text-sm text-brand">{error}</p>}
              <div className="flex gap-2">
                <button
                  onClick={submit}
                  disabled={saving || !form.code || !form.value}
                  className="h-11 rounded-full bg-brand px-6 text-sm font-semibold text-white disabled:opacity-40"
                >
                  {saving ? "Створюю..." : "Створити"}
                </button>
                <button
                  onClick={() => setCreating(false)}
                  className="h-11 rounded-full px-5 text-sm font-medium text-ink bg-white/70 ring-1 ring-white"
                >
                  Скасувати
                </button>
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <p className="text-sm text-muted">Завантаження...</p>
        ) : codes.length === 0 ? (
          <p className="text-sm text-muted">Промокодів ще немає.</p>
        ) : (
          <div className="space-y-3">
            {codes.map((c) => {
              const expired = c.expiresAt && new Date(c.expiresAt) < new Date();
              const limitReached = c.usageLimit != null && c._count.orders >= c.usageLimit;
              const aud = audienceOf(c);
              return (
                <div key={c.id} className="rounded-[1.75rem] glass-tray p-1.5">
                  <div className="rounded-[calc(1.75rem-0.375rem)] glass-card p-4 sm:p-5">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-lg font-semibold text-ink">{c.code}</span>
                          <span className="text-sm text-ink/80">
                            {c.type === "PERCENT" ? `-${c.value}%` : `-${c.value} грн`}
                          </span>
                          {!c.isActive ? (
                            <span className="h-6 inline-flex items-center rounded-full px-2.5 text-xs bg-black/[0.06] text-muted">вимкнено</span>
                          ) : expired ? (
                            <span className="h-6 inline-flex items-center rounded-full px-2.5 text-xs bg-brand/10 text-brand">прострочено</span>
                          ) : limitReached ? (
                            <span className="h-6 inline-flex items-center rounded-full px-2.5 text-xs bg-brand/10 text-brand">ліміт вичерпано</span>
                          ) : (
                            <span className="h-6 inline-flex items-center rounded-full px-2.5 text-xs bg-emerald-100/80 text-emerald-800">активний</span>
                          )}
                        </div>
                        {c.description && <p className="mt-1 text-sm text-ink/75">{c.description}</p>}
                        <p className="mt-1 text-xs text-muted tabular">
                          Використано {c._count.orders}
                          {c.usageLimit != null ? ` з ${c.usageLimit}` : ", без ліміту"}
                          {c.expiresAt ? `. Діє до ${new Date(c.expiresAt).toLocaleDateString("uk-UA")}` : ""}
                        </p>
                        <p className="mt-1 text-xs text-ink/70">
                          {aud === "ALL"
                            ? "Видано всім клієнтам"
                            : aud === "SELECTED"
                              ? `Видано: ${c.clients.map((x) => clientName.get(x.id) ?? x.name).join(", ")}`
                              : "Нікому не показується"}
                        </p>
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        <button
                          onClick={() => (editId === c.id ? setEditId(null) : startEdit(c))}
                          className="h-9 rounded-full px-4 text-xs font-medium bg-white/70 ring-1 ring-white text-ink hover:bg-white"
                        >
                          Кому і опис
                        </button>
                        <button
                          onClick={() => patch(c.id, { isActive: !c.isActive })}
                          className="h-9 rounded-full px-4 text-xs font-medium bg-white/70 ring-1 ring-white text-ink hover:bg-white"
                        >
                          {c.isActive ? "Вимкнути" : "Увімкнути"}
                        </button>
                        <button
                          onClick={() => remove(c.id)}
                          className="h-9 rounded-full px-4 text-xs font-medium text-brand hover:bg-brand/10"
                        >
                          Видалити
                        </button>
                      </div>
                    </div>

                    {editId === c.id && (
                      <div className="reveal mt-4 pt-4 border-t border-black/[0.05] space-y-3">
                        <textarea
                          value={editDesc}
                          onChange={(e) => setEditDesc(e.target.value)}
                          rows={2}
                          placeholder="Опис для клієнта"
                          className={`${inputCls} h-auto py-3`}
                        />
                        <AudiencePicker
                          audience={editAudience}
                          clientIds={editIds}
                          clients={clients}
                          onChange={(a, ids) => {
                            setEditAudience(a);
                            setEditIds(ids);
                          }}
                        />
                        <button
                          onClick={saveEdit}
                          className="h-10 rounded-full bg-ink px-5 text-sm font-medium text-white"
                        >
                          Зберегти
                        </button>
                      </div>
                    )}
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
