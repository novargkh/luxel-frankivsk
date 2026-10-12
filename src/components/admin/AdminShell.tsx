"use client";

import { Suspense, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { SyncBar } from "@/components/admin/SyncProgress";
import {
  ArrowUUpLeft,
  CalendarBlank,
  List,
  MapTrifold,
  Megaphone,
  Package,
  Receipt,
  SignOut,
  SquaresFour,
  Ticket,
  Truck,
  UsersThree,
  X,
  type Icon,
} from "@phosphor-icons/react";

type Counts = { newOrders: number; newReturns: number; openRequests: number; basErrors: number };

type Item = { href: string; label: string; icon: Icon; badge?: keyof Counts; match?: (p: string, view: string | null) => boolean };

const GROUPS: { title: string; items: Item[] }[] = [
  {
    title: "Робота",
    items: [
      { href: "/admin", label: "Огляд", icon: SquaresFour, match: (p) => p === "/admin" },
      {
        href: "/admin/orders",
        label: "Замовлення",
        icon: Receipt,
        badge: "newOrders",
        match: (p, v) => p === "/admin/orders" && v !== "calendar",
      },
      {
        href: "/admin/orders?view=calendar",
        label: "Календар",
        icon: CalendarBlank,
        match: (p, v) => p === "/admin/orders" && v === "calendar",
      },
      { href: "/admin/returns", label: "Повернення", icon: ArrowUUpLeft, badge: "newReturns" },
      { href: "/admin/routes", label: "Маршрути", icon: Truck },
    ],
  },
  {
    title: "Довідники",
    items: [
      { href: "/admin/clients", label: "Клієнти", icon: UsersThree, badge: "openRequests" },
      { href: "/admin/products", label: "Товари", icon: Package },
      { href: "/admin/promocodes", label: "Промокоди", icon: Ticket },
      { href: "/admin/coverage", label: "Покриття", icon: MapTrifold },
      { href: "/admin/announcements", label: "Сповіщення", icon: Megaphone },
    ],
  },
];

// The admin area's own frame: a dark sidebar (a drawer on phones) and a
// plain light-grey workspace — no glass, no coloured background, so it is
// never confused with the client cabinet.
export default function AdminShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="admin-root relative min-h-dvh w-full bg-[#eef0f3] text-slate-900">
      <Suspense fallback={null}>
        <Frame>{children}</Frame>
      </Suspense>
    </div>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const view = useSearchParams().get("view");
  const { data: session } = useSession();
  const [openFor, setOpenFor] = useState<string | null>(null);
  const drawerOpen = openFor === `${pathname}?${view}`;
  const [counts, setCounts] = useState<Counts | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/admin/summary")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => alive && d && setCounts(d))
        .catch(() => {});
    load();
    const t = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [pathname]);

  const nav = (
    <nav aria-label="Адмін-меню" className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
      {GROUPS.map((g) => (
        <div key={g.title}>
          <p className="px-3 mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">{g.title}</p>
          <ul className="space-y-0.5">
            {g.items.map((it) => {
              const active = it.match
                ? it.match(pathname, view)
                : pathname === it.href || pathname.startsWith(`${it.href}/`);
              const n = it.badge && counts ? counts[it.badge] : 0;
              const ItemIcon = it.icon;
              return (
                <li key={it.href}>
                  <Link
                    href={it.href}
                    aria-current={active ? "page" : undefined}
                    className={`relative flex items-center gap-3 h-10 rounded-lg px-3 text-[14px] transition-colors ${
                      active ? "bg-white/10 text-white font-medium" : "text-slate-300 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    {active && <span aria-hidden="true" className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-brand" />}
                    <ItemIcon size={18} weight={active ? "fill" : "regular"} />
                    <span className="flex-1">{it.label}</span>
                    {n > 0 && (
                      <span className="min-w-[22px] h-[22px] px-1.5 rounded-full bg-brand text-white text-[11px] leading-[22px] text-center font-semibold tabular">
                        {n}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  const footer = (
    <div className="border-t border-white/10 px-4 py-4">
      <p className="text-[13px] text-white font-medium truncate">{session?.user?.name ?? "Адміністратор"}</p>
      <p className="text-[12px] text-slate-400 truncate">{session?.user?.email}</p>
      <button
        type="button"
        onClick={() => signOut({ callbackUrl: "/login" })}
        className="mt-3 h-9 w-full inline-flex items-center justify-center gap-2 rounded-lg bg-white/10 text-[13px] text-white hover:bg-white/15"
      >
        <SignOut size={16} />
        Вийти
      </button>
    </div>
  );

  const brand = (
    <div className="flex items-center gap-3 px-6 h-16 border-b border-white/10 shrink-0">
      <Image src="/brand/logo-trim.png" alt="LUXEL" width={84} height={22} priority className="h-[22px] w-auto" />
      <span className="text-[13px] font-semibold text-white tracking-wide">Адмін-панель</span>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="no-print hidden lg:flex fixed inset-y-0 left-0 z-40 w-64 flex-col bg-[#343b47]">
        {brand}
        {nav}
        {footer}
      </aside>

      {/* Phone / tablet top bar */}
      <header className="no-print lg:hidden sticky top-0 z-40 h-14 flex items-center gap-3 px-3 bg-[#343b47] text-white">
        <button
          type="button"
          onClick={() => setOpenFor(`${pathname}?${view}`)}
          aria-label="Відкрити меню"
          className="h-10 w-10 inline-flex items-center justify-center rounded-lg hover:bg-white/10"
        >
          <List size={22} />
        </button>
        <Image src="/brand/logo-trim.png" alt="LUXEL" width={69} height={18} className="h-[18px] w-auto" />
        <span className="text-[13px] font-semibold">Адмін-панель</span>
        {counts && counts.newOrders > 0 && (
          <Link
            href="/admin/orders"
            className="ml-auto h-8 inline-flex items-center gap-1.5 rounded-full bg-brand px-3 text-[12px] font-semibold"
          >
            Нових: {counts.newOrders}
          </Link>
        )}
      </header>

      {drawerOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <button
            type="button"
            aria-label="Закрити меню"
            className="absolute inset-0 bg-black/40"
            onClick={() => setOpenFor(null)}
          />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] flex flex-col bg-[#343b47] shadow-2xl">
            <div className="flex items-center justify-between pr-2">
              {brand}
              <button
                type="button"
                onClick={() => setOpenFor(null)}
                aria-label="Закрити меню"
                className="h-10 w-10 inline-flex items-center justify-center rounded-lg text-white hover:bg-white/10"
              >
                <X size={20} />
              </button>
            </div>
            {nav}
            {footer}
          </aside>
        </div>
      )}

      <div className="lg:pl-64 min-h-dvh flex flex-col">
        <SyncBar />
        {children}
      </div>
    </>
  );
}
