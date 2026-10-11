"use client";

import { useEffect, useRef, useState } from "react";
import { Envelope, EnvelopeOpen, X } from "@phosphor-icons/react";

type Announcement = { id: string; title: string; body: string; createdAt: string };

const POLL_MS = 60_000;

function readSeen(key: string): Set<string> {
  try {
    const raw = window.localStorage.getItem(key);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

// Envelope in the top bar that collects announcements ("Сповіщення").
// New, unread messages show a red counter and the envelope gives a short
// shake + ripple when they arrive. Opening the envelope shows them once and
// marks them read, so afterwards they are gone. "Read" is remembered per
// user in this browser (localStorage).
export default function Inbox({ userKey }: { userKey: string }) {
  const storageKey = `luxel-seen-announcements:${userKey}`;
  const [items, setItems] = useState<Announcement[]>([]);
  const [seen, setSeen] = useState<Set<string>>(() =>
    typeof window === "undefined" ? new Set() : readSeen(storageKey)
  );
  const seenRef = useRef(seen);
  useEffect(() => {
    seenRef.current = seen;
  }, [seen]);
  const prevUnread = useRef(0);
  // Bumped whenever more unread messages appear; used as a React key to
  // replay the arrival animation.
  const [arrival, setArrival] = useState(0);
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState<Announcement[]>([]);
  const rootRef = useRef<HTMLDivElement>(null);

  // Close on any tap outside, or on Escape. (A fixed click-away layer
  // would be clipped by the glass bar's backdrop-filter.)
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const res = await fetch("/api/announcements");
        if (!res.ok) return;
        const data: Announcement[] = await res.json();
        if (!alive || !Array.isArray(data)) return;
        setItems(data);
        const unreadNow = data.filter((a) => !seenRef.current.has(a.id)).length;
        if (unreadNow > prevUnread.current) setArrival((n) => n + 1);
        prevUnread.current = unreadNow;
      } catch {
        // offline or signed out: keep what we have
      }
    }
    load();
    const t = setInterval(load, POLL_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const unread = items.filter((a) => !seen.has(a.id));

  function openInbox() {
    setShown(unread);
    setOpen(true);
    if (unread.length === 0) return;
    const next = new Set(seen);
    for (const a of items) next.add(a.id);
    setSeen(next);
    prevUnread.current = 0;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify([...next]));
    } catch {
      // storage blocked: they'll just show again next visit
    }
  }

  return (
    <div ref={rootRef} className="contents">
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : openInbox())}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={unread.length > 0 ? `Сповіщення, нових: ${unread.length}` : "Сповіщення"}
        className={`relative w-10 h-10 sm:w-11 sm:h-11 shrink-0 inline-flex items-center justify-center rounded-full transition-colors duration-300 ease-fluid ${
          open ? "bg-ink text-white" : "bg-white/60 ring-1 ring-white/70 text-ink hover:bg-white/90"
        }`}
      >
        {unread.length > 0 && (
          <span key={`ring-${arrival}`} aria-hidden="true" className="env-ripple absolute inset-0 rounded-full" />
        )}
        <span key={`icon-${arrival}`} className={unread.length > 0 ? "env-shake inline-flex" : "inline-flex"}>
          {open ? <EnvelopeOpen size={20} weight="light" /> : <Envelope size={20} weight="light" />}
        </span>
        {unread.length > 0 && (
          <span
            key={`badge-${unread.length}`}
            className="pop absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-brand text-white text-[10px] leading-[18px] text-center font-semibold tabular ring-2 ring-white"
          >
            {unread.length > 9 ? "9+" : unread.length}
          </span>
        )}
      </button>

      {open && (
          <div
            role="dialog"
            aria-label="Сповіщення"
            className="reveal absolute right-0 top-full mt-3 z-10 w-[min(24rem,calc(100vw-1.5rem))] rounded-[1.75rem] glass glass-strong bg-white/[0.97] p-1.5"
          >
            <div className="flex items-center justify-between px-4 pt-3 pb-2">
              <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-ink">Сповіщення</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Закрити"
                className="w-8 h-8 inline-flex items-center justify-center rounded-full text-muted hover:text-ink hover:bg-white/70"
              >
                <X size={14} weight="bold" />
              </button>
            </div>
            {shown.length === 0 ? (
              <div className="px-4 pt-2 pb-6 text-center">
                <EnvelopeOpen size={32} weight="light" className="mx-auto text-muted/70 mb-2" />
                <p className="text-sm text-muted">Нових повідомлень немає</p>
              </div>
            ) : (
              <ul className="max-h-[60dvh] overflow-y-auto px-1.5 pb-1.5 space-y-1.5">
                {shown.map((a, i) => (
                  <li
                    key={a.id}
                    className="rise rounded-[1.25rem] bg-white/80 ring-1 ring-white px-4 py-3"
                    style={{ ["--i" as string]: i }}
                  >
                    <p className="text-[14px] font-semibold text-ink leading-snug">{a.title}</p>
                    <p className="mt-0.5 text-[14px] leading-relaxed text-ink/75 whitespace-pre-line">{a.body}</p>
                    <p className="mt-1.5 text-xs text-muted tabular">
                      {new Date(a.createdAt).toLocaleDateString("uk-UA", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                      })}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
      )}
    </div>
  );
}
