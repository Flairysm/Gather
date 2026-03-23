import { createContext, useContext } from "react";
import type { Listing } from "./market";

export type CartItem = {
  listing: Listing;
  quantity: number;
  addedAt: number;
};

export type CartContextValue = {
  items: CartItem[];
  addItem: (listing: Listing, quantity?: number) => void;
  setQuantity: (listingId: string, quantity: number) => void;
  removeItem: (listingId: string) => void;
  clearCart: () => void;
  isInCart: (listingId: string) => boolean;
  total: () => string;
};

export const CartContext = createContext<CartContextValue>({
  items: [],
  addItem: () => {},
  setQuantity: () => {},
  removeItem: () => {},
  clearCart: () => {},
  isInCart: () => false,
  total: () => "$0",
});

export function useCart() {
  return useContext(CartContext);
}

export function parsePrice(price: string | number): number {
  if (typeof price === "number") return price;
  return parseFloat(price.replace(/[$,]/g, "")) || 0;
}

export function formatPrice(amount: number): string {
  return `$${amount.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}
