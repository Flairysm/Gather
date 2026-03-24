export type Listing = {
  id: string;
  seller_id: string;
  card_name: string;
  edition: string | null;
  grade: string | null;
  condition: string | null;
  price: number;
  quantity: number;
  category: string;
  description: string | null;
  images: string[];
  views: number;
  status: string;
  created_at: string;
  seller?: {
    username: string | null;
    display_name: string | null;
    rating: number | null;
    total_sales: number | null;
    avatar_url: string | null;
  };
};

export type WantedPost = {
  id: string;
  buyer_id: string;
  card_name: string;
  edition: string | null;
  grade_wanted: string | null;
  offer_price: number;
  category: string;
  description: string | null;
  image_url: string | null;
  views: number;
  status: string;
  created_at: string;
  buyer?: {
    username: string | null;
    display_name: string | null;
    rating: number | null;
    total_purchases: number | null;
    avatar_url: string | null;
  };
};

export const MARKET_FILTERS = ["All", "Pokémon", "MTG", "Sports", "YGO"];

export function formatListingPrice(price: number): string {
  return `$${price.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}
