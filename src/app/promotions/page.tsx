"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";

type ProductImage = { id: string; url: string };
type Product = {
  id: string;
  name: string;
  price: number;
  category: string | null;
  isPromo: boolean;
  promoText: string | null;
  isActive: boolean;
  images: ProductImage[];
};
type PromoCode = {
  code: string;
  type: "PERCENT" | "FIXED";
  value: number;
  expiresAt: string | null;
};

export default function PromotionsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [codes, setCodes] = useState<PromoCode[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [productsRes, codesRes] = await Promise.all([
        fetch("/api/products"),
        fetch("/api/promotions"),
      ]);
      const allProducts: Product[] = await productsRes.json();
      setProducts(allProducts.filter((p) => p.isPromo));
      setCodes(await codesRes.json());
      setLoading(false);
    })();
  }, []);

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="max-w-6xl mx-auto w-full px-4 py-6 flex-1">
        <h1 className="text-lg font-semibold text-slate-900 mb-1">Акції</h1>
        <p className="text-sm text-slate-500 mb-6">
          Актуальні знижки, промокоди та акційні товари.
        </p>

        {loading ? (
          <p className="text-sm text-slate-500">Завантаження...</p>
        ) : (
          <div className="space-y-8">
            <section>
              <h2 className="text-sm font-semibold text-slate-900 mb-3">Промокоди</h2>
              {codes.length === 0 ? (
                <p className="text-sm text-slate-400">
                  Наразі активних промокодів немає.
                </p>
              ) : (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {codes.map((c) => (
                    <div
                      key={c.code}
                      className="border border-brand/20 bg-red-50 rounded-xl p-4 flex flex-col"
                    >
                      <span className="font-mono text-base font-semibold text-brand mb-1">
                        {c.code}
                      </span>
                      <span className="text-sm text-slate-700">
                        {c.type === "PERCENT" ? `Знижка ${c.value}%` : `Знижка ${c.value} ₴`}
                      </span>
                      {c.expiresAt && (
                        <span className="text-xs text-slate-500 mt-1">
                          Діє до {new Date(c.expiresAt).toLocaleDateString("uk-UA")}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section>
              <h2 className="text-sm font-semibold text-slate-900 mb-3">Акційні товари</h2>
              {products.length === 0 ? (
                <p className="text-sm text-slate-400">
                  Наразі товарів з акційною позначкою немає.
                </p>
              ) : (
                <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
                  {products.map((p) => (
                    <div
                      key={p.id}
                      className="border border-slate-200 bg-white rounded-xl overflow-hidden flex flex-col"
                    >
                      <div className="aspect-square bg-slate-100 relative">
                        {p.images[0] ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={p.images[0].url}
                            alt={p.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-slate-300 text-xs">
                            немає фото
                          </div>
                        )}
                        <span className="absolute top-2 left-2 bg-brand text-white text-xs px-2 py-0.5 rounded-full">
                          Акція
                        </span>
                      </div>
                      <div className="p-3 flex-1 flex flex-col">
                        <h3 className="text-sm font-medium text-slate-900">{p.name}</h3>
                        {p.promoText && (
                          <p className="text-xs text-brand mt-1">{p.promoText}</p>
                        )}
                        <div className="mt-auto pt-2 text-sm font-semibold text-slate-900">
                          {p.price.toLocaleString("uk-UA")} ₴
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {products.length > 0 && (
                <div className="mt-4">
                  <Link href="/" className="text-sm text-brand hover:underline">
                    Перейти в каталог, щоб оформити замовлення →
                  </Link>
                </div>
              )}
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
