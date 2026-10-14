"use client";

import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";

// Admin → own account: change the login email and password.
export default function AccountPage() {
  const [email, setEmail] = useState("");
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState<{ email: string | null } | null>(null);

  useEffect(() => {
    fetch("/api/admin/account")
      .then((r) => r.json())
      .then((u) => {
        setLoaded(u);
        setEmail(u?.email ?? "");
      })
      .catch(() => {});
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setDone("");
    if (next && next !== repeat) {
      setError("Новий пароль і повтор не збігаються");
      return;
    }
    setBusy(true);
    const res = await fetch("/api/admin/account", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword: current, newPassword: next || undefined, email }),
    });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(d.error || "Не вдалося зберегти");
      return;
    }
    setDone("Збережено. Зараз увійдіть знову з новими даними.");
    setTimeout(() => signOut({ callbackUrl: "/login" }), 2000);
  }

  const field = "w-full h-10 rounded-lg border border-slate-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900";

  return (
    <main className="w-full max-w-lg mx-auto px-4 sm:px-6 py-6 flex-1">
      <h1 className="text-2xl font-semibold tracking-tight">Мій акаунт</h1>
      <p className="text-sm text-slate-500 mb-5">Email для входу в адмін-панель і пароль.</p>

      <form onSubmit={save} className="rounded-xl bg-white ring-1 ring-slate-200 p-5 space-y-4">
        <label className="block text-sm">
          <span className="block font-medium mb-1">Email для входу</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={field} autoComplete="username" />
          {loaded?.email?.endsWith("@demo.local") && (
            <span className="block text-xs text-amber-700 mt-1">Це демо-адреса. Вкажіть свій справжній email.</span>
          )}
        </label>
        <label className="block text-sm">
          <span className="block font-medium mb-1">Новий пароль</span>
          <input type="password" value={next} onChange={(e) => setNext(e.target.value)} className={field} autoComplete="new-password" placeholder="щонайменше 10 символів" />
        </label>
        <label className="block text-sm">
          <span className="block font-medium mb-1">Повторіть новий пароль</span>
          <input type="password" value={repeat} onChange={(e) => setRepeat(e.target.value)} className={field} autoComplete="new-password" />
        </label>
        <label className="block text-sm border-t border-slate-100 pt-4">
          <span className="block font-medium mb-1">Поточний пароль</span>
          <input type="password" required value={current} onChange={(e) => setCurrent(e.target.value)} className={field} autoComplete="current-password" />
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {done && <p className="text-sm text-emerald-700">{done}</p>}
        <button type="submit" disabled={busy} className="h-10 rounded-lg bg-slate-900 px-5 text-sm font-semibold text-white disabled:opacity-50">
          {busy ? "Зберігаю…" : "Зберегти"}
        </button>
      </form>
    </main>
  );
}
