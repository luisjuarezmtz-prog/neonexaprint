import React, { createContext, useContext, useEffect, useState } from 'react';

const CartCtx = createContext(null);
const KEY = 'nx_cart_v1';

export function CartProvider({ children }) {
  const [items, setItems] = useState(() => {
    try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; }
  });

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(items)); } catch { /* ignore */ }
  }, [items]);

  const add = (item) => setItems((p) => [...p, { ...item, id: crypto.randomUUID() }]);
  const remove = (id) => setItems((p) => p.filter((i) => i.id !== id));
  const clear = () => setItems([]);
  const subtotal = items.reduce((s, i) => s + (Number(i.subtotal) || 0), 0);

  return (
    <CartCtx.Provider value={{ items, add, remove, clear, subtotal, count: items.length }}>
      {children}
    </CartCtx.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartCtx);
  if (!ctx) throw new Error('useCart must be inside CartProvider');
  return ctx;
}
