'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import type { Product } from '@/lib/products';

// The imageUrl in CartItem is optional because the base Product type might change.
// We only need one image for the cart display.
export interface CartItem extends Omit<Product, 'imageUrls'> {
  lineId: string;
  quantity: number;
  imageUrl: string; // The single image URL for the cart
}

export function cartLineId(product: Pick<Product, 'id'|'selectedWeight'|'customizationNote'>) {
  return product.id + '::' + encodeURIComponent(JSON.stringify([product.selectedWeight?.value ?? null, product.selectedWeight?.unit ?? null, (product.customizationNote || '').trim()]));
}

interface CartContextType {
  cartItems: CartItem[];
  addToCart: (product: Product, quantity?: number) => void;
  updateLinePrice: (lineId: string, price: number) => void;
  removeFromCart: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  cartCount: number;
  hydrated: boolean;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export const CartProvider = ({ children }: { children: ReactNode }) => {
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => { try { const saved = localStorage.getItem('treatstory-cart-v2') || localStorage.getItem('treatstory-cart-v1'); if (saved) { const parsed = JSON.parse(saved); if (Array.isArray(parsed)) setCartItems(parsed.filter((item: CartItem) => item && typeof item.id === 'string' && Number.isInteger(item.quantity) && item.quantity > 0).slice(0, 100).map((item: CartItem) => ({ ...item, lineId: item.lineId || cartLineId(item) }))); } } catch {} finally { setHydrated(true); } }, []);
  useEffect(() => { if (hydrated) { try { localStorage.setItem('treatstory-cart-v2', JSON.stringify(cartItems)); localStorage.removeItem('treatstory-cart-v1'); } catch {} } }, [cartItems, hydrated]);

  const addToCart = (product: Product, quantity = 1) => {
    if (!Number.isInteger(quantity) || quantity < 1) return;
    const key = cartLineId(product);
    setCartItems(prev => {
      const match = prev.find(item => item.lineId === key);
      if (match) return prev.map(item => item.lineId === key ? { ...item, price: product.price, quantity: Math.min(99, item.quantity + quantity) } : item);
      const { imageUrls, ...rest } = product;
      return [...prev, { ...rest, lineId: key,
        imageUrl: imageUrls?.[0] || '/img/product-placeholder.svg',
        quantity: Math.min(99, Math.max(product.minimumOrderQuantity ?? 1, quantity)),
      }];
    });
  };
  const removeFromCart = (key: string) => {
    setCartItems(items => items.filter(item => item.lineId !== key && item.id !== key));
  };
  const updateQuantity = (key: string, quantity: number) => {
    if (!Number.isInteger(quantity)) return;
    if (quantity <= 0) return removeFromCart(key);
    setCartItems(items => items.map(item => item.lineId === key || item.id === key
      ? { ...item, quantity: Math.min(99, Math.max(item.minimumOrderQuantity ?? 1, quantity)) } : item));
  };
  const updateLinePrice = (key: string, price: number) => {
    if (!Number.isFinite(price) || price < 0) return;
    setCartItems(items => items.map(item => item.lineId === key ? { ...item, price } : item));
  };

  const clearCart = () => {
    setCartItems([]);
  };

  const cartCount = cartItems.reduce((count, item) => count + item.quantity, 0);

  return (
    <CartContext.Provider
      value={{
        cartItems,
        hydrated,
        addToCart,
        updateLinePrice,
        removeFromCart,
        updateQuantity,
        clearCart,
        cartCount,
      }}
    >
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
};
