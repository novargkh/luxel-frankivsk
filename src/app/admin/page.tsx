"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";

type Product = { id: string; stock: number; isPromo: boolean; isActive: boolean };
type Order = { id: string; status: string };

export default function AdminDashboard() {
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);

  useEffect(() => {
    fetch("/api/products").then((r) => r.json()).then(setProducts);
    fetch("/api/orders").then((r) => r.json()).then(setOrders);
  }, []);

  const lowStock = products.filter((p) => p.isActive && p.stock <= 3).length;
  const newOrders = orders.filter((o) => o.status === "NEW").length;
  const promoCount = products.filter((p) => p.isPromo).length;

  const cards = [
    { label: "Товарів усього", value: products.length },
    { label: "Мало на складі (≤3)", value: lowStock },
    { label: "Нові замовлення", value: newOrders },
    { label: "Товарів в акції", value: promoCount },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="max-w-5xl mx-auto w-full px-4 py-6 flex-1">
        <h1 className="text-lg font-semibold text-slate-900 mb-4">Панель адміністратора</h1>

        <div className="grid sm:grid-cols-4 gap-3 mb-6">
          {cards.map((c) => (
            <div key={c.label} className="border border-slate-200 bg-white rounded-xl p-4">
              <div className="text-2xl font-semibold text-slate-900">{c.value}</div>
              <div className="text-xs text-slate-500 mt-1">{c.label}</div>
            </div>
          ))}
        </div>

        <div className="grid sm:grid-cols-3 gap-4">
          <Link
            href="/admin/products"
            className="border border-slate-200 bg-white rounded-xl p-5 hover:border-brand transition"
          >
            <h2 className="text-sm font-semibold text-slate-900 mb-1">
              Товари та залишки
            </h2>
            <p className="text-xs text-slate-500">
              Додавайте товари, оновлюйте залишки щоранку, завантажуйте фото та відео,
              позначайте акції.
            </p>
          </Link>

          <Link
            href="/admin/clients"
            className="border border-slate-200 bg-white rounded-xl p-5 hover:border-brand transition"
          >
            <h2 className="text-sm font-semibold text-slate-900 mb-1">Клієнти</h2>
            <p className="text-xs text-slate-500">
              Створюйте облікові записи клієнтів та переглядайте їхні магазини.
            </p>
          </Link>

          <Link
            href="/admin/routes"
            className="border border-slate-200 bg-white rounded-xl p-5 hover:border-brand transition"
          >
            <h2 className="text-sm font-semibold text-slate-900 mb-1">
              Маршрути доставки
            </h2>
            <p className="text-xs text-slate-500">
              Формуйте маршрут із замовлень на день, друкуйте погрузочний лист і
              відкривайте маршрут у Google Maps.
            </p>
          </Link>

          <Link
            href="/admin/coverage"
            className="border border-slate-200 bg-white rounded-xl p-5 hover:border-brand transition"
          >
            <h2 className="text-sm font-semibold text-slate-900 mb-1">Карта покриття</h2>
            <p className="text-xs text-slate-500">
              Усі точки клієнтів на одній карті та список з експортом у CSV.
            </p>
          </Link>

          <Link
            href="/admin/promocodes"
            className="border border-slate-200 bg-white rounded-xl p-5 hover:border-brand transition"
          >
            <h2 className="text-sm font-semibold text-slate-900 mb-1">Промокоди</h2>
            <p className="text-xs text-slate-500">
              Створюйте коди на знижку для розіграшів та акцій.
            </p>
          </Link>

          <Link
            href="/admin/announcements"
            className="border border-slate-200 bg-white rounded-xl p-5 hover:border-brand transition"
          >
            <h2 className="text-sm font-semibold text-slate-900 mb-1">Сповіщення</h2>
            <p className="text-xs text-slate-500">
              Розішліть повідомлення всім клієнтам — новини, акції, зміни графіка.
            </p>
          </Link>

          <Link
            href="/orders"
            className="border border-slate-200 bg-white rounded-xl p-5 hover:border-brand transition"
          >
            <h2 className="text-sm font-semibold text-slate-900 mb-1">Усі замовлення</h2>
            <p className="text-xs text-slate-500">
              Переглядайте та змінюйте статус замовлень від клієнтів.
            </p>
          </Link>
        </div>
      </main>
    </div>
  );
}
