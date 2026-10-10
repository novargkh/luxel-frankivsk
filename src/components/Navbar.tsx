"use client";

import { useState, type PointerEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { CaretDown, ShoppingBag, SignOut } from "@phosphor-icons/react";
import { useCart } from "@/lib/cart";

const CLIENT_LINKS = [
  { href: "/", label: "Каталог" },
  { href: "/promotions", label: "Акції" },
  { href: "/orders", label: "Мої замовлення" },
  { href: "/profile", label: "Профіль" },
];

const ADMIN_LINKS = [
  { href: "/admin", label: "Огляд" },
  { href: "/admin/products", label: "Товари" },
  { href: "/admin/clients", label: "Клієнти" },
  { href: "/admin/routes", label: "Маршрути" },
  { href: "/admin/coverage", label: "Покриття" },
  { href: "/admin/promocodes", label: "Промокоди" },
  { href: "/admin/announcements", label: "Сповіщення" },
];

// Floating "island" navigation: a glass pill detached from the top edge.
// Admin links live in a dropdown instead of a second, heavy dark strip.
// Moves the glass highlight to follow the pointer (CSS vars, no re-render).
function trackLight(e: PointerEvent<HTMLElement>) {
  const el = e.currentTarget;
  const r = el.getBoundingClientRect();
  el.style.setProperty("--mx", `${((e.clientX - r.left) / r.width) * 100}%`);
  el.style.setProperty("--my", `${((e.clientY - r.top) / r.height) * 100}%`);
}

export default function Navbar() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const { totalQty } = useCart();
  // Menus are "open for" a specific path, so navigating anywhere else
  // closes them automatically without an effect.
  const [mobileFor, setMobileFor] = useState<string | null>(null);
  const [adminFor, setAdminFor] = useState<string | null>(null);
  const mobileOpen = mobileFor === pathname;
  const adminOpen = adminFor === pathname;

  if (!session?.user) return null;

  const role = (session.user as { role?: string }).role;
  const isAdmin = role === "ADMIN";

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
  const adminActive = pathname.startsWith("/admin");
  const cartActive = pathname === "/cart";

  return (
    <header className="sticky top-0 z-40 no-print px-3 sm:px-6 pt-3">
      {/* Mobile full-screen glass menu (sits under the pill) */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 glass glass-strong !border-0 !rounded-none overflow-y-auto">
          <nav className="px-6 pt-28 pb-12" aria-label="Меню">
            {[{ href: "/cart", label: "Кошик" }, ...CLIENT_LINKS].map((l, i) => (
              <Link
                key={l.href}
                href={l.href}
                style={{ ["--i" as string]: i }}
                className={`reveal flex items-baseline justify-between py-3 text-[32px] leading-tight font-semibold tracking-[-0.03em] ${
                  isActive(l.href) ? "text-brand" : "text-ink"
                }`}
              >
                {l.label}
                {l.href === "/cart" && totalQty > 0 && (
                  <span className="text-base font-medium text-muted tabular">{totalQty}</span>
                )}
              </Link>
            ))}

            {isAdmin && (
              <div className="reveal mt-8 pt-6 border-t border-black/[0.06]" style={{ ["--i" as string]: 6 }}>
                <p className="text-sm font-medium text-muted mb-2">Адміністрування</p>
                <div className="grid grid-cols-2 gap-x-4">
                  {ADMIN_LINKS.map((l) => (
                    <Link
                      key={l.href}
                      href={l.href}
                      className={`py-2 text-[17px] ${
                        (l.href === "/admin" ? pathname === "/admin" : isActive(l.href))
                          ? "text-brand font-medium"
                          : "text-ink/80"
                      }`}
                    >
                      {l.label}
                    </Link>
                  ))}
                </div>
              </div>
            )}

            <div
              className="reveal mt-10 flex items-center justify-between gap-4"
              style={{ ["--i" as string]: 7 }}
            >
              <span className="text-sm text-muted truncate">{session.user.name}</span>
              <button
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="h-11 inline-flex items-center gap-2 rounded-full px-5 text-sm font-medium bg-ink text-white active:scale-[0.98] transition-transform duration-300 ease-fluid"
              >
                <SignOut size={18} weight="light" />
                Вийти
              </button>
            </div>
          </nav>
        </div>
      )}

      {/* Click-away layer for the admin dropdown */}
      {adminOpen && (
        <button
          type="button"
          aria-hidden="true"
          tabIndex={-1}
          className="fixed inset-0 cursor-default"
          onClick={() => setAdminFor(null)}
        />
      )}

      <div
        onPointerMove={trackLight}
        className="glass mx-auto max-w-6xl h-14 sm:h-16 flex items-center gap-2 rounded-full pl-5 sm:pl-6 pr-2"
      >
        <Link href="/" className="flex items-center shrink-0 mr-2 lg:mr-4" aria-label="LUXEL, на головну">
          <Image src="/brand/logo.png" alt="LUXEL" width={84} height={26} priority />
        </Link>

        {/* Desktop navigation */}
        <nav className="hidden md:flex items-center gap-0.5 flex-1 min-w-0" aria-label="Основне меню">
          {CLIENT_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`h-10 inline-flex items-center rounded-full px-3.5 lg:px-4 text-[14px] font-medium whitespace-nowrap transition-colors duration-300 ease-fluid ${
                isActive(l.href)
                  ? "bg-white/80 text-ink shadow-[0_1px_2px_rgba(16,17,20,0.06),inset_0_1px_0_rgba(255,255,255,0.9)]"
                  : "text-ink/60 hover:text-ink hover:bg-white/50"
              }`}
            >
              {l.label}
            </Link>
          ))}

          {isAdmin && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setAdminFor(adminOpen ? null : pathname)}
                aria-expanded={adminOpen}
                aria-haspopup="menu"
                className={`h-10 inline-flex items-center gap-1.5 rounded-full px-3.5 lg:px-4 text-[14px] font-medium whitespace-nowrap transition-colors duration-300 ease-fluid ${
                  adminActive || adminOpen
                    ? "bg-white/80 text-ink shadow-[0_1px_2px_rgba(16,17,20,0.06),inset_0_1px_0_rgba(255,255,255,0.9)]"
                    : "text-ink/60 hover:text-ink hover:bg-white/50"
                }`}
              >
                Адмінка
                <CaretDown
                  size={14}
                  weight="bold"
                  className={`transition-transform duration-500 ease-fluid ${adminOpen ? "rotate-180" : ""}`}
                />
              </button>

              {adminOpen && (
                <div className="reveal absolute left-0 top-full mt-3 w-60 rounded-[1.5rem] glass glass-strong p-1.5">
                  <div role="menu">
                    {ADMIN_LINKS.map((l) => {
                      const active = l.href === "/admin" ? pathname === "/admin" : isActive(l.href);
                      return (
                        <Link
                          key={l.href}
                          href={l.href}
                          role="menuitem"
                          className={`flex items-center h-10 rounded-full px-4 text-[14px] transition-colors duration-300 ease-fluid ${
                            active ? "bg-white/90 text-ink font-medium" : "text-ink/75 hover:bg-white/60 hover:text-ink"
                          }`}
                        >
                          {l.label}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </nav>

        <div className="ml-auto flex items-center gap-1.5 shrink-0">
          <Link
            href="/cart"
            aria-label={totalQty > 0 ? `Кошик, товарів: ${totalQty}` : "Кошик"}
            className={`relative h-10 sm:h-11 inline-flex items-center gap-2 rounded-full pl-3 pr-3 sm:pr-4 text-[14px] font-medium transition-all duration-300 ease-fluid active:scale-[0.98] ${
              cartActive ? "bg-ink text-white" : "bg-white/60 text-ink hover:bg-white/90 ring-1 ring-white/70"
            }`}
          >
            <ShoppingBag size={20} weight="light" />
            <span className="hidden sm:inline">Кошик</span>
            {totalQty > 0 && (
              <span
                key={totalQty}
                className={`pop min-w-[20px] h-5 px-1.5 rounded-full text-[11px] leading-5 text-center font-semibold tabular ${
                  cartActive ? "bg-white text-ink" : "bg-brand text-white"
                }`}
              >
                {totalQty}
              </span>
            )}
          </Link>

          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            aria-label="Вийти"
            title={`Вийти (${session.user.name ?? ""})`}
            className="hidden md:inline-flex w-11 h-11 items-center justify-center rounded-full text-muted hover:text-ink hover:bg-ink/[0.05] transition-colors duration-300 ease-fluid"
          >
            <SignOut size={20} weight="light" />
          </button>

          {/* Hamburger that morphs into an X */}
          <button
            type="button"
            onClick={() => setMobileFor(mobileOpen ? null : pathname)}
            aria-expanded={mobileOpen}
            aria-label={mobileOpen ? "Закрити меню" : "Відкрити меню"}
            className="md:hidden relative w-10 h-10 rounded-full bg-white/60 ring-1 ring-white/70 text-ink"
          >
            <span
              className={`absolute left-1/2 top-1/2 h-[1.5px] w-4 -translate-x-1/2 bg-current rounded-full transition-transform duration-500 ease-fluid ${
                mobileOpen ? "rotate-45" : "-translate-y-[4px]"
              }`}
            />
            <span
              className={`absolute left-1/2 top-1/2 h-[1.5px] w-4 -translate-x-1/2 bg-current rounded-full transition-transform duration-500 ease-fluid ${
                mobileOpen ? "-rotate-45" : "translate-y-[4px]"
              }`}
            />
          </button>
        </div>
      </div>
    </header>
  );
}
