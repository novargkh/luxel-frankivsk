"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { useCart } from "@/lib/cart";

export default function Navbar() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const { totalQty } = useCart();

  if (!session?.user) return null;

  const role = (session.user as { role?: string }).role;
  const isAdmin = role === "ADMIN";

  const linkClass = (href: string) =>
    `text-sm px-3 py-1.5 rounded-lg transition whitespace-nowrap ${
      pathname === href
        ? "bg-brand text-white"
        : "text-slate-600 hover:bg-slate-100"
    }`;

  return (
    <header className="border-b border-slate-200 bg-white sticky top-0 z-10 no-print">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-1 flex-wrap">
          <Link href="/" className="flex items-center mr-4">
            <Image src="/brand/logo.png" alt="LUXEL" width={92} height={28} priority />
          </Link>
          <Link href="/" className={linkClass("/")}>
            Каталог
          </Link>
          <Link href="/promotions" className={linkClass("/promotions")}>
            Акції
          </Link>
          <Link href="/cart" className={`${linkClass("/cart")} relative`}>
            Кошик
            {totalQty > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center min-w-[1.1rem] h-[1.1rem] px-1 rounded-full bg-white text-brand border border-brand text-[10px] leading-none align-middle font-semibold">
                {totalQty}
              </span>
            )}
          </Link>
          <Link href="/orders" className={linkClass("/orders")}>
            Мої замовлення
          </Link>
          <Link href="/profile" className={linkClass("/profile")}>
            Профіль
          </Link>
          {isAdmin && (
            <>
              <Link href="/admin" className={linkClass("/admin")}>
                Адмінка
              </Link>
              <Link href="/admin/products" className={linkClass("/admin/products")}>
                Товари
              </Link>
              <Link href="/admin/clients" className={linkClass("/admin/clients")}>
                Клієнти
              </Link>
              <Link href="/admin/routes" className={linkClass("/admin/routes")}>
                Маршрути
              </Link>
              <Link href="/admin/coverage" className={linkClass("/admin/coverage")}>
                Покриття
              </Link>
              <Link href="/admin/promocodes" className={linkClass("/admin/promocodes")}>
                Промокоди
              </Link>
              <Link
                href="/admin/announcements"
                className={linkClass("/admin/announcements")}
              >
                Сповіщення
              </Link>
            </>
          )}
        </div>

        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-500 hidden sm:inline">
            {session.user.name} {isAdmin && "(адмін)"}
          </span>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="text-sm text-slate-500 hover:text-slate-900 border border-slate-200 rounded-lg px-3 py-1.5"
          >
            Вийти
          </button>
        </div>
      </div>
    </header>
  );
}
