"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

export type AvailablePromo = {
  id: string;
  code: string;
  description: string | null;
  type: "PERCENT" | "FIXED";
  value: number;
  usageLimit: number | null;
  usedCount: number;
  expiresAt: string | null;
  createdAt: string;
  status: "ACTIVE" | "DISABLED" | "EXPIRED" | "USED_UP";
};

const POLL_MS = 60_000;
const SEEN_EVENT = "luxel-promos-seen";

function storageKey(userKey: string) {
  return `luxel-seen-promos:${userKey}`;
}

function readSeen(userKey: string): Set<string> {
  try {
    const raw = window.localStorage.getItem(storageKey(userKey));
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

// The client's promo codes ("Доступні промокоди") plus which of them are
// new to this client. Like the announcements envelope, "seen" lives per
// user in this browser (localStorage); every hook instance on the page is
// kept in sync through a window event, so opening the menu also clears the
// dot elsewhere. Pass enabled=false (e.g. for admins) to skip loading.
export function usePromoFeed(userKey: string, enabled = true) {
  const [items, setItems] = useState<AvailablePromo[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [seen, setSeen] = useState<Set<string>>(() =>
    typeof window === "undefined" ? new Set() : readSeen(userKey)
  );

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    async function load() {
      try {
        const res = await fetch("/api/promo/available");
        if (!res.ok) return;
        const data: AvailablePromo[] = await res.json();
        if (alive && Array.isArray(data)) setItems(data);
      } catch {
        // offline or signed out: keep what we have
      } finally {
        if (alive) setLoaded(true);
      }
    }
    load();
    const t = setInterval(load, POLL_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [enabled]);

  useEffect(() => {
    const sync = () => setSeen(readSeen(userKey));
    window.addEventListener(SEEN_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(SEEN_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [userKey]);

  // Only codes that can still be used count as "new" news.
  const newIds = useMemo(
    () => new Set(items.filter((p) => p.status === "ACTIVE" && !seen.has(p.id)).map((p) => p.id)),
    [items, seen]
  );

  const markSeen = useCallback(() => {
    if (newIds.size === 0) return;
    const next = new Set(seen);
    for (const p of items) next.add(p.id);
    setSeen(next);
    try {
      window.localStorage.setItem(storageKey(userKey), JSON.stringify([...next]));
    } catch {
      // storage blocked: the dot just shows again next visit
    }
    window.dispatchEvent(new Event(SEEN_EVENT));
  }, [items, newIds, seen, userKey]);

  return { items, loaded, newIds, markSeen };
}

export function promoValueLabel(p: { type: "PERCENT" | "FIXED"; value: number }) {
  return p.type === "PERCENT" ? `−${p.value}%` : `−${p.value.toLocaleString("uk-UA")} ₴`;
}
