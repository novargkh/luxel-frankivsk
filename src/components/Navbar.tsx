"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { useCart } from "@/lib/cart";

const CLIENT_LINKS = [
  { href: "/", label: "Каталог" },
  { href: "/promotions", label: "Акції" },
  { href: "/orders", label: "Мої замовлення" },
  { href: "/profile", label: "Профіль" },
];

const ADMIN_LINKS = [
  { href: "/admin", label: "Адмінка" },
  { href: "/admin/products", label: "Товари" },
  { href: "/admin/clients", label: "Клієнти" },
  { href: "/admin/routes", label: "Маршрути" },
  { href: "/admin/coverage", label: "Покриття" },
  { href: "/admin/promocodes", label: "Промокоди" },
  { href: "/admin/announcements", label: "Сповіщення" },
];

function CartIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3 4h2l2.2 11.2a1.5 1.5 0 0 0 1.5 1.2h8.1a1.5 1.5 0 0 0 1.5-1.1L20 8H6.2"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="9.5" cy="20" r="1.3" fill="currentColor" />
      <circle cx="17" cy="20" r="1.3" fill="currentColor" />
    </svg>
  );
}

export default function Navbar() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const { totalQty } = useCart();
  // The sheet is "open for" a specific path, so navigating anywhere else
  // closes it automatically without an effect.
  const [openForPath, setOpenForPath] = useState<string | null>(null);
  const menuOpen = openForPath === pathname;
  const setMenuOpen = (fn: (v: boolean) => boolean) =>
    setOpenForPath(fn(menuOpen) ? pathname : null);

  if (!session?.user) return null;

  const role = (session.user as { role?: string }).role;
  const isAdmin = role === "ADMIN";

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

  const cartActive = pathname === "/cart";

  return (
    <header className="sticky top-0 z-10 no-print bg-white/80 backdrop-blur-xl border-b border-black/[0.06]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 sm:h-16 flex items-center gap-4 sm:gap-8">
        <Link href="/" className="flex items-center shrink-0" aria-label="LUXEL — на головну">
          <Image src="/brand/logo.png" alt="LUXEL" width={92} height={28} priority />
        </Link>

        {/* Desktop navigation */}
        <nav className="hidden md:flex items-center gap-1 flex-1 min-w-0" aria-label="Основне меню">
          {CLIENT_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`relative px-3 py-2 text-[14px] font-medium tracking-[-0.005em] transition-colors whitespace-nowrap ${
                isActive(l.href) ? "text-ink" : "text-muted hover:text-ink"
              }`}
            >
              {l.label}
              {isActive(l.href) && (
                <span className="absolute left-3 right-3 -bottom-[17px] h-[2px] rounded-full bg-brand" />
              )}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2 sm:gap-3 shrink-0">
          <span className="hidden lg:inline text-[13px] text-muted max-w-[180px] truncate">
            {session.user.name}
            {isAdmin && " · адмін"}
          </span>

          <Link
            href="/cart"
            aria-label={totalQty > 0 ? `Кошик, товарів: ${totalQty}` : "Кошик"}
            className={`relative inline-flex items-center gap-2 h-10 rounded-full px-3.5 text-[14px] font-medium transition-colors ${
              cartActive
                ? "bg-ink text-white"
                : "bg-white ring-1 ring-black/10 text-ink hover:ring-black/25"
            }`}
          >
            <CartIcon />
            <span className="hidden sm:inline">Кошик</span>
            {totalQty > 0 && (
              <span
                className={`min-w-[20px] h-5 px-1.5 rounded-full text-[11px] leading-5 text-center font-semibold tabular ${
                  cartActive ? "bg-white text-ink" : "bg-brand text-white"
                }`}
              >
                {totalQty}
              </span>
            )}
          </Link>

          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="hidden md:inline-flex h-10 items-center rounded-full px-4 text-[14px] text-muted hover:text-ink transition-colors whitespace-nowrap"
          >
            Вийти
          </button>

          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-expanded={menuOpen}
            aria-label={menuOpen ? "Закрити меню" : "Відкрити меню"}
            className="md:hidden inline-flex items-center justify-center w-10 h-10 rounded-full bg-white ring-1 ring-black/10 text-ink"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              {menuOpen ? (
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              ) : (
                <path d="M4 8h16M4 16h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Admin strip — desktop only, a quiet second row */}
      {isAdmin && (
        <div className="hidden md:block bg-ink">
          <nav
            className="max-w-6xl mx-auto px-4 sm:px-6 h-9 flex items-center gap-1 overflow-x-auto no-scrollbar"
            aria-label="Меню адміністратора"
          >
            {ADMIN_LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`px-3 py-1 rounded-full text-[12px] whitespace-nowrap transition-colors ${
                  isActive(l.href)
                    ? "bg-white/15 text-white"
                    : "text-white/60 hover:text-white"
                }`}
              >
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
      )}

      {/* Mobile sheet */}
      {menuOpen && (
        <div className="md:hidden border-t border-black/[0.06] bg-white max-h-[calc(100vh-3.5rem)] overflow-y-auto">
          <nav className="px-4 py-3" aria-label="Меню">
            {[{ href: "/cart", label: "Кошик" }, ...CLIENT_LINKS].map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`flex items-center justify-between py-3.5 text-[17px] font-medium tracking-[-0.01em] border-b border-black/[0.05] ${
                  isActive(l.href) ? "text-brand" : "text-ink"
                }`}
              >
                {l.label}
                {l.href === "/cart" && totalQty > 0 && (
                  <span className="min-w-[22px] h-[22px] px-1.5 rounded-full bg-brand text-white text-[12px] leading-[22px] text-center font-semibold tabular">
                    {totalQty}
                  </span>
                )}
              </Link>
            ))}

            {isAdmin && (
              <div className="pt-4">
                <div className="text-[11px] uppercase tracking-[0.16em] text-muted mb-1">
                  Адміністратор
                </div>
                {ADMIN_LINKS.map((l) => (
                  <Link
                    key={l.href}
                    href={l.href}
                    className={`block py-2.5 text-[15px] ${
                      isActive(l.href) ? "text-brand font-medium" : "text-ink/80"
                    }`}
                  >
                    {l.label}
                  </Link>
                ))}
              </div>
            )}

            <div className="flex items-center justify-between pt-5 pb-2">
              <span className="text-[13px] text-muted truncate pr-3">{session.user.name}</span>
              <button
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="h-10 rounded-full px-5 text-[14px] font-medium ring-1 ring-black/15 text-ink"
              >
                Вийти
              </button>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
