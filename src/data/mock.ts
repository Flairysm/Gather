export type StreamCard = {
  id: string;
  edition: string;
  name: string;
  price: string;
};

export type VaultCard = {
  id: string;
  badge: string;
  edition: string;
  name: string;
  price: string;
  trend: string;
  trendUp: boolean;
};

export type FilterItem = {
  label: string;
  isSeeAll?: boolean;
};

export const FILTERS: FilterItem[] = [
  { label: "For You" },
  { label: "Pokémon" },
  { label: "MTG" },
  { label: "Sports" },
  { label: "YGO" },
  { label: "See All Categories", isSeeAll: true },
];

export const streamFeatured: StreamCard[] = [
  { id: "sf1", edition: "1999 Base Set", name: "Charizard Holo", price: "RM8,240" },
  { id: "sf2", edition: "Topps Chrome", name: "Shohei Ohtani RC", price: "RM4,120" },
];

export const vaultCards: VaultCard[] = [
  {
    id: "v1",
    badge: "GEM MT 10",
    edition: "Alpha Edition",
    name: "Black Lotus",
    price: "RM124,500",
    trend: "+2.1%",
    trendUp: true,
  },
  {
    id: "v2",
    badge: "PSA 10",
    edition: "2020 Nat Treasures",
    name: "Joe Burrow RPA",
    price: "RM14,800",
    trend: "+1.3%",
    trendUp: true,
  },
  {
    id: "v3",
    badge: "BGS 9.5",
    edition: "1st Edition Base",
    name: "Charizard Holo",
    price: "RM8,240",
    trend: "-0.8%",
    trendUp: false,
  },
];
