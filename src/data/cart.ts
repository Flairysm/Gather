import { createContext, useContext } from "react";
import type { Listing } from "./market";

export type CartItem = {
  listing: Listing;
  quantity: number;
  addedAt: number;
  // Set when this item came from an accepted negotiation offer. The agreed price
  // lives in `listing.price`; the server re-validates this offer and charges that
  // exact amount at checkout (see create_card_checkout).
  offerId?: string;
};

export type CartContextValue = {
  items: CartItem[];
  addItem: (listing: Listing, quantity?: number, offerId?: string) => void;
  setQuantity: (listingId: string, quantity: number) => void;
  removeItem: (listingId: string) => void;
  clearCart: () => void;
  isInCart: (listingId: string) => boolean;
  total: () => string;
  selectedIds: Set<string>;
  toggleSelected: (listingId: string) => void;
  selectAll: () => void;
  deselectAll: () => void;
  selectedItems: () => CartItem[];
  selectedTotal: () => string;
  allSelected: boolean;
};

export const CartContext = createContext<CartContextValue>({
  items: [],
  addItem: () => {},
  setQuantity: () => {},
  removeItem: () => {},
  clearCart: () => {},
  isInCart: () => false,
  total: () => "RM0",
  selectedIds: new Set(),
  toggleSelected: () => {},
  selectAll: () => {},
  deselectAll: () => {},
  selectedItems: () => [],
  selectedTotal: () => "RM0",
  allSelected: false,
});

export function useCart() {
  return useContext(CartContext);
}

export function parsePrice(price: string | number): number {
  if (typeof price === "number") return price;
  const cleaned = price.replace(/(RM|\$|,)/gi, "");
  return parseFloat(cleaned) || 0;
}

export function formatPrice(amount: number): string {
  return `RM${amount.toLocaleString("en-MY", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}
