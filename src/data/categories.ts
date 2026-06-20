export type CategoryDef = {
  key: string;
  label: string;
};

export const ALL_CATEGORIES: CategoryDef[] = [
  { key: "Pokémon", label: "Pokémon" },
  { key: "MTG", label: "Magic: The Gathering" },
  { key: "YGO", label: "Yu-Gi-Oh!" },
  { key: "One Piece", label: "One Piece" },
  { key: "Lorcana", label: "Disney Lorcana" },
  { key: "Dragon Ball", label: "Dragon Ball" },
  { key: "Digimon", label: "Digimon" },
  { key: "Sports", label: "Sports Cards" },
  { key: "Others", label: "Others" },
];

export const CATEGORY_MAP = Object.fromEntries(
  ALL_CATEGORIES.map((c) => [c.key, c]),
);
