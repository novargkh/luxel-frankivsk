"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  Camera,
  CheckCircle,
  Clock,
  Gift,
  Image as ImageIcon,
  ShoppingBag,
  Trophy,
  X,
  XCircle,
} from "@phosphor-icons/react";
import Navbar from "@/components/Navbar";
import { copyText } from "@/components/PromoWallet";
import { useCart } from "@/lib/cart";
import { compressImage } from "@/lib/media";
import { markTasksSeen } from "@/lib/useTasks";

type Entry = {
  id: string;
  status: "SUBMITTED" | "APPROVED" | "REJECTED";
  adminComment: string | null;
  createdAt: string;
  reviewedAt: string | null;
  promoCode: { code: string; expiresAt: string | null } | null;
  _count: { photos: number };
};
type Task = {
  id: string;
  title: string;
  description: string | null;
  kind: "PHOTO" | "ORDER_PRODUCTS" | "ORDER_TOTAL";
  minQty: number;
  minTotal: number | null;
  endsAt: string | null;
  autoApprove: boolean;
  maxPerClient: number;
  reward: string;
  products: { id: string; name: string; price: number; image: string | null; out?: boolean }[];
  entries: Entry[];
  left: number;
  pending: boolean;
};

const MAX_PHOTOS = 5;
const money = (n: number) => `${n.toLocaleString("uk-UA", { maximumFractionDigits: 2 })} ₴`;
const date = (s: string) => new Date(s).toLocaleDateString("uk-UA");

const KIND: Record<Task["kind"], { label: string; icon: typeof Camera }> = {
  PHOTO: { label: "Фото викладки", icon: Camera },
  ORDER_PRODUCTS: { label: "Замовити товари", icon: ShoppingBag },
  ORDER_TOTAL: { label: "Замовлення на суму", icon: ShoppingBag },
};

// Client tasks (KPI): do a task, get a personal promo code after review.
export default function TasksPage() {
  const { data: session } = useSession();
  const userKey = session?.user?.email ?? session?.user?.name ?? "user";
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [error, setError] = useState("");

  const [reload, setReload] = useState(0);
  const load = () => setReload((n) => n + 1);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/tasks");
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || "Не вдалося завантажити завдання");
        if (alive) setTasks(d);
      } catch (e) {
        if (!alive) return;
        setError((e as Error).message);
        setTasks([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, [reload]);
  useEffect(() => {
    if (tasks?.length && session?.user) markTasksSeen(userKey, tasks.map((t) => t.id));
  }, [tasks, session?.user, userKey]);

  const open = tasks?.filter((t) => t.left > 0 || t.pending) ?? [];
  const done = tasks?.filter((t) => t.left === 0 && !t.pending) ?? [];

  return (
    <div className="min-h-[100dvh] flex flex-col">
      <Navbar />
      <main className="max-w-6xl mx-auto w-full px-4 sm:px-6 pt-8 sm:pt-14 pb-28 flex-1">
        <header className="reveal mb-8">
          <h1 className="text-[40px] leading-[0.95] sm:text-5xl font-semibold tracking-[-0.045em] text-ink">Завдання</h1>
          <p className="mt-3 text-base text-muted max-w-[60ch]">
            Виконуйте завдання і отримуйте персональні промокоди. Нагорода з&apos;явиться в меню, у розділі «Вхідні».
          </p>
        </header>

        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

        {tasks === null ? (
          <div className="grid md:grid-cols-2 gap-4">
            {[0, 1].map((i) => (
              <div key={i} className="rounded-[1.75rem] glass-tray p-1.5">
                <div className="rounded-[calc(1.75rem-0.375rem)] glass-card h-56 animate-pulse" />
              </div>
            ))}
          </div>
        ) : tasks.length === 0 ? (
          <div className="rounded-[1.75rem] glass-tray p-1.5">
            <div className="rounded-[calc(1.75rem-0.375rem)] glass-card px-6 py-16 text-center">
              <Trophy size={40} weight="light" className="mx-auto text-muted" />
              <p className="mt-3 text-lg font-medium text-ink">Поки що завдань немає</p>
              <p className="mt-1.5 text-[15px] text-muted">Коли з&apos;явиться нове завдання, ви побачите позначку в меню.</p>
            </div>
          </div>
        ) : (
          <>
            <div className="grid md:grid-cols-2 gap-4 items-start">
              {open.map((t, i) => (
                <TaskCard key={t.id} task={t} index={i} onChange={load} />
              ))}
            </div>
            {done.length > 0 && (
              <section className="mt-10">
                <h2 className="mb-3 px-1 text-sm font-medium text-muted">Виконані</h2>
                <div className="grid md:grid-cols-2 gap-4 items-start">
                  {done.map((t, i) => (
                    <TaskCard key={t.id} task={t} index={i} onChange={load} />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function TaskCard({ task: t, index, onChange }: { task: Task; index: number; onChange: () => void }) {
  const K = KIND[t.kind];
  const last = t.entries[0];
  const approved = t.entries.filter((e) => e.status === "APPROVED");
  const finished = t.left === 0 && !t.pending;

  return (
    <article className="reveal rounded-[1.75rem] glass-tray p-1.5" style={{ ["--i" as string]: index }}>
      <div className="rounded-[calc(1.75rem-0.375rem)] glass-card p-5 sm:p-6">
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <span className="h-6 inline-flex items-center gap-1.5 rounded-full bg-ink/[0.05] px-2.5 font-medium text-ink/75">
            <K.icon size={14} weight="bold" />
            {K.label}
          </span>
          {t.endsAt && <span className="text-muted tabular">до {date(t.endsAt)}</span>}
          {t.pending && (
            <span className="h-6 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 font-medium text-amber-800">
              <Clock size={13} weight="bold" /> На перевірці
            </span>
          )}
          {finished && (
            <span className="h-6 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 font-medium text-emerald-800">
              <CheckCircle size={13} weight="bold" /> Виконано
            </span>
          )}
        </div>

        <h2 className="mt-3 text-xl font-semibold tracking-[-0.02em] text-ink">{t.title}</h2>
        {t.description && <p className="mt-1.5 text-[15px] leading-relaxed text-ink/75 whitespace-pre-line">{t.description}</p>}

        {t.reward && (
          <p className="mt-4 flex items-start gap-2.5 rounded-2xl bg-gradient-to-r from-[#fff4e0] to-[#ffe9f0] px-4 py-3 text-[15px] font-medium text-ink">
            <Gift size={20} weight="fill" className="shrink-0 text-[#e0663a] mt-0.5" />
            <span>
              Нагорода: {t.reward}
              {t.maxPerClient > 1 && (
                <span className="block text-xs font-normal text-muted">
                  Можна виконати до {t.maxPerClient} разів, залишилось {t.left}
                </span>
              )}
            </span>
          </p>
        )}

        {approved.map((e) => (
          <RewardCode key={e.id} entry={e} />
        ))}

        {last?.status === "REJECTED" && !t.pending && (
          <p className="mt-4 flex items-start gap-2 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-800">
            <XCircle size={18} weight="fill" className="shrink-0 mt-0.5" />
            <span>
              Не зараховано{last.adminComment ? `: ${last.adminComment}` : ""}.
              {t.left > 0 && " Можна спробувати ще раз."}
            </span>
          </p>
        )}

        {t.pending && (
          <p className="mt-4 text-sm text-muted">
            {t.kind === "PHOTO" ? "Фото надіслано" : "Замовлення зараховано"} {date(last.createdAt)}. Менеджер перевірить і
            видасть промокод.
          </p>
        )}

        {!finished && !t.pending && t.kind === "PHOTO" && <PhotoForm taskId={t.id} onDone={onChange} />}
        {!finished && !t.pending && t.kind === "ORDER_PRODUCTS" && <ProductsBlock task={t} />}
        {!finished && !t.pending && t.kind === "ORDER_TOTAL" && (
          <div className="mt-4">
            <p className="text-[15px] text-ink">
              Оформіть одне замовлення на суму від <b className="tabular">{money(t.minTotal ?? 0)}</b>.
            </p>
            <p className="mt-1 text-sm text-muted">
              {t.autoApprove ? "Промокод прийде одразу після оформлення." : "Промокод прийде після перевірки менеджером."}
            </p>
            <Link
              href="/"
              className="mt-4 h-11 inline-flex items-center gap-2 rounded-full bg-ink px-5 text-sm font-medium text-white active:scale-[0.98] transition-transform"
            >
              До каталогу
            </Link>
          </div>
        )}
      </div>
    </article>
  );
}

function RewardCode({ entry }: { entry: Entry }) {
  const [copied, setCopied] = useState(false);
  if (!entry.promoCode) return null;
  const code = entry.promoCode.code;
  return (
    <div className="mt-4 rounded-2xl bg-emerald-50 ring-1 ring-emerald-200 px-4 py-3">
      <p className="text-xs text-emerald-800">
        Ваш промокод{entry.promoCode.expiresAt ? `, діє до ${date(entry.promoCode.expiresAt)}` : ""}
      </p>
      <button
        type="button"
        onClick={async () => {
          if (await copyText(code)) {
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          }
        }}
        className="mt-1 w-full flex items-center justify-between gap-3 font-mono text-[17px] font-semibold tracking-wide text-emerald-900"
      >
        <span className="truncate">{code}</span>
        <span className="shrink-0 rounded-full bg-white px-3 py-1 font-sans text-xs font-medium text-ink">
          {copied ? "Скопійовано" : "Копіювати"}
        </span>
      </button>
      {entry.adminComment && <p className="mt-1 text-xs text-emerald-800">{entry.adminComment}</p>}
    </div>
  );
}

function PhotoForm({ taskId, onDone }: { taskId: string; onDone: () => void }) {
  const [photos, setPhotos] = useState<string[]>([]);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);

  async function add(files: FileList | null) {
    if (!files?.length) return;
    setError("");
    setBusy(true);
    try {
      const room = MAX_PHOTOS - photos.length;
      const next: string[] = [];
      for (const f of Array.from(files).slice(0, room)) next.push(await compressImage(f, 1400, 0.78));
      setPhotos((p) => [...p, ...next].slice(0, MAX_PHOTOS));
      if (files.length > room) setError(`Можна додати не більше ${MAX_PHOTOS} фото`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  async function send() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photos, comment }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Не вдалося надіслати");
      setPhotos([]);
      setComment("");
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4">
      <div className="flex flex-wrap gap-2">
        {photos.map((src, i) => (
          <div key={i} className="relative w-20 h-20 rounded-xl overflow-hidden ring-1 ring-black/10">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt={`Фото ${i + 1}`} className="w-full h-full object-cover" />
            <button
              type="button"
              onClick={() => setPhotos((p) => p.filter((_, j) => j !== i))}
              aria-label="Прибрати фото"
              className="absolute top-1 right-1 w-6 h-6 inline-flex items-center justify-center rounded-full bg-black/60 text-white"
            >
              <X size={12} weight="bold" />
            </button>
          </div>
        ))}
        {photos.length < MAX_PHOTOS && (
          <button
            type="button"
            onClick={() => input.current?.click()}
            disabled={busy}
            className="w-20 h-20 rounded-xl border-2 border-dashed border-ink/20 text-ink/60 inline-flex flex-col items-center justify-center gap-1 text-[11px] hover:border-ink/40 disabled:opacity-50"
          >
            <ImageIcon size={22} weight="light" />
            Додати
          </button>
        )}
        <input
          ref={input}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => add(e.target.files)}
        />
      </div>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Коментар (необов'язково): магазин, адреса"
        rows={2}
        className="mt-3 w-full rounded-2xl bg-white/80 ring-1 ring-black/10 px-4 py-3 text-[15px] text-ink placeholder:text-muted focus:outline-none focus:ring-ink/30"
      />
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <button
        type="button"
        onClick={send}
        disabled={busy || photos.length === 0}
        className="mt-3 h-11 inline-flex items-center gap-2 rounded-full bg-ink px-5 text-sm font-medium text-white disabled:opacity-40 active:scale-[0.98] transition-transform"
      >
        <Camera size={18} weight="light" />
        {busy ? "Зачекайте…" : "Надіслати на перевірку"}
      </button>
    </div>
  );
}

function ProductsBlock({ task: t }: { task: Task }) {
  const { cart, setQty } = useCart();
  const need = Math.max(1, t.minQty);
  const allIn = t.products.length > 0 && t.products.every((p) => (cart[p.id] ?? 0) >= need);
  return (
    <div className="mt-4">
      <p className="text-[15px] text-ink">
        Замовте в одному замовленні {need > 1 ? `по ${need} шт. ` : ""}кожного товару:
      </p>
      <ul className="mt-3 space-y-2">
        {t.products.map((p) => {
          const inCart = cart[p.id] ?? 0;
          return (
            <li key={p.id} className={`flex items-center gap-3 rounded-2xl bg-white/70 ring-1 ring-black/5 py-2 pr-3 ${p.image ? "pl-2" : "pl-4"}`}>
              {p.image && (
                <div className="w-12 h-12 shrink-0 rounded-xl bg-white overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.image} alt="" className="w-full h-full object-contain" />
                </div>
              )}
              <span className="min-w-0 flex-1 text-sm text-ink line-clamp-2">{p.name}</span>
              <span className="shrink-0 text-right text-xs tabular">
                <span className="block font-medium text-ink">{money(p.price)}</span>
                {p.out && <span className="block text-red-600">немає в наявності</span>}
                {inCart > 0 && (
                  <span className={inCart >= need ? "text-emerald-700" : "text-amber-700"}>у кошику {inCart}</span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-sm text-muted">
        {t.autoApprove ? "Промокод прийде одразу після оформлення замовлення." : "Промокод прийде після перевірки менеджером."}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={allIn}
          onClick={() => t.products.forEach((p) => setQty(p.id, Math.max(cart[p.id] ?? 0, need)))}
          className="h-11 inline-flex items-center gap-2 rounded-full bg-ink px-5 text-sm font-medium text-white disabled:bg-emerald-600 disabled:opacity-100 active:scale-[0.98] transition-transform"
        >
          {allIn ? <CheckCircle size={18} weight="fill" /> : <ShoppingBag size={18} weight="light" />}
          {allIn ? "Усе в кошику" : "Додати все в кошик"}
        </button>
        {allIn && (
          <Link href="/cart" className="h-11 inline-flex items-center rounded-full bg-white/80 ring-1 ring-black/10 px-5 text-sm font-medium text-ink">
            Оформити
          </Link>
        )}
      </div>
    </div>
  );
}
