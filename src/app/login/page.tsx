"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Script from "next/script";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

// Cloudflare Turnstile captcha: shown only when the site key is set.
const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

type Turnstile = {
  render: (el: HTMLElement, o: { sitekey: string; callback: (t: string) => void; "expired-callback": () => void }) => string;
  reset: (id: string) => void;
};

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [captcha, setCaptcha] = useState("");
  const [scriptReady, setScriptReady] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);

  useEffect(() => {
    const t = (window as unknown as { turnstile?: Turnstile }).turnstile;
    if (!SITE_KEY || !scriptReady || !t || !box.current || widget.current) return;
    widget.current = t.render(box.current, {
      sitekey: SITE_KEY,
      callback: setCaptcha,
      "expired-callback": () => setCaptcha(""),
    });
  }, [scriptReady]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const res = await signIn("credentials", {
      email,
      password,
      captcha,
      redirect: false,
    });

    setLoading(false);

    if (res?.error) {
      // A captcha token works once: get a fresh one for the next try.
      const t = (window as unknown as { turnstile?: Turnstile }).turnstile;
      if (t && widget.current) {
        t.reset(widget.current);
        setCaptcha("");
      }
      setError(
        res.code === "too_many"
          ? "Забагато невдалих спроб. Спробуйте через 15 хвилин або зверніться до менеджера."
          : res.code === "captcha"
            ? "Підтвердіть, що ви не робот, і спробуйте ще раз."
            : "Невірний логін або пароль. Якщо пароля ще немає, зверніться до менеджера."
      );
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm bg-white shadow-sm border border-slate-200 rounded-xl p-8">
        <div className="flex justify-center mb-6">
          <Image src="/brand/logo.png" alt="LUXEL" width={150} height={45} priority />
        </div>
        <h1 className="text-xl font-semibold text-slate-900 mb-1 text-center">
          Особистий кабінет
        </h1>
        <p className="text-sm text-slate-500 mb-6 text-center">
          Увійдіть, щоб переглянути каталог і оформити замовлення
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Email або телефон
            </label>
            <input
              type="text"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
              placeholder="you@company.com або 050 123 45 67"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Пароль
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
              placeholder="••••••••"
            />
          </div>

          {SITE_KEY && (
            <>
              <Script
                src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
                onReady={() => setScriptReady(true)}
              />
              <div ref={box} className="flex justify-center min-h-[65px]" />
            </>
          )}

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || (!!SITE_KEY && !captcha)}
            className="w-full bg-brand text-white rounded-lg py-2 text-sm font-medium hover:bg-brand-dark disabled:opacity-60 transition"
          >
            {loading ? "Вхід..." : "Увійти"}
          </button>
        </form>

      </div>
    </div>
  );
}
