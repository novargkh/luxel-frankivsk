"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import type { Session } from "next-auth";
import { CaretDown, CaretRight, ShoppingBag, SignOut, Ticket, UserCircle } from "@phosphor-icons/react";
import { useCart } from "@/lib/cart";
import TabBar from "@/components/TabBar";
import Inbox from "@/components/Inbox";
import Contacts from "@/components/Contacts";
import { PromoCard, usePromoWallet } from "@/components/PromoWallet";

const CLIENT_LINKS = [
  { href: "/", label: "Каталог" },
  { href: "/promotions", label: "Акції" },
  { href: "/orders", label: "Мої замовлення" },
  { href: "/returns", label: "Повернення" },
];

const ADMIN_LINKS = [
  { href: "/admin", label: "Огляд" },
  { href: "/admin/products", label: "Товари" },
  { href: "/admin/clients", label: "Клієнти" },
  { href: "/admin/routes", label: "Маршрути" },
  { href: "/admin/coverage", label: "Покриття" },
  { href: "/admin/promocodes", label: "Промокоди" },
  { href: "/admin/announcements", label: "Сповіщення" },
  { href: "/returns", label: "Повернення" },
];

// Moves the glass highlight to follow the pointer (CSS vars, no re-render).
function trackLight(e: PointerEvent<HTMLElement>) {
  const el = e.currentTarget;
  const r = el.getBoundingClientRect();
  el.style.setProperty("--mx", `${((e.clientX - r.left) / r.width) * 100}%`);
  el.style.setProperty("--my", `${((e.clientY - r.top) / r.height) * 100}%`);
}

export default function Navbar() {
  const { data: session } = useSession();
  if (!session?.user) return null;
  return <NavbarInner session={session} />;
}

// Floating "island" navigation: a glass pill detached from the top edge.
// The menu button (two lines) opens the account menu: profile, admin
// links, the client's available promo codes and sign out. It is a full
// glass sheet on phones and a dropdown on larger screens.
function NavbarInner({ session }: { session: Session }) {
  const user = session.user!;
  const pathname = usePathname();
  const { totalQty } = useCart();
  const userKey = user.email ?? user.name ?? "user";
  const role0 = (user as { role?: string }).role;
  const walletRaw = usePromoWallet(userKey);
  // Admins don't get the promo wallet / its attention indicator.
  const wallet = role0 === "ADMIN" ? { ...walletRaw, newCount: 0 } : walletRaw;
  // Menus are "open for" a specific path, so navigating anywhere else
  // closes them automatically without an effect.
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [adminFor, setAdminFor] = useState<string | null>(null);
  const menuOpen = menuFor === pathname;
  const adminOpen = adminFor === pathname;
  // Promo ids that were new when the menu was opened (to label them).
  const [freshIds, setFreshIds] = useState<Set<string>>(new Set());
  const menuRef = useRef<HTMLDivElement>(null);
  const menuBtnRef = useRef<HTMLButtonElement>(null);

  const role = (user as { role?: string }).role;
  const isAdmin = role === "ADMIN";

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: globalThis.PointerEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || menuBtnRef.current?.contains(t)) return;
      setMenuFor(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuFor(null);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  function toggleMenu() {
    if (menuOpen) {
      setMenuFor(null);
      return;
    }
    setFreshIds(new Set(wallet.promos.filter((p) => wallet.isNew(p.id)).map((p) => p.id)));
    wallet.markSeen();
    setMenuFor(pathname);
  }

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
  const adminActive = pathname.startsWith("/admin");
  const cartActive = pathname === "/cart";
  const showPromos = !isAdmin;

  return (
    <header className="sticky top-0 z-40 no-print px-3 sm:px-6 pt-3">
      {/* Account menu: full glass sheet on phones, dropdown from md up */}
      {menuOpen && (
        <div
          ref={menuRef}
          className="fixed inset-0 glass glass-strong !border-0 rounded-none overflow-y-auto md:absolute md:inset-auto md:top-full md:mt-3 md:right-[max(1.5rem,calc((100%-72rem)/2))] md:w-[26rem] md:max-h-[calc(100dvh-7rem)] md:rounded-[1.75rem] md:!border reveal"
        >
          <nav className="px-6 pt-28 pb-12 md:p-5" aria-label="Меню">
            <p className="text-[32px] md:text-2xl leading-tight font-semibold tracking-[-0.03em] text-ink">
              {user.name}
            </p>

            <div className="mt-6 space-y-1.5">
              <Link
                href="/profile"
                className="flex items-center gap-3 h-14 rounded-2xl bg-white/80 ring-1 ring-white px-4 text-[17px] md:text-[15px] font-medium text-ink active:scale-[0.98] transition-transform duration-300 ease-fluid"
              >
                <UserCircle size={22} weight="light" />
                Профіль
                <CaretRight size={14} weight="bold" className="ml-auto text-muted" />
              </Link>
            </div>

            {isAdmin && (
              <div className="mt-8">
                <p className="text-sm font-medium text-muted mb-2">Адміністрування</p>
                <div className="grid grid-cols-2 gap-x-4">
                  {ADMIN_LINKS.map((l) => (
                    <Link
                      key={l.href}
                      href={l.href}
                      className={`py-2 text-[17px] md:text-[15px] ${
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

            {showPromos && (
              <section className="mt-8" aria-label="Доступні промокоди">
                <h2 className="flex items-center gap-2 text-sm font-medium text-muted mb-2">
                  <Ticket size={16} weight="light" />
                  Доступні промокоди
                </h2>
                {wallet.promos.length === 0 ? (
                  <p className="rounded-[1.25rem] bg-white/70 ring-1 ring-white px-4 py-4 text-sm text-muted">
                    Поки що промокодів немає. Коли менеджер видасть вам промокод, він з&apos;явиться тут.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {wallet.promos.map((p, i) => (
                      <PromoCard key={p.id} promo={p} fresh={freshIds.has(p.id)} index={i} />
                    ))}
                  </ul>
                )}
              </section>
            )}

            <div className="mt-10 md:mt-6">
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
              className={`h-10 inline-flex items-center rounded-full px-3 lg:px-4 text-[14px] font-medium whitespace-nowrap transition-colors duration-300 ease-fluid ${
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
                className={`h-10 inline-flex items-center gap-1.5 rounded-full px-3 lg:px-4 text-[14px] font-medium whitespace-nowrap transition-colors duration-300 ease-fluid ${
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
                <div className="reveal absolute left-0 top-full mt-3 w-60 rounded-[1.5rem] glass glass-strong bg-white/[0.97] p-1.5">
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
          {/* Quick order with AI: voice / photo / text */}
          {/* Pressed = on the quick-order page; pressing again goes back to
              the catalog. */}
          <Link
            href={pathname === "/quick-order" ? "/" : "/quick-order"}
            aria-pressed={pathname === "/quick-order"}
            aria-label="Швидке замовлення з AI: голос, фото, текст"
            title="Швидке замовлення з AI: голос, фото, текст"
            aria-current={pathname === "/quick-order" ? "page" : undefined}
            className={`relative h-10 sm:h-11 min-w-10 sm:min-w-11 shrink-0 inline-flex items-center justify-center gap-2 rounded-full xl:pl-1.5 xl:pr-4 transition-all duration-300 ease-fluid active:scale-95 ${
              pathname === "/quick-order"
                ? "bg-white text-ink ring-2 ring-[#c7c3ff]"
                : "bg-white/60 ring-1 ring-white/70 text-ink hover:bg-white/90"
            }`}
          >
            <span className="ai-orb inline-flex items-center justify-center w-7 h-7 xl:w-8 xl:h-8 rounded-full text-[11px] font-bold tracking-[0.02em] text-white">
              AI
            </span>
            <span className="hidden xl:inline text-[14px] font-medium whitespace-nowrap">Швидке замовлення</span>
          </Link>
          <Contacts />
          <Inbox userKey={userKey} />
          <Link
            href="/cart"
            aria-label={totalQty > 0 ? `Кошик, товарів: ${totalQty}` : "Кошик"}
            className={`relative h-10 sm:h-11 hidden md:inline-flex items-center gap-2 rounded-full pl-3 pr-3 sm:pr-4 text-[14px] font-medium transition-all duration-300 ease-fluid active:scale-[0.98] ${
              cartActive ? "bg-ink text-white" : "bg-white/60 text-ink hover:bg-white/90 ring-1 ring-white/70"
            }`}
          >
            <ShoppingBag size={20} weight="light" />
            <span className="hidden lg:inline">Кошик</span>
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

          {/* Menu button: two lines that morph into an X. Pulses when new
              promo codes are waiting inside. */}
          <button
            ref={menuBtnRef}
            type="button"
            onClick={toggleMenu}
            aria-expanded={menuOpen}
            aria-label={
              menuOpen
                ? "Закрити меню"
                : wallet.newCount > 0
                  ? `Відкрити меню, нових промокодів: ${wallet.newCount}`
                  : "Відкрити меню"
            }
            className={`relative w-10 h-10 sm:w-11 sm:h-11 rounded-full text-ink ${
              menuOpen ? "bg-white ring-1 ring-white" : "bg-white/60 ring-1 ring-white/70 hover:bg-white/90"
            }`}
          >
            {wallet.newCount > 0 && !menuOpen && (
              <span key={`r-${wallet.arrival}`} aria-hidden="true" className="env-ripple absolute inset-0 rounded-full" />
            )}
            <span
              key={`s-${wallet.arrival}`}
              className={`absolute inset-0 ${wallet.newCount > 0 && !menuOpen ? "env-shake" : ""}`}
            >
              <span
                className={`absolute left-1/2 top-1/2 h-[1.5px] w-4 -translate-x-1/2 bg-current rounded-full transition-transform duration-500 ease-fluid ${
                  menuOpen ? "rotate-45" : "-translate-y-[4px]"
                }`}
              />
              <span
                className={`absolute left-1/2 top-1/2 h-[1.5px] w-4 -translate-x-1/2 bg-current rounded-full transition-transform duration-500 ease-fluid ${
                  menuOpen ? "-rotate-45" : "translate-y-[4px]"
                }`}
              />
            </span>
            {wallet.newCount > 0 && !menuOpen && (
              <span className="pop absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-brand text-white text-[10px] leading-[18px] text-center font-semibold tabular ring-2 ring-white">
                {wallet.newCount}
              </span>
            )}
          </button>
        </div>
      </div>
      <TabBar />
    </header>
  );
}
