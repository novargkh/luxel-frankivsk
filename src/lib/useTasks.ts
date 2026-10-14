"use client";

import { useEffect, useState } from "react";

// "New task" indicator for the client navigation: task ids the client has
// not looked at yet (per user, in this browser). Opening /tasks marks all
// current tasks as seen.

const POLL_MS = 5 * 60_000;
const EVENT = "luxel-tasks-seen";

const keyFor = (userKey: string) => `luxel-seen-tasks:${userKey}`;

function readSeen(key: string): Set<string> {
  try {
    const raw = window.localStorage.getItem(key);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

export function markTasksSeen(userKey: string, ids: string[]) {
  try {
    const key = keyFor(userKey);
    const seen = readSeen(key);
    ids.forEach((id) => seen.add(id));
    window.localStorage.setItem(key, JSON.stringify([...seen]));
  } catch {
    // ignore
  }
  window.dispatchEvent(new Event(EVENT));
}

type TaskBrief = { id: string; left: number; pending: boolean };

/** Number of open tasks the client hasn't seen yet. */
export function useNewTasks(userKey: string, enabled = true) {
  const [ids, setIds] = useState<string[]>([]);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    async function load() {
      try {
        const res = await fetch("/api/tasks");
        if (!res.ok) return;
        const data: TaskBrief[] = await res.json();
        if (alive && Array.isArray(data)) setIds(data.filter((t) => t.left > 0 && !t.pending).map((t) => t.id));
      } catch {
        // ignore
      }
    }
    load();
    const t = setInterval(load, POLL_MS);
    const onSeen = () => setTick((n) => n + 1);
    window.addEventListener(EVENT, onSeen);
    return () => {
      alive = false;
      clearInterval(t);
      window.removeEventListener(EVENT, onSeen);
    };
  }, [enabled]);

  // `tick` re-reads the seen list after /tasks marks tasks as seen.
  void tick;
  if (typeof window === "undefined") return 0;
  const seen = readSeen(keyFor(userKey));
  return ids.filter((id) => !seen.has(id)).length;
}
