"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Camera, Check, MagnifyingGlass, Package, Plus, Receipt, Trash, Trophy, X } from "@phosphor-icons/react";
import { kyivDateTime, money } from "@/lib/adminOrders";

type Kind = "PHOTO" | "ORDER_PRODUCTS" | "ORDER_TOTAL";
type Task = {
  id: string;
  title: string;
  description: string | null;
  kind: Kind;
  products: { id: string; name: string }[];
  minQty: number;
  minTotal: number | null;
  startsAt: string | null;
  endsAt: string | null;
  isActive: boolean;
  autoApprove: boolean;
  maxPerClient: number;
  rewardTemplate: { id: string; code: string; name: string | null } | null;
  rewardValidDays: number | null;
  reward: string;
  stats: { submitted: number; approved: number; rejected: number };
};
type Template = { id: string; code: string; name: string | null; text: string };
type Entry = {
  id: string;
  status: "SUBMITTED" | "APPROVED" | "REJECTED";
  comment: string | null;
  adminComment: string | null;
  orderId: string | null;
  createdAt: string;
  reviewedAt: string | null;
  challenge: { id: string; title: string; kind: Kind };
  user: { id: string; name: string; company: string | null; phone: string | null };
  photos: { id: string }[];
  promoCode: { code: string; orders: { id: string }[] } | null;
};

const KIND: Record<Kind, { label: string; hint: string; icon: typeof Camera }> = {
  PHOTO: { label: "Фото викладки", hint: "Клієнт надсилає фото, ви перевіряєте", icon: Camera },
  ORDER_PRODUCTS: { label: "Замовити товари", hint: "Усі вибрані товари в одному замовленні", icon: Package },
  ORDER_TOTAL: { label: "Замовлення на суму", hint: "Одне замовлення від вказаної суми", icon: Receipt },
};

type Form = {
  id: string | null;
  title: string;
  description: string;
  kind: Kind;
  products: { id: string; name: string }[];
  minQty: string;
  minTotal: string;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
  autoApprove: boolean;
  maxPerClient: string;
  rewardTemplateId: string;
  rewardValidDays: string;
};
const emptyForm: Form = {
  id: null,
  title: "",
  description: "",
  kind: "PHOTO",
  products: [],
  minQty: "1",
  minTotal: "",
  startsAt: "",
  endsAt: "",
  isActive: true,
  autoApprove: false,
  maxPerClient: "1",
  rewardTemplateId: "",
  rewardValidDays: "30",
};
const day = (s: string | null) => (s ? s.slice(0, 10) : "");
const date = (s: string | null) => (s ? new Date(s).toLocaleDateString("uk-UA") : "");

// KPI tasks for clients: what to do, what they get, and moderation of the
// photos clients send. The reward is a promo code template (Промокоди →
// «Нагорода за завдання»); each approved entry gets a personal code from it.
export default function AdminTasksPage() {
  const [tab, setTab] = useState<"review" | "tasks" | "rewards">("review");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [form, setForm] = useState<Form | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [t, e] = await Promise.all([fetch("/api/admin/tasks"), fetch("/api/admin/tasks/entries")]);
    if (t.ok) {
      const d = await t.json();
      setTasks(d.tasks);
      setTemplates(d.templates);
    }
    if (e.ok) setEntries(await e.json());
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const pending = entries.filter((e) => e.status === "SUBMITTED");
  const rewards = entries.filter((e) => e.status !== "SUBMITTED");

  async function save() {
    if (!form) return;
    setSaving(true);
    setError("");
    const body = {
      title: form.title,
      description: form.description,
      kind: form.kind,
      productIds: form.kind === "ORDER_TOTAL" ? [] : form.products.map((p) => p.id),
      minQty: form.minQty,
      minTotal: form.kind === "ORDER_TOTAL" ? form.minTotal : null,
      startsAt: form.startsAt || null,
      endsAt: form.endsAt || null,
      isActive: form.isActive,
      autoApprove: form.kind !== "PHOTO" && form.autoApprove,
      maxPerClient: form.maxPerClient,
      rewardTemplateId: form.rewardTemplateId || null,
      rewardValidDays: form.rewardValidDays || null,
    };
    const res = await fetch(form.id ? `/api/admin/tasks/${form.id}` : "/api/admin/tasks", {
      method: form.id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error || "Не вдалося зберегти");
      return;
    }
    setForm(null);
    setTab("tasks");
    load();
  }

  async function remove(t: Task) {
    if (!confirm(`Видалити завдання «${t.title}»? Уже видані промокоди залишаться у клієнтів.`)) return;
    await fetch(`/api/admin/tasks/${t.id}`, { method: "DELETE" });
    load();
  }

  async function toggle(t: Task) {
    await fetch(`/api/admin/tasks/${t.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !t.isActive }),
    });
    load();
  }

  return (
    <main className="w-full max-w-6xl mx-auto px-4 sm:px-6 py-6 flex-1">
      <div className="flex flex-wrap items-end gap-3 mb-5">
        <div className="flex-1 min-w-[14rem]">
          <h1 className="text-2xl font-semibold tracking-tight">Завдання для клієнтів</h1>
          <p className="text-sm text-slate-500 max-w-2xl">
            Клієнт бачить завдання у своєму кабінеті. Виконав (фото викладки, потрібне замовлення) — після перевірки отримує
            персональний промокод. Промокод-нагороду спершу створіть у «Промокодах» з варіантом «Нагорода за завдання».
          </p>
        </div>
        <button
          type="button"
          onClick={() => setForm({ ...emptyForm, rewardTemplateId: templates[0]?.id ?? "" })}
          className="h-10 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white"
        >
          <Plus size={16} /> Нове завдання
        </button>
      </div>

      <div className="flex gap-1.5 mb-4" role="tablist">
        {(
          [
            ["review", `На перевірці`, pending.length],
            ["tasks", "Завдання", tasks.length],
            ["rewards", "Історія", rewards.length],
          ] as const
        ).map(([k, label, n]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={`h-9 inline-flex items-center gap-2 rounded-full px-4 text-sm ${tab === k ? "bg-slate-900 text-white" : "bg-white ring-1 ring-slate-200 text-slate-700 hover:bg-slate-50"}`}
          >
            {label}
            <span className={`tabular text-xs ${k === "review" && n ? "rounded-full bg-brand text-white px-1.5" : tab === k ? "text-white/70" : "text-slate-500"}`}>{n}</span>
          </button>
        ))}
      </div>

      {tab === "review" && (
        <section className="space-y-3">
          {pending.length === 0 && (
            <p className="rounded-xl bg-white ring-1 ring-slate-200 px-4 py-10 text-center text-sm text-slate-500">
              Нових заявок немає.
            </p>
          )}
          {pending.map((e) => (
            <ReviewCard key={e.id} entry={e} onDone={load} />
          ))}
        </section>
      )}

      {tab === "tasks" && (
        <section className="grid md:grid-cols-2 gap-3">
          {tasks.length === 0 && (
            <p className="md:col-span-2 rounded-xl bg-white ring-1 ring-slate-200 px-4 py-10 text-center text-sm text-slate-500">
              Завдань ще немає. Натисніть «Нове завдання».
            </p>
          )}
          {tasks.map((t) => {
            const K = KIND[t.kind];
            return (
              <article key={t.id} className={`rounded-xl bg-white ring-1 p-4 ${t.isActive ? "ring-slate-200" : "ring-slate-200 opacity-60"}`}>
                <div className="flex items-start gap-3">
                  <span className="h-10 w-10 shrink-0 rounded-lg bg-slate-100 inline-flex items-center justify-center text-slate-700">
                    <K.icon size={20} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-slate-500">{K.label}</p>
                    <h3 className="font-semibold leading-snug">{t.title}</h3>
                    <p className="text-sm text-emerald-700 mt-0.5">{t.reward || <span className="text-red-600">Нагороду не вибрано</span>}</p>
                    <p className="text-xs text-slate-500 mt-1">
                      {t.kind === "ORDER_TOTAL"
                        ? `Замовлення від ${money(t.minTotal ?? 0)}`
                        : t.kind === "ORDER_PRODUCTS"
                          ? `${t.products.length} товарів${t.minQty > 1 ? `, по ${t.minQty} шт` : ""}`
                          : t.products.length
                            ? `Товари на фото: ${t.products.length}`
                            : "Фото за описом"}
                      {" · "}
                      {t.startsAt || t.endsAt ? `${date(t.startsAt) || "…"} – ${date(t.endsAt) || "…"}` : "без терміну"}
                      {t.maxPerClient > 1 ? ` · до ${t.maxPerClient} разів` : ""}
                      {t.autoApprove ? " · код одразу" : ""}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      Виконали: {t.stats.approved} · на перевірці: {t.stats.submitted} · відхилено: {t.stats.rejected}
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" onClick={() => setForm(formFrom(t))} className="h-8 rounded-md border border-slate-300 px-3 text-sm hover:bg-slate-50">
                    Змінити
                  </button>
                  <button type="button" onClick={() => toggle(t)} className="h-8 rounded-md border border-slate-300 px-3 text-sm hover:bg-slate-50">
                    {t.isActive ? "Вимкнути" : "Увімкнути"}
                  </button>
                  <button type="button" onClick={() => remove(t)} aria-label={`Видалити ${t.title}`} className="h-8 w-8 inline-flex items-center justify-center rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50">
                    <Trash size={16} />
                  </button>
                </div>
              </article>
            );
          })}
        </section>
      )}

      {tab === "rewards" && (
        <section className="rounded-xl bg-white ring-1 ring-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="text-left font-medium px-3 py-2">Клієнт</th>
                <th className="text-left font-medium px-3 py-2">Завдання</th>
                <th className="text-left font-medium px-3 py-2">Результат</th>
                <th className="text-left font-medium px-3 py-2">Коли</th>
              </tr>
            </thead>
            <tbody>
              {rewards.map((e) => (
                <tr key={e.id} className="border-t border-slate-100">
                  <td className="px-3 py-2">{e.user.company || e.user.name}</td>
                  <td className="px-3 py-2">{e.challenge.title}</td>
                  <td className="px-3 py-2">
                    {e.status === "APPROVED" ? (
                      <span className="text-emerald-700">
                        {e.promoCode ? (
                          <>
                            код <span className="font-mono">{e.promoCode.code}</span>
                            {e.promoCode.orders.length ? " · використано" : " · ще не використано"}
                          </>
                        ) : (
                          "зараховано (без коду)"
                        )}
                      </span>
                    ) : (
                      <span className="text-slate-500">відхилено{e.adminComment ? `: ${e.adminComment}` : ""}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-500 tabular">{kyivDateTime(e.reviewedAt ?? e.createdAt)}</td>
                </tr>
              ))}
              {rewards.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-8 text-center text-slate-500">
                    Поки порожньо.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      )}

      {form && (
        <Editor form={form} setForm={setForm} templates={templates} saving={saving} error={error} onSave={save} onClose={() => setForm(null)} />
      )}
    </main>
  );
}

function formFrom(t: Task): Form {
  return {
    id: t.id,
    title: t.title,
    description: t.description ?? "",
    kind: t.kind,
    products: t.products,
    minQty: String(t.minQty),
    minTotal: t.minTotal ? String(t.minTotal) : "",
    startsAt: day(t.startsAt),
    endsAt: day(t.endsAt),
    isActive: t.isActive,
    autoApprove: t.autoApprove,
    maxPerClient: String(t.maxPerClient),
    rewardTemplateId: t.rewardTemplate?.id ?? "",
    rewardValidDays: t.rewardValidDays ? String(t.rewardValidDays) : "",
  };
}

function ReviewCard({ entry: e, onDone }: { entry: Entry; onDone: () => void }) {
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function act(action: "approve" | "reject") {
    if (action === "reject" && !comment.trim()) {
      setError("Напишіть клієнту, чому відхилено");
      return;
    }
    setBusy(true);
    const res = await fetch(`/api/admin/tasks/entries/${e.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, adminComment: comment }),
    });
    setBusy(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error || "Помилка");
      return;
    }
    onDone();
  }
  return (
    <article className="rounded-xl bg-white ring-1 ring-slate-200 p-4">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <h3 className="font-semibold">{e.user.company || e.user.name}</h3>
        <span className="text-sm text-slate-600">{e.challenge.title}</span>
        <span className="ml-auto text-xs text-slate-500 tabular">{kyivDateTime(e.createdAt)}</span>
      </div>
      {e.comment && <p className="text-sm text-slate-700 mt-1">«{e.comment}»</p>}
      {e.photos.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {e.photos.map((p) => (
            <a key={p.id} href={`/api/tasks/photo/${p.id}`} target="_blank" rel="noreferrer" className="block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/tasks/photo/${p.id}`} alt="Фото від клієнта" className="h-32 w-32 object-cover rounded-lg ring-1 ring-slate-200" />
            </a>
          ))}
        </div>
      )}
      {e.orderId && (
        <Link href={`/admin/orders?open=${e.orderId}`} className="mt-2 inline-block text-sm text-blue-700 underline underline-offset-2">
          Відкрити замовлення
        </Link>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          value={comment}
          onChange={(ev) => setComment(ev.target.value)}
          placeholder="Коментар клієнту (обов'язково при відхиленні)"
          className="flex-1 min-w-[14rem] h-9 rounded-md border border-slate-300 px-3 text-sm"
        />
        <button type="button" disabled={busy} onClick={() => act("approve")} className="h-9 inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 text-sm font-medium text-white disabled:opacity-50">
          <Check size={16} /> Зарахувати і видати код
        </button>
        <button type="button" disabled={busy} onClick={() => act("reject")} className="h-9 inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3 text-sm disabled:opacity-50">
          <X size={16} /> Відхилити
        </button>
      </div>
      {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
    </article>
  );
}

function Editor({
  form,
  setForm,
  templates,
  saving,
  error,
  onSave,
  onClose,
}: {
  form: Form;
  setForm: (f: Form | null) => void;
  templates: Template[];
  saving: boolean;
  error: string;
  onSave: () => void;
  onClose: () => void;
}) {
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm({ ...form, [k]: v });
  const [catalog, setCatalog] = useState<{ id: string; name: string }[] | null>(null);
  const [q, setQ] = useState("");
  useEffect(() => {
    fetch("/api/products")
      .then((r) => r.json())
      .then((d: { id: string; name: string; isActive: boolean }[]) => setCatalog(d.filter((p) => p.isActive)))
      .catch(() => setCatalog([]));
  }, []);
  const found = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!catalog || !words.length) return [];
    return catalog.filter((p) => words.every((w) => p.name.toLowerCase().includes(w)) && !form.products.some((x) => x.id === p.id)).slice(0, 8);
  }, [catalog, q, form.products]);

  const field = "w-full h-10 rounded-lg border border-slate-300 px-3 text-sm";
  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="Завдання">
      <button type="button" aria-label="Закрити" className="absolute inset-0 bg-slate-900/40" onClick={onClose} />
      <section className="relative h-full w-full max-w-xl bg-white shadow-2xl flex flex-col">
        <header className="flex items-center gap-2 px-5 py-4 border-b border-slate-200">
          <Trophy size={18} />
          <h2 className="font-semibold flex-1">{form.id ? "Змінити завдання" : "Нове завдання"}</h2>
          <button type="button" onClick={onClose} aria-label="Закрити" className="h-9 w-9 inline-flex items-center justify-center rounded-lg hover:bg-slate-100">
            <X size={18} />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(KIND) as Kind[]).map((k) => {
              const K = KIND[k];
              return (
                <button
                  key={k}
                  type="button"
                  aria-pressed={form.kind === k}
                  onClick={() => set("kind", k)}
                  className={`rounded-lg p-3 text-left ring-1 ${form.kind === k ? "ring-2 ring-slate-900 bg-slate-50" : "ring-slate-200 hover:bg-slate-50"}`}
                >
                  <K.icon size={18} />
                  <p className="text-sm font-medium mt-1">{K.label}</p>
                  <p className="text-[11px] text-slate-500 leading-snug">{K.hint}</p>
                </button>
              );
            })}
          </div>
          <label className="block">
            <span className="text-xs font-medium text-slate-600">Назва (бачить клієнт)</span>
            <input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="Наприклад: Викладка JAZZ на полиці" className={`mt-1 ${field}`} />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-600">Що зробити</span>
            <textarea
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              rows={3}
              placeholder={form.kind === "PHOTO" ? "Сфотографуйте полицю з розетками JAZZ: видно ціни і щонайменше 10 позицій" : "Опис для клієнта"}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>

          {form.kind === "ORDER_TOTAL" ? (
            <label className="block">
              <span className="text-xs font-medium text-slate-600">Сума замовлення від, ₴</span>
              <input type="number" min={1} value={form.minTotal} onChange={(e) => set("minTotal", e.target.value)} className={`mt-1 ${field}`} />
            </label>
          ) : (
            <div>
              <span className="text-xs font-medium text-slate-600">
                {form.kind === "PHOTO" ? "Товари на фото (необов'язково)" : "Товари, які треба замовити разом"}
              </span>
              <ul className="mt-1 space-y-1">
                {form.products.map((p) => (
                  <li key={p.id} className="flex items-center gap-2 rounded-md bg-slate-50 px-2 py-1.5 text-sm">
                    <span className="flex-1 min-w-0 truncate" title={p.name}>{p.name}</span>
                    <button type="button" onClick={() => set("products", form.products.filter((x) => x.id !== p.id))} aria-label="Прибрати" className="text-slate-400 hover:text-red-600">
                      <X size={14} />
                    </button>
                  </li>
                ))}
              </ul>
              <div className="relative mt-1">
                <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Додати товар: назва або артикул" className={`${field} pl-9`} />
                {found.length > 0 && (
                  <ul className="absolute z-10 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg max-h-64 overflow-y-auto">
                    {found.map((p) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          onClick={() => {
                            set("products", [...form.products, p]);
                            setQ("");
                          }}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 truncate"
                        >
                          {p.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {form.kind === "ORDER_PRODUCTS" && (
                <label className="mt-2 flex items-center gap-2 text-sm">
                  Кожного товару щонайменше
                  <input type="number" min={1} value={form.minQty} onChange={(e) => set("minQty", e.target.value)} className="h-9 w-20 rounded-md border border-slate-300 px-2" />
                  шт
                </label>
              )}
            </div>
          )}

          <div className="rounded-lg bg-emerald-50/60 ring-1 ring-emerald-100 p-3 space-y-2">
            <span className="text-xs font-medium text-slate-600">Нагорода</span>
            {templates.length === 0 ? (
              <p className="text-sm text-slate-700">
                Немає шаблонів. Створіть промокод у{" "}
                <Link href="/admin/promocodes" className="underline">
                  Промокодах
                </Link>{" "}
                з варіантом «Нагорода за завдання» — з нього клієнтам видаватимуться персональні коди.
              </p>
            ) : (
              <select value={form.rewardTemplateId} onChange={(e) => set("rewardTemplateId", e.target.value)} className={`${field} bg-white`}>
                <option value="">— без промокоду —</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name || t.code}: {t.text}
                  </option>
                ))}
              </select>
            )}
            <label className="flex items-center gap-2 text-sm">
              Код діє
              <input type="number" min={1} value={form.rewardValidDays} onChange={(e) => set("rewardValidDays", e.target.value)} className="h-9 w-20 rounded-md border border-slate-300 bg-white px-2" />
              днів після видачі
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-medium text-slate-600">Діє з</span>
              <input type="date" value={form.startsAt} onChange={(e) => set("startsAt", e.target.value)} className={`mt-1 ${field}`} />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-600">Діє по</span>
              <input type="date" value={form.endsAt} onChange={(e) => set("endsAt", e.target.value)} className={`mt-1 ${field}`} />
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm">
            Один клієнт може виконати
            <input type="number" min={1} value={form.maxPerClient} onChange={(e) => set("maxPerClient", e.target.value)} className="h-9 w-20 rounded-md border border-slate-300 px-2" />
            раз(и)
          </label>
          {form.kind !== "PHOTO" && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.autoApprove} onChange={(e) => set("autoApprove", e.target.checked)} />
              Видавати код одразу після замовлення, без перевірки
            </label>
          )}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.isActive} onChange={(e) => set("isActive", e.target.checked)} />
            Клієнти бачать завдання
          </label>
        </div>
        <footer className="border-t border-slate-200 px-5 py-3">
          {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
          <button type="button" onClick={onSave} disabled={saving} className="h-10 rounded-lg bg-slate-900 px-5 text-sm font-semibold text-white disabled:opacity-40">
            {saving ? "Зберігаю…" : "Зберегти"}
          </button>
        </footer>
      </section>
    </div>
  );
}
