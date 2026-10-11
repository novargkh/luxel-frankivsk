"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Check,
  Copy,
  EyeSlash,
  MagnifyingGlass,
  MinusCircle,
  PencilSimple,
  Plus,
  Sparkle,
  Trash,
  Users,
  UsersThree,
} from "@phosphor-icons/react";
import Navbar from "@/components/Navbar";
import { getCategoryTree } from "@/lib/categorize";

// Promo codes, modelled on OpenCart's coupons: name, code, percent or fixed
// discount, minimum order total, the products and categories it applies to
// (none = whole order), start / end dates, total and per-client usage
// limits, on/off. On top: who sees it in their cabinet (everyone, chosen
// clients or nobody) and a description for clients. "Історія" lists the
// orders placed with the code.

type Client = { id: string; name: string; company: string | null; email?: string | null };
type ProductRef = { id: string; name: string };

type PromoCode = {
  id: string;
  name: string | null;
  code: string;
  type: "PERCENT" | "FIXED";
  value: number;
  minTotal: number | null;
  startsAt: string | null;
  expiresAt: string | null;
  usageLimit: number | null;
  perClientLimit: number | null;
  isActive: boolean;
  description: string | null;
  showToClients: boolean;
  categories: string[];
  products: ProductRef[];
  clients: Client[];
  createdAt: string;
  _count: { orders: number };
};

type HistoryRow = {
  id: string;
  number: string | null;
  createdAt: string;
  status: string;
  discountAmount: number;
  user: { name: string; company: string | null };
};

type Form = {
  id: string | null;
  name: string;
  code: string;
  type: "PERCENT" | "FIXED";
  value: string;
  minTotal: string;
  products: ProductRef[];
  categories: string[];
  startsAt: string;
  expiresAt: string;
  usageLimit: string;
  perClientLimit: string;
  isActive: boolean;
  description: string;
  audience: Audience;
  clientIds: string[];
};

const emptyForm: Form = {
  id: null,
  name: "",
  code: "",
  type: "PERCENT",
  value: "",
  minTotal: "",
  products: [],
  categories: [],
  startsAt: "",
  expiresAt: "",
  usageLimit: "",
  perClientLimit: "",
  isActive: true,
  description: "",
  audience: "ALL",
  clientIds: [],
};

function generateCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "LUXEL-";
  for (let i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

const day = (iso: string | null) => (iso ? iso.slice(0, 10) : "");
const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";

// showToClients off = hidden; on + no clients = everyone; on + clients =
// only those clients.
function audienceOf(c: PromoCode): Audience {
  if (!c.showToClients) return "NONE";
  return c.clients.length > 0 ? "SELECTED" : "ALL";
}

function statusOf(c: PromoCode): { label: string; cls: string } {
  const now = Date.now();
  if (!c.isActive) return { label: "Вимкнено", cls: "bg-black/[0.06] text-muted" };
  if (c.startsAt && new Date(c.startsAt).getTime() > now) return { label: "Заплановано", cls: "bg-blue-100/80 text-blue-800" };
  if (c.expiresAt && new Date(c.expiresAt).getTime() + 86_400_000 <= now)
    return { label: "Прострочено", cls: "bg-brand/10 text-brand" };
  if (c.usageLimit != null && c._count.orders >= c.usageLimit) return { label: "Ліміт вичерпано", cls: "bg-brand/10 text-brand" };
  return { label: "Включено", cls: "bg-emerald-100/80 text-emerald-800" };
}

function formFrom(c: PromoCode, copy = false): Form {
  return {
    id: copy ? null : c.id,
    name: copy ? `${c.name ?? c.code} (копія)` : c.name ?? "",
    code: copy ? generateCode() : c.code,
    type: c.type,
    value: String(c.value),
    minTotal: c.minTotal ? String(c.minTotal) : "",
    products: c.products,
    categories: c.categories,
    startsAt: day(c.startsAt),
    expiresAt: day(c.expiresAt),
    usageLimit: c.usageLimit ? String(c.usageLimit) : "",
    perClientLimit: c.perClientLimit ? String(c.perClientLimit) : "",
    isActive: copy ? false : c.isActive,
    description: c.description ?? "",
    audience: audienceOf(c),
    clientIds: c.clients.map((x) => x.id),
  };
}

type Audience = "NONE" | "ALL" | "SELECTED";

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


function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="grid sm:grid-cols-[13rem_1fr] gap-x-6 gap-y-1.5 py-4 border-t border-black/[0.05] first:border-t-0">
      <div className="sm:pt-2.5">
        <span className="block text-sm font-medium text-ink">{label}</span>
        {hint && <span className="block text-xs text-muted mt-0.5">{hint}</span>}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function ProductPicker({
  value,
  all,
  onChange,
}: {
  value: ProductRef[];
  all: ProductRef[];
  onChange: (v: ProductRef[]) => void;
}) {
  const [q, setQ] = useState("");
  const chosen = new Set(value.map((p) => p.id));
  const hits = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (t.length < 2) return [];
    const words = t.split(/\s+/);
    return all.filter((p) => !chosen.has(p.id) && words.every((w) => p.name.toLowerCase().includes(w))).slice(0, 12);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, all, value]);
  return (
    <div>
      <div className="relative">
        <MagnifyingGlass size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Почніть вводити назву або артикул" className={`${inputCls} pl-10`} />
        {hits.length > 0 && (
          <ul className="absolute z-10 left-0 right-0 mt-1 rounded-2xl bg-white shadow-lg ring-1 ring-black/5 max-h-72 overflow-y-auto py-1">
            {hits.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => {
                    onChange([...value, p]);
                    setQ("");
                  }}
                  className="w-full text-left px-4 py-2 text-sm text-ink hover:bg-black/[0.04]"
                >
                  {p.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {value.length > 0 && (
        <ul className="mt-2 rounded-2xl bg-white/60 ring-1 ring-white p-2 max-h-56 overflow-y-auto">
          {value.map((p) => (
            <li key={p.id} className="flex items-center gap-2 px-2 py-1 text-sm text-ink">
              <button type="button" onClick={() => onChange(value.filter((x) => x.id !== p.id))} aria-label={`Прибрати ${p.name}`} className="text-muted hover:text-brand">
                <MinusCircle size={16} weight="fill" />
              </button>
              <span className="truncate">{p.name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const CATEGORY_TREE = getCategoryTree();

function CategoryPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const set = new Set(value);
  const toggle = (cats: string[], on: boolean) => {
    const next = new Set(value);
    for (const c of cats) {
      if (on) next.add(c);
      else next.delete(c);
    }
    onChange([...next]);
  };
  return (
    <div>
      <button type="button" onClick={() => setOpen((v) => !v)} className={`${inputCls} text-left text-muted`}>
        {value.length ? `Обрано категорій: ${value.length}` : "Оберіть категорії"}
      </button>
      {value.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {value.map((c) => (
            <span key={c} className="inline-flex items-center gap-1 h-7 rounded-full bg-ink/[0.06] pl-3 pr-1 text-xs text-ink">
              {c}
              <button type="button" onClick={() => toggle([c], false)} aria-label={`Прибрати ${c}`} className="w-5 h-5 inline-flex items-center justify-center rounded-full hover:bg-white">
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      {open && (
        <div className="mt-2 rounded-2xl bg-white/80 ring-1 ring-white p-3 max-h-80 overflow-y-auto space-y-3">
          {CATEGORY_TREE.map((g) => {
            const all = g.categories.every((c) => set.has(c));
            return (
              <div key={g.key}>
                <label className="flex items-center gap-2 text-sm font-semibold text-ink">
                  <input type="checkbox" checked={all} onChange={(e) => toggle(g.categories, e.target.checked)} />
                  {g.label}
                </label>
                <div className="mt-1 ml-6 grid sm:grid-cols-2 gap-x-4 gap-y-1">
                  {g.categories.map((c) => (
                    <label key={c} className="flex items-center gap-2 text-sm text-ink/80">
                      <input type="checkbox" checked={set.has(c)} onChange={(e) => toggle([c], e.target.checked)} />
                      {c}
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function AdminPromoCodesPage() {
  const [codes, setCodes] = useState<PromoCode[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [products, setProducts] = useState<ProductRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<Form | null>(null);
  const [tab, setTab] = useState<"main" | "history">("main");
  const [history, setHistory] = useState<HistoryRow[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  async function load() {
    const [res, cRes] = await Promise.all([fetch("/api/admin/promocodes"), fetch("/api/admin/clients")]);
    setCodes(res.ok ? await res.json() : []);
    if (cRes.ok) setClients(await cRes.json());
    setLoading(false);
  }

  useEffect(() => {
    load();
    fetch("/api/products")
      .then((r) => (r.ok ? r.json() : []))
      .then((list: ProductRef[]) => setProducts(list.map((p) => ({ id: p.id, name: p.name }))))
      .catch(() => {});
  }, []);

  function open(f: Form) {
    setForm(f);
    setTab("main");
    setHistory(null);
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function openHistory() {
    setTab("history");
    if (!form?.id) return;
    const res = await fetch(`/api/admin/promocodes/${form.id}/history`);
    setHistory(res.ok ? await res.json() : []);
  }

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));

  async function save() {
    if (!form) return;
    setSaving(true);
    setError("");
    const body = {
      name: form.name,
      code: form.code,
      type: form.type,
      value: form.value,
      minTotal: form.minTotal,
      productIds: form.products.map((p) => p.id),
      categories: form.categories,
      startsAt: form.startsAt || null,
      expiresAt: form.expiresAt || null,
      usageLimit: form.usageLimit,
      perClientLimit: form.perClientLimit,
      isActive: form.isActive,
      description: form.description,
      showToClients: form.audience !== "NONE" && !(form.audience === "SELECTED" && form.clientIds.length === 0),
      clientIds: form.audience === "SELECTED" ? form.clientIds : [],
    };
    const res = await fetch(form.id ? `/api/admin/promocodes/${form.id}` : "/api/admin/promocodes", {
      method: form.id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      setError(e.error || "Не вдалося зберегти");
      return;
    }
    setForm(null);
    load();
  }

  async function removeSelected() {
    if (selected.size === 0 || !confirm(`Видалити промокоди: ${selected.size}?`)) return;
    await Promise.all([...selected].map((id) => fetch(`/api/admin/promocodes/${id}`, { method: "DELETE" })));
    setSelected(new Set());
    load();
  }

  function copySelected() {
    const first = codes.find((c) => selected.has(c.id));
    if (first) open(formFrom(first, true));
  }

  const toggleSel = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const iconBtn = "w-11 h-11 rounded-full inline-flex items-center justify-center transition-transform duration-300 ease-fluid active:scale-95 disabled:opacity-40";

  return (
    <div className="min-h-[100dvh] flex flex-col">
      <Navbar />
      <main className="max-w-5xl mx-auto w-full px-4 sm:px-6 pt-8 sm:pt-14 pb-24 flex-1">
        <header className="flex items-end justify-between gap-4 flex-wrap mb-8">
          <div>
            <h1 className="text-[40px] leading-[0.95] sm:text-5xl font-semibold tracking-[-0.045em] text-ink">Промокоди</h1>
            <p className="mt-3 text-base text-muted max-w-[60ch]">
              Знижка на все замовлення або лише на обрані товари й категорії. Видані клієнтам коди з&apos;являються в їхньому меню і в кошику.
            </p>
          </div>
          {!form && (
            <div className="flex gap-2">
              <button onClick={() => open({ ...emptyForm, code: generateCode() })} aria-label="Додати промокод" title="Додати" className={`${iconBtn} bg-ink text-white`}>
                <Plus size={18} weight="bold" />
              </button>
              <button onClick={copySelected} disabled={selected.size === 0} aria-label="Копіювати обраний" title="Копіювати обраний" className={`${iconBtn} bg-white/80 ring-1 ring-white text-ink`}>
                <Copy size={18} />
              </button>
              <button onClick={removeSelected} disabled={selected.size === 0} aria-label="Видалити обрані" title="Видалити обрані" className={`${iconBtn} bg-brand text-white`}>
                <Trash size={18} />
              </button>
            </div>
          )}
        </header>

        {form && (
          <div className="reveal rounded-[1.75rem] glass-tray p-1.5 mb-8">
            <div className="rounded-[calc(1.75rem-0.375rem)] glass-card p-5 sm:p-6">
              <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
                <button onClick={() => setForm(null)} className="inline-flex items-center gap-2 text-sm text-muted hover:text-ink">
                  <ArrowLeft size={16} /> До списку
                </button>
                <div className="flex gap-1 rounded-full bg-black/[0.05] p-1">
                  {(["main", "history"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => (t === "history" ? openHistory() : setTab("main"))}
                      disabled={t === "history" && !form.id}
                      className={`h-9 rounded-full px-4 text-sm font-medium disabled:opacity-40 ${tab === t ? "bg-white text-ink shadow-sm" : "text-muted"}`}
                    >
                      {t === "main" ? "Загальні" : "Історія"}
                    </button>
                  ))}
                </div>
              </div>

              {tab === "main" ? (
                <div>
                  <Row label="Назва" hint="Для вас; клієнт бачить код і опис">
                    <input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Premium -20%" className={inputCls} />
                  </Row>
                  <Row label="Код" hint="Те, що вводить клієнт">
                    <div className="flex gap-2">
                      <input value={form.code} onChange={(e) => set("code", e.target.value.toUpperCase().replace(/\s/g, ""))} className={`${inputCls} font-mono`} />
                      <button type="button" onClick={() => set("code", generateCode())} aria-label="Згенерувати код" className="shrink-0 w-11 h-11 rounded-2xl bg-white/80 ring-1 ring-white inline-flex items-center justify-center text-ink">
                        <Sparkle size={18} weight="light" />
                      </button>
                    </div>
                  </Row>
                  <Row label="Знижка">
                    <div className="grid grid-cols-[1fr_9rem] gap-2">
                      <select value={form.type} onChange={(e) => set("type", e.target.value as Form["type"])} className={inputCls}>
                        <option value="PERCENT">Відсоток</option>
                        <option value="FIXED">Фіксована сума, ₴</option>
                      </select>
                      <input type="number" min="0" value={form.value} onChange={(e) => set("value", e.target.value)} placeholder={form.type === "PERCENT" ? "%" : "₴"} className={inputCls} />
                    </div>
                  </Row>
                  <Row label="Мінімальна сума" hint="Сума замовлення, від якої діє код. Порожньо = будь-яка">
                    <input type="number" min="0" value={form.minTotal} onChange={(e) => set("minTotal", e.target.value)} placeholder="₴" className={inputCls} />
                  </Row>
                  <Row label="Товари" hint="Знижка лише на ці товари. Порожньо разом з категоріями = на все замовлення">
                    <ProductPicker value={form.products} all={products} onChange={(v) => set("products", v)} />
                  </Row>
                  <Row label="Категорії" hint="Знижка на всі товари цих категорій">
                    <CategoryPicker value={form.categories} onChange={(v) => set("categories", v)} />
                  </Row>
                  <Row label="Дата початку">
                    <input type="date" value={form.startsAt} onChange={(e) => set("startsAt", e.target.value)} className={inputCls} />
                  </Row>
                  <Row label="Дата завершення" hint="Діє до кінця цього дня">
                    <input type="date" value={form.expiresAt} onChange={(e) => set("expiresAt", e.target.value)} className={inputCls} />
                  </Row>
                  <Row label="Кількість застосувань купона" hint="Усього замовлень з кодом. Порожньо або 0 = без ліміту">
                    <input type="number" min="0" value={form.usageLimit} onChange={(e) => set("usageLimit", e.target.value)} className={inputCls} />
                  </Row>
                  <Row label="Кількість застосувань одним клієнтом" hint="Порожньо або 0 = без ліміту">
                    <input type="number" min="0" value={form.perClientLimit} onChange={(e) => set("perClientLimit", e.target.value)} className={inputCls} />
                  </Row>
                  <Row label="Опис для клієнта">
                    <textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={2} placeholder="Наприклад: -20% на лампи Premium до кінця жовтня" className={`${inputCls} h-auto py-3`} />
                  </Row>
                  <Row label="Кому видати" hint="Хто бачить код у своєму кабінеті">
                    <AudiencePicker audience={form.audience} clientIds={form.clientIds} clients={clients} onChange={(a, ids) => setForm((f) => (f ? { ...f, audience: a, clientIds: ids } : f))} />
                  </Row>
                  <Row label="Статус">
                    <select value={form.isActive ? "1" : "0"} onChange={(e) => set("isActive", e.target.value === "1")} className={inputCls}>
                      <option value="1">Включено</option>
                      <option value="0">Вимкнено</option>
                    </select>
                  </Row>
                  {error && <p className="text-sm text-brand mt-2">{error}</p>}
                  <div className="flex gap-2 mt-4">
                    <button onClick={save} disabled={saving} className="h-11 rounded-full bg-brand px-6 text-sm font-semibold text-white disabled:opacity-40">
                      {saving ? "Збереження..." : "Зберегти"}
                    </button>
                    <button onClick={() => setForm(null)} className="h-11 rounded-full px-5 text-sm font-medium text-ink bg-white/70 ring-1 ring-white">
                      Скасувати
                    </button>
                  </div>
                </div>
              ) : history === null ? (
                <p className="text-sm text-muted">Завантаження...</p>
              ) : history.length === 0 ? (
                <p className="text-sm text-muted">З цим кодом ще не було замовлень.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-muted">
                      <th className="text-left font-medium py-2">Замовлення</th>
                      <th className="text-left font-medium py-2">Клієнт</th>
                      <th className="text-right font-medium py-2">Знижка</th>
                      <th className="text-right font-medium py-2">Дата</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((h) => (
                      <tr key={h.id} className={`border-t border-black/[0.05] ${h.status === "CANCELLED" ? "opacity-50" : ""}`}>
                        <td className="py-2 tabular">№ {h.number ?? h.id.slice(-6)}</td>
                        <td className="py-2">{h.user.company || h.user.name}</td>
                        <td className="py-2 text-right tabular">{h.discountAmount.toLocaleString("uk-UA")} ₴</td>
                        <td className="py-2 text-right tabular">{fmt(h.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {loading ? (
          <p className="text-sm text-muted">Завантаження...</p>
        ) : codes.length === 0 ? (
          <p className="text-sm text-muted">Промокодів ще немає.</p>
        ) : (
          <div className="rounded-[1.75rem] glass-tray p-1.5">
            <div className="rounded-[calc(1.75rem-0.375rem)] glass-card overflow-x-auto">
              <table className="w-full text-sm min-w-[720px]">
                <thead>
                  <tr className="text-xs text-muted">
                    <th className="w-10 py-3 pl-4"></th>
                    <th className="text-left font-medium py-3 px-2">Назва</th>
                    <th className="text-left font-medium py-3 px-2">Код</th>
                    <th className="text-right font-medium py-3 px-2">Знижка</th>
                    <th className="text-left font-medium py-3 px-2">Діє на</th>
                    <th className="text-left font-medium py-3 px-2">Період</th>
                    <th className="text-right font-medium py-3 px-2">Використано</th>
                    <th className="text-left font-medium py-3 px-2">Статус</th>
                    <th className="py-3 pr-4"></th>
                  </tr>
                </thead>
                <tbody>
                  {codes.map((c) => {
                    const st = statusOf(c);
                    const scope =
                      c.products.length || c.categories.length
                        ? [c.categories.length ? `${c.categories.length} кат.` : "", c.products.length ? `${c.products.length} тов.` : ""].filter(Boolean).join(", ")
                        : "усе замовлення";
                    const aud = audienceOf(c);
                    return (
                      <tr key={c.id} className="border-t border-black/[0.05] align-top">
                        <td className="py-3 pl-4">
                          <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleSel(c.id)} aria-label={`Обрати ${c.code}`} />
                        </td>
                        <td className="py-3 px-2">
                          <span className="block text-ink font-medium">{c.name || c.code}</span>
                          <span className="mt-0.5 text-xs text-muted flex items-center gap-1">
                            {aud === "ALL" ? <UsersThree size={12} /> : aud === "SELECTED" ? <Users size={12} /> : <EyeSlash size={12} />}
                            {aud === "ALL" ? "усім" : aud === "SELECTED" ? `${c.clients.length} клієнтам` : "прихований"}
                          </span>
                        </td>
                        <td className="py-3 px-2 font-mono text-ink">{c.code}</td>
                        <td className="py-3 px-2 text-right tabular text-ink">
                          {c.type === "PERCENT" ? `${c.value}%` : `${c.value.toLocaleString("uk-UA")} ₴`}
                          {c.minTotal ? <span className="block text-xs text-muted">від {c.minTotal.toLocaleString("uk-UA")} ₴</span> : null}
                        </td>
                        <td className="py-3 px-2 text-xs text-ink/80">{scope}</td>
                        <td className="py-3 px-2 text-xs tabular text-ink/80 whitespace-nowrap">
                          {c.startsAt || c.expiresAt
                            ? `${c.startsAt ? fmt(c.startsAt) : "…"} – ${c.expiresAt ? fmt(c.expiresAt) : "…"}`
                            : "без обмежень"}
                        </td>
                        <td className="py-3 px-2 text-right text-xs tabular text-ink/80">
                          {c._count.orders}
                          {c.usageLimit != null ? ` / ${c.usageLimit}` : ""}
                        </td>
                        <td className="py-3 px-2">
                          <span className={`h-6 inline-flex items-center rounded-full px-2.5 text-xs font-medium whitespace-nowrap ${st.cls}`}>{st.label}</span>
                        </td>
                        <td className="py-3 pr-4 text-right">
                          <button onClick={() => open(formFrom(c))} aria-label={`Редагувати ${c.code}`} className="w-9 h-9 rounded-full bg-ink text-white inline-flex items-center justify-center">
                            <PencilSimple size={16} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {!loading && codes.length > 0 && (
          <p className="mt-3 text-xs text-muted inline-flex items-center gap-1">
            <Check size={12} /> Позначте рядок, щоб скопіювати або видалити промокод.
          </p>
        )}
      </main>
    </div>
  );
}
