import type { Ionicons } from "@expo/vector-icons";

export type CategoryDef = {
  key: string;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  color: string;
};

export const ALL_CATEGORIES: CategoryDef[] = [
  { key: "Pokémon", label: "Pokémon", icon: "flash", color: "#F59E0B" },
  { key: "MTG", label: "Magic: The Gathering", icon: "sparkles", color: "#8B5CF6" },
  { key: "Sports", label: "Sports Cards", icon: "football", color: "#22C55E" },
  { key: "YGO", label: "Yu-Gi-Oh!", icon: "eye", color: "#3B82F6" },
];

export const CATEGORY_MAP = Object.fromEntries(
  ALL_CATEGORIES.map((c) => [c.key, c]),
);
