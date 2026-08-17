"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type CartState = Record<string, number>; // productId -> quantity

type CartContextValue = {
  cart: CartState;
  setQty: (productId: string, qty: number) => void;
  addOne: (productId: string) => void;
  remove: (productId: string) => void;
  clear: () => void;
  count: number; // total distinct items
  totalQty: number; // total units
};

const CartContext = createContext<CartContextValue | null>(null);

const STORAGE_KEY = "luxel-cart-v1";

export function CartProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<CartState>({});
  const [hydrated, setHydrated] = useState(false);

  // Load from localStorage once on mount (client-only).
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setCart(JSON.parse(raw));
    } catch {
      // ignore corrupt storage
    }
    setHydrated(true);
  }, []);

  // Persist on every change, after initial hydration.
  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
    } catch {
      // ignore quota errors
    }
  }, [cart, hydrated]);

  function setQty(productId: string, qty: number) {
    setCart((prev) => {
      const next = { ...prev };
      if (qty <= 0) {
        delete next[productId];
      } else {
        next[productId] = qty;
      }
      return next;
    });
  }

  function addOne(productId: string) {
    setCart((prev) => ({ ...prev, [productId]: (prev[productId] ?? 0) + 1 }));
  }

  function remove(productId: string) {
    setCart((prev) => {
      const next = { ...prev };
      delete next[productId];
      return next;
    });
  }

  function clear() {
    setCart({});
  }

  const { count, totalQty } = useMemo(() => {
    const values = Object.values(cart);
    return {
      count: values.length,
      totalQty: values.reduce((s, q) => s + q, 0),
    };
  }, [cart]);

  return (
    <CartContext.Provider value={{ cart, setQty, addOne, remove, clear, count, totalQty }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
