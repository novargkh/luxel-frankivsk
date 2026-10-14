"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle, Copy, Link as LinkIcon, PaperPlaneTilt, Trash, WarningCircle } from "@phosphor-icons/react";
import { kyivDateTime } from "@/lib/adminOrders";

type Data = {
  configured: boolean;
  secretSet: boolean;
  bot: string | null;
  webhook: { url: string; pending: number; lastError: string | null } | null;
  expectedUrl: string;
  links: { id: string; tgName: string | null; linkedAt: string | null; user: { name: string; email: string | null } }[];
  max: number;
};

// Admin → Telegram: the admin bot (orders, availability, photo-KPI, promo
// codes, notices) for at most `max` people.
export default function TelegramPage() {
  const [d, setD] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [link, setLink] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(() => {
    fetch("/api/admin/telegram")
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "Не вдалося завантажити");
        setD(j);
      })
      .catch((e: Error) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  async function post(action: string) {
    setBusy(action);
    setError("");
    setNotice("");
    try {
      const r = await fetch("/api/admin/telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Помилка");
      if (action === "link") setLink(j.url);
      if (action === "webhook") setNotice("Бота підключено до сайту.");
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  async function remove(id: string) {
    if (!confirm("Відключити цей Telegram від бота?")) return;
    setBusy(id);
    await fetch(`/api/admin/telegram?id=${id}`, { method: "DELETE" });
    setBusy("");
    load();
  }

  const hooked = !!d?.webhook && d.webhook.url === d.expectedUrl;
  const full = !!d && d.links.length >= d.max;

  return (
    <main className="w-full max-w-3xl mx-auto px-4 sm:px-6 py-6 flex-1">
      <h1 className="text-2xl font-semibold tracking-tight">Telegram</h1>
      <p className="text-sm text-slate-500 mb-5">
        Бот для керівників: замовлення, наявність, фото-KPI, промокоди та сповіщення про нові замовлення, повернення й помилки
        обміну з BAF. Доступ мають не більше {d?.max ?? 2} осіб.
      </p>
      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}
      {notice && <p className="text-sm text-emerald-700 mb-4">{notice}</p>}

      {d && (
        <>
          <section className="rounded-xl bg-white ring-1 ring-slate-200 p-4 mb-4">
            <h2 className="text-sm font-semibold mb-3">1. Бот</h2>
            <Step ok={d.configured} text={d.configured ? `Бот: @${d.bot ?? "?"}` : "На сайті не задано TELEGRAM_BOT_TOKEN (Vercel → Environment Variables, потім Redeploy)"} />
            <Step ok={d.secretSet} text={d.secretSet ? "Секретний ключ вебхука задано" : "На сайті не задано TELEGRAM_WEBHOOK_SECRET"} />
            <Step
              ok={hooked}
              text={
                hooked
                  ? `Бот підключений до сайту${d.webhook?.lastError ? ` (остання помилка: ${d.webhook.lastError})` : ""}`
                  : "Бот ще не підключений до сайту"
              }
            />
            {d.configured && d.secretSet && (
              <button
                onClick={() => post("webhook")}
                disabled={!!busy}
                className="mt-3 h-9 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 text-sm font-medium text-white disabled:opacity-50"
              >
                <PaperPlaneTilt size={16} /> {hooked ? "Підключити ще раз" : "Підключити бота до сайту"}
              </button>
            )}
          </section>

          <section className="rounded-xl bg-white ring-1 ring-slate-200 p-4">
            <h2 className="text-sm font-semibold mb-3">
              2. Хто користується ботом ({d.links.length} з {d.max})
            </h2>
            {d.links.length === 0 && <p className="text-sm text-slate-500 mb-3">Ще ніхто не підключений.</p>}
            <ul className="divide-y divide-slate-100 mb-3">
              {d.links.map((l) => (
                <li key={l.id} className="py-2 flex items-center gap-3 text-sm">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{l.tgName || "Telegram"}</p>
                    <p className="text-xs text-slate-500">
                      підключив {l.user.name}
                      {l.linkedAt ? ` · ${kyivDateTime(l.linkedAt)}` : ""}
                    </p>
                  </div>
                  <button
                    onClick={() => remove(l.id)}
                    disabled={busy === l.id}
                    aria-label="Відключити"
                    className="h-8 w-8 inline-flex items-center justify-center rounded text-slate-400 hover:text-red-600 hover:bg-red-50"
                  >
                    <Trash size={16} />
                  </button>
                </li>
              ))}
            </ul>
            {!full && (
              <button
                onClick={() => post("link")}
                disabled={!!busy || !hooked}
                className="h-9 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 text-sm font-medium text-white disabled:opacity-50"
              >
                <LinkIcon size={16} /> Підключити Telegram
              </button>
            )}
            {full && <p className="text-xs text-slate-500">Досягнуто ліміту. Щоб підключити іншу людину, спочатку відключіть когось.</p>}
            {link && !full && (
              <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm">
                <p className="mb-2">
                  Відкрийте це посилання на телефоні тієї людини, яку підключаєте, і натисніть «Start» у боті. Діє 15 хвилин, лише
                  один раз.
                </p>
                <div className="flex items-center gap-2">
                  <a href={link} target="_blank" rel="noreferrer" className="flex-1 min-w-0 truncate text-blue-700 underline">
                    {link}
                  </a>
                  <button
                    onClick={() => navigator.clipboard?.writeText(link)}
                    aria-label="Копіювати"
                    className="h-8 w-8 inline-flex items-center justify-center rounded hover:bg-slate-200"
                  >
                    <Copy size={16} />
                  </button>
                </div>
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}

function Step({ ok, text }: { ok: boolean; text: string }) {
  return (
    <p className={`flex items-start gap-2 text-sm py-0.5 ${ok ? "text-slate-700" : "text-amber-700"}`}>
      {ok ? <CheckCircle size={18} weight="fill" className="text-emerald-600 shrink-0" /> : <WarningCircle size={18} weight="fill" className="shrink-0" />}
      {text}
    </p>
  );
}
