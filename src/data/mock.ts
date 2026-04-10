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
