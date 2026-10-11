"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowUUpLeft,
  Receipt,
  ShoppingBag,
  SquaresFour,
  Tag,
  type Icon,
} from "@phosphor-icons/react";
import { useCart } from "@/lib/cart";

const TABS: { href: string; label: string; icon: Icon }[] = [
  { href: "/", label: "Каталог", icon: SquaresFour },
  { href: "/promotions", label: "Акції", icon: Tag },
  { href: "/cart", label: "Кошик", icon: ShoppingBag },
  { href: "/orders", label: "Замовлення", icon: Receipt },
  // Profile lives in the top menu (hamburger) on phones.
  { href: "/returns", label: "Повернення", icon: ArrowUUpLeft },
];

// Mobile bottom tab bar: a floating Liquid Glass (web approximation) pill
// with a glass "lens" that slides to the active tab and squishes as it
// lands. Hidden from md up, where the top navigation has room for links.
export default function TabBar() {
  const pathname = usePathname();
  const { totalQty } = useCart();

  const activeIndex = TABS.findIndex((t) =>
    t.href === "/" ? pathname === "/" : pathname === t.href || pathname.startsWith(`${t.href}/`)
  );

  return (
    <nav
      aria-label="Нижнє меню"
      className="md:hidden no-print fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(env(safe-area-inset-bottom),12px)] pointer-events-none"
    >
      <div className="glass pointer-events-auto mx-auto max-w-md h-16 rounded-full p-1.5">
        <div className="relative grid grid-cols-5 h-full">
          {/* Sliding glass lens behind the active tab */}
          {activeIndex >= 0 && (
            <div
              aria-hidden="true"
              className="absolute inset-y-0 left-0 w-1/5 transition-transform duration-700 ease-fluid"
              style={{ transform: `translateX(${activeIndex * 100}%)` }}
            >
              <div
                key={activeIndex}
                className="lens-squish h-full mx-0.5 rounded-full bg-white/90 shadow-[0_1px_2px_rgba(16,17,20,0.08),0_8px_20px_-8px_rgba(16,17,20,0.25),inset_0_1px_0_rgba(255,255,255,1)]"
              />
            </div>
          )}

          {TABS.map((t, i) => {
            const active = i === activeIndex;
            const TabIcon = t.icon;
            return (
              <Link
                key={t.href}
                href={t.href}
                aria-current={active ? "page" : undefined}
                aria-label={
                  t.href === "/cart" && totalQty > 0 ? `${t.label}, товарів: ${totalQty}` : t.label
                }
                className="group relative z-10 flex flex-col items-center justify-center gap-0.5 rounded-full"
              >
                <span className="relative transition-transform duration-300 ease-fluid group-active:scale-90">
                  <TabIcon
                    size={24}
                    weight={active ? "fill" : "regular"}
                    className={`transition-colors duration-300 ease-fluid ${
                      active ? "text-brand" : "text-ink/70"
                    }`}
                  />
                  {t.href === "/cart" && totalQty > 0 && (
                    <span
                      key={totalQty}
                      className="pop absolute -top-1.5 -right-2.5 min-w-[18px] h-[18px] px-1 rounded-full bg-brand text-white text-[10px] leading-[18px] text-center font-semibold tabular ring-2 ring-white"
                    >
                      {totalQty > 99 ? "99+" : totalQty}
                    </span>
                  )}
                </span>
                <span
                  className={`text-[10px] leading-none font-medium tracking-[-0.01em] transition-colors duration-300 ease-fluid ${
                    active ? "text-ink" : "text-ink/60"
                  }`}
                >
                  {t.label}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
