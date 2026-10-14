"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, Trophy } from "@phosphor-icons/react";

export type AvailablePromo = {
  id: string;
  code: string;
  description: string | null;
  type: "PERCENT" | "FIXED";
  value: number;
  startsAt?: string | null;
  expiresAt: string | null;
  usageLimit: number | null;
  perClientLimit?: number | null;
  used: number;
  usedByMe?: number;
  minTotal?: number | null;
  scope?: { products: string[]; productCount: number; categories: string[] };
  createdAt: string;
  status: "ACTIVE" | "INACTIVE" | "EXPIRED" | "EXHAUSTED" | "SCHEDULED";
  usable: boolean;
  /** Issued as a reward for a completed task. */
  reward?: { task: string } | null;
  /** A task reward the client hasn't used yet ("Вхідні"). */
  incoming?: boolean;
};

const POLL_MS = 60_000;

export const promoValueText = (p: { type: "PERCENT" | "FIXED"; value: number }) =>
  p.type === "PERCENT" ? `-${p.value}%` : `-${p.value.toLocaleString("uk-UA")} ₴`;

const STATUS: Record<AvailablePromo["status"], { label: string; cls: string }> = {
  ACTIVE: { label: "Активний", cls: "bg-emerald-100/80 text-emerald-800" },
  INACTIVE: { label: "Неактивний", cls: "bg-black/[0.06] text-muted" },
  EXPIRED: { label: "Термін минув", cls: "bg-black/[0.06] text-muted" },
  EXHAUSTED: { label: "Ліміт вичерпано", cls: "bg-black/[0.06] text-muted" },
  SCHEDULED: { label: "Скоро", cls: "bg-blue-100/80 text-blue-800" },
};

function readSeen(key: string): Set<string> {
  try {
    const raw = window.localStorage.getItem(key);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

/**
 * Promo codes handed to the signed-in client, plus "new since last look"
 * tracking (per user, in this browser). `arrival` increments whenever new
 * usable codes appear, to replay the attention animation.
 */
export function usePromoWallet(userKey: string) {
  const storageKey = `luxel-seen-promos:${userKey}`;
  const [promos, setPromos] = useState<AvailablePromo[]>([]);
  const [seen, setSeen] = useState<Set<string>>(() =>
    typeof window === "undefined" ? new Set() : readSeen(storageKey)
  );
  const seenRef = useRef(seen);
  useEffect(() => {
    seenRef.current = seen;
  }, [seen]);
  const prevNew = useRef(0);
  const [arrival, setArrival] = useState(0);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const res = await fetch("/api/promo/available");
        if (!res.ok) return;
        const data: AvailablePromo[] = await res.json();
        if (!alive || !Array.isArray(data)) return;
        // Usable codes first, then the rest; newest first within each.
        setPromos(
          [...data].sort(
            (x, y) =>
              Number(y.usable) - Number(x.usable) ||
              new Date(y.createdAt).getTime() - new Date(x.createdAt).getTime()
          )
        );
        const n = data.filter((p) => p.usable && !seenRef.current.has(p.id)).length;
        if (n > prevNew.current) setArrival((a) => a + 1);
        prevNew.current = n;
      } catch {
        // ignore
      }
    }
    load();
    const t = setInterval(load, POLL_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const newCount = promos.filter((p) => p.usable && !seen.has(p.id)).length;

  function markSeen() {
    if (newCount === 0) return;
    const next = new Set(seen);
    for (const p of promos) next.add(p.id);
    setSeen(next);
    prevNew.current = 0;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify([...next]));
    } catch {
      // ignore
    }
  }

  return { promos, newCount, arrival, markSeen, isNew: (id: string) => !seen.has(id) };
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

export function PromoCard({
  promo,
  fresh,
  index = 0,
}: {
  promo: AvailablePromo;
  fresh?: boolean;
  index?: number;
}) {
  const [copied, setCopied] = useState(false);
  const st = STATUS[promo.status];
  return (
    <li
      className={`rise rounded-[1.25rem] p-4 ${
        promo.incoming && promo.usable ? "bg-[#fffaf0] ring-2 ring-[#f5b65a]" : "bg-white/85 ring-1 ring-white"
      } ${promo.usable ? "" : "opacity-60"}`}
      style={{ ["--i" as string]: index }}
    >
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-lg font-semibold tracking-[-0.02em] text-ink tabular">{promoValueText(promo)}</span>
        <span className={`h-6 inline-flex items-center rounded-full px-2.5 text-xs font-medium ${st.cls}`}>
          {st.label}
        </span>
        {fresh && promo.usable && (
          <span className="h-6 inline-flex items-center rounded-full px-2.5 text-xs font-semibold bg-brand text-white">
            Новий
          </span>
        )}
      </div>
      {promo.reward && (
        <p className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-medium text-[#b4621b]">
          <Trophy size={14} weight="fill" />
          Нагорода за завдання «{promo.reward.task}»
        </p>
      )}
      {promo.description && (
        <p className="mt-1.5 text-[14px] leading-relaxed text-ink/75">{promo.description}</p>
      )}
      {promo.scope && (promo.scope.productCount > 0 || promo.scope.categories.length > 0) && (
        <p className="mt-1.5 text-xs text-ink/70">
          Діє на:{" "}
          {[
            ...promo.scope.categories,
            ...promo.scope.products.slice(0, 3),
            ...(promo.scope.productCount > 3 ? [`ще ${promo.scope.productCount - 3} товарів`] : []),
          ].join(", ")}
        </p>
      )}
      <p className="mt-1.5 text-xs text-muted tabular">
        {promo.minTotal ? `Від суми ${promo.minTotal.toLocaleString("uk-UA")} ₴. ` : ""}
        {promo.startsAt ? `З ${new Date(promo.startsAt).toLocaleDateString("uk-UA")} ` : ""}
        {promo.expiresAt ? `${promo.startsAt ? "до" : "Діє до"} ${new Date(promo.expiresAt).toLocaleDateString("uk-UA")}. ` : promo.startsAt ? ". " : ""}
        {promo.perClientLimit != null
          ? `Можна використати ${promo.perClientLimit} раз(и), використано ${promo.usedByMe ?? 0}.`
          : `Використано ${promo.used}${promo.usageLimit != null ? ` з ${promo.usageLimit}` : ", без обмежень"}.`}
      </p>
      <button
        type="button"
        onClick={async () => {
          if (await copyText(promo.code)) {
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          }
        }}
        aria-label={`Скопіювати промокод ${promo.code}`}
        className={`mt-3 w-full h-11 inline-flex items-center justify-between gap-3 rounded-full pl-4 pr-1.5 transition-all duration-300 ease-fluid active:scale-[0.98] ${
          copied ? "bg-emerald-500 text-white" : "bg-ink/[0.05] text-ink hover:bg-ink/[0.09]"
        }`}
      >
        <span className="font-mono text-[15px] font-semibold tracking-wide truncate">{promo.code}</span>
        <span
          className={`shrink-0 h-8 inline-flex items-center gap-1.5 rounded-full px-3 text-xs font-medium ${
            copied ? "bg-white/20" : "bg-white text-ink shadow-[0_1px_2px_rgba(16,17,20,0.08)]"
          }`}
        >
          {copied ? <Check size={14} weight="bold" className="pop" /> : <Copy size={14} weight="bold" />}
          {copied ? "Скопійовано" : "Копіювати"}
        </span>
      </button>
    </li>
  );
}
