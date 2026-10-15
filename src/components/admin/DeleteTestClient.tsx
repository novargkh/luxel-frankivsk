"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Bottom of the admin client card. Real clients (with a BAF code, or with
// orders already in BAF) only see why they can't be deleted.
export default function DeleteTestClient({ clientId, label, blocker }: { clientId: string; label: string; blocker: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function remove() {
    setBusy(true);
    setError("");
    const res = await fetch(`/api/admin/clients/${clientId}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmName: typed }),
    });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(d.error || "Не вдалося видалити");
      return;
    }
    router.push("/admin/clients");
  }

  return (
    <section className="border border-slate-200 bg-white rounded-xl p-4 mt-6">
      <h2 className="text-sm font-semibold text-slate-900 mb-1">Видалення тестового клієнта</h2>
      {blocker ? (
        <p className="text-xs text-slate-500">{blocker}</p>
      ) : !open ? (
        <>
          <p className="text-xs text-slate-500 mb-3">
            Лише для тестових клієнтів без коду BAF. Разом з клієнтом зникнуть його замовлення, повернення, магазини й особисті
            промокоди. Скасувати не можна.
          </p>
          <button type="button" onClick={() => setOpen(true)} className="text-sm rounded-lg px-4 py-2 border border-red-300 text-red-700 hover:bg-red-50">
            Видалити тестового клієнта…
          </button>
        </>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-slate-700">
            Щоб підтвердити, введіть назву клієнта: <b>{label}</b>
          </p>
          <input value={typed} onChange={(e) => setTyped(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" autoFocus />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={remove}
              disabled={busy || typed.trim() !== label}
              className="text-sm rounded-lg px-4 py-2 bg-red-600 text-white disabled:opacity-40"
            >
              {busy ? "Видаляю…" : "Видалити назавжди"}
            </button>
            <button type="button" onClick={() => { setOpen(false); setTyped(""); setError(""); }} className="text-sm rounded-lg px-4 py-2 border border-slate-300">
              Скасувати
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
