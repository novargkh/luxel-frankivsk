"use client";

import { useState } from "react";
import { Check, Copy, Ticket } from "@phosphor-icons/react";
import { promoValueLabel, type AvailablePromo } from "@/lib/promoFeed";

const STATUS_LABEL: Record<AvailablePromo["status"], string> = {
  ACTIVE: "Активний",
  DISABLED: "Неактивний",
  EXPIRED: "Термін минув",
  USED_UP: "Ліміт вичерпано",
};

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older iOS / non-secure context: fall back to a hidden textarea.
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  }
}

function PromoCard({ promo, isNew, index }: { promo: AvailablePromo; isNew: boolean; index: number }) {
  const [copied, setCopied] = useState(false);
  const active = promo.status === "ACTIVE";

  async function copy() {
    if (await copyText(promo.code)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    }
  }

  return (
    <li
      className={`rise rounded-[1.25rem] ring-1 px-4 py-3 ${
        active ? "bg-white/85 ring-white" : "bg-white/50 ring-white/60"
      }`}
      style={{ ["--i" as string]: index }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`text-[17px] font-semibold tracking-[0.02em] font-mono ${
                active ? "text-ink" : "text-ink/45 line-through decoration-1"
              }`}
            >
              {promo.code}
            </span>
            {isNew && (
              <span className="pop rounded-full bg-brand text-white text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5">
                Нове
              </span>
            )}
          </div>
          {promo.description && (
            <p className={`mt-0.5 text-[14px] leading-snug ${active ? "text-ink/75" : "text-muted"}`}>
              {promo.description}
            </p>
          )}
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-[13px] font-semibold tabular ${
            active ? "bg-brand/10 text-brand" : "bg-ink/[0.05] text-muted"
          }`}
        >
          {promoValueLabel(promo)}
        </span>
      </div>

      <div className="mt-2.5 flex items-end justify-between gap-3">
        <dl className="text-xs text-muted space-y-0.5 tabular">
          <div className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className={`w-1.5 h-1.5 rounded-full ${active ? "bg-emerald-500" : "bg-ink/25"}`}
            />
            <dt className="sr-only">Статус</dt>
            <dd className={active ? "text-emerald-700" : ""}>{STATUS_LABEL[promo.status]}</dd>
          </div>
          <div>
            <dt className="inline">Застосувань: </dt>
            <dd className="inline">
              {promo.usedCount}
              {promo.usageLimit != null ? ` з ${promo.usageLimit}` : " · без ліміту"}
            </dd>
          </div>
          <div>
            <dt className="inline">Діє до: </dt>
            <dd className="inline">
              {promo.expiresAt
                ? new Date(promo.expiresAt).toLocaleDateString("uk-UA", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                  })
                : "безстроково"}
            </dd>
          </div>
        </dl>
        {active && (
          <button
            type="button"
            onClick={copy}
            aria-label={`Скопіювати промокод ${promo.code}`}
            className={`shrink-0 h-9 inline-flex items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium transition-colors duration-300 ease-fluid active:scale-[0.97] ${
              copied ? "bg-emerald-600 text-white" : "bg-ink text-white"
            }`}
          >
            {copied ? <Check size={16} weight="bold" /> : <Copy size={16} weight="light" />}
            {copied ? "Скопійовано" : "Копіювати"}
          </button>
        )}
      </div>
    </li>
  );
}

// "Доступні промокоди": the codes an admin handed to this client, each
// with its description, status, usage and expiry, copyable in one tap.
export default function PromoCodes({
  items,
  newIds,
  loaded,
}: {
  items: AvailablePromo[];
  newIds: Set<string>;
  loaded: boolean;
}) {
  if (!loaded) {
    return <p className="text-sm text-muted">Завантаження...</p>;
  }
  if (items.length === 0) {
    return (
      <div className="rounded-[1.25rem] bg-white/50 ring-1 ring-white/60 px-4 py-5 text-center">
        <Ticket size={28} weight="light" className="mx-auto text-muted/70 mb-1.5" />
        <p className="text-sm text-muted">Поки що немає доступних промокодів</p>
      </div>
    );
  }
  return (
    <ul className="space-y-2">
      {items.map((p, i) => (
        <PromoCard key={p.id} promo={p} isNew={newIds.has(p.id)} index={i} />
      ))}
    </ul>
  );
}
