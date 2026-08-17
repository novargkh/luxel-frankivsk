import type { Metadata } from "next";
import "./globals.css";
import SessionProviderWrapper from "@/components/SessionProviderWrapper";
import { CartProvider } from "@/lib/cart";

export const metadata: Metadata = {
  title: "LUXEL — Особистий кабінет клієнта",
  description: "Каталог товарів, залишки, акції та замовлення",
  icons: { icon: "/brand/logo.png" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="uk" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-slate-50 font-sans">
        <SessionProviderWrapper>
          <CartProvider>{children}</CartProvider>
        </SessionProviderWrapper>
      </body>
    </html>
  );
}
