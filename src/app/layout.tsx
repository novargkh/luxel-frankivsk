import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import "./globals.css";
import SessionProviderWrapper from "@/components/SessionProviderWrapper";
import { CartProvider } from "@/lib/cart";
import ViewportFix from "@/components/ViewportFix";

export const metadata: Metadata = {
  title: "LUXEL | Особистий кабінет клієнта",
  description: "Каталог товарів, залишки, акції та замовлення",
  icons: { icon: "/brand/logo.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#eef0f4",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="uk" className={`antialiased ${GeistSans.variable}`}>
      <body className="min-h-dvh flex flex-col bg-background font-sans">
        {/* Ambient light behind the glass surfaces (decorative) */}
        <div className="ambient" aria-hidden="true">
          <span className="a1" />
          <span className="a2" />
          <span className="a3" />
        </div>
        <ViewportFix />
        <SessionProviderWrapper>
          <CartProvider>{children}</CartProvider>
        </SessionProviderWrapper>
      </body>
    </html>
  );
}
