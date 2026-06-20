export type CategoryDef = {
  key: string;
  label: string;
};

export const ALL_CATEGORIES: CategoryDef[] = [
  { key: "Pokémon", label: "Pokémon" },
  { key: "MTG", label: "Magic: The Gathering" },
  { key: "Sports", label: "Sports Cards" },
  { key: "YGO", label: "Yu-Gi-Oh!" },
];

export const CATEGORY_MAP = Object.fromEntries(
  ALL_CATEGORIES.map((c) => [c.key, c]),
);
