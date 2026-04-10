import { type ImageSourcePropType } from "react-native";

export type GradeOption = {
  value: string;
  label: string;
};

export type GradingCompany = {
  id: string;
  label: string;
  logo: ImageSourcePropType | null;
  grades: GradeOption[];
};

export type ConditionTier = {
  tier: string;
  title: string;
  shortTitle: string;
  description: string;
  color: string;
};

// ---------------------------------------------------------------------------
// Grading companies & their scales
// ---------------------------------------------------------------------------

export const GRADING_COMPANIES: GradingCompany[] = [
  {
    id: "RAW",
    label: "Ungraded",
    logo: null,
    grades: [],
  },
  {
    id: "PSA",
    label: "PSA",
    logo: require("../../assets/grading/psa.png"),
    grades: [
      { value: "10", label: "Gem Mint 10" },
      { value: "9", label: "Mint 9" },
      { value: "8", label: "NM-MT 8" },
      { value: "7", label: "NM 7" },
      { value: "6", label: "EX-MT 6" },
      { value: "5", label: "EX 5" },
      { value: "4", label: "VG-EX 4" },
      { value: "3", label: "VG 3" },
      { value: "2", label: "Good 2" },
      { value: "1", label: "PR 1" },
    ],
  },
  {
    id: "BGS",
    label: "Beckett",
    logo: require("../../assets/grading/beckett.png"),
    grades: [
      { value: "Black Label 10", label: "Black Label 10" },
      { value: "Pristine 10", label: "Pristine 10" },
      { value: "9.5", label: "Gem Mint 9.5" },
      { value: "9", label: "Mint 9" },
      { value: "8.5", label: "NM-M+ 8.5" },
      { value: "8", label: "NM-M 8" },
      { value: "7.5", label: "NM+ 7.5" },
      { value: "7", label: "NM 7" },
      { value: "6.5", label: "EX-NM+ 6.5" },
      { value: "6", label: "EX-NM 6" },
      { value: "5", label: "EX 5" },
      { value: "4", label: "VG-EX 4" },
      { value: "3", label: "VG 3" },
      { value: "2", label: "Good 2" },
      { value: "1.5", label: "Fair 1.5" },
      { value: "1", label: "PR 1" },
    ],
  },
  {
    id: "CGC",
    label: "CGC",
    logo: require("../../assets/grading/cgc.png"),
    grades: [
      { value: "Pristine 10", label: "Pristine 10" },
      { value: "10", label: "Gem Mint 10" },
      { value: "9.5", label: "Gem Mint 9.5" },
      { value: "9", label: "Mint 9" },
      { value: "8.5", label: "NM/M+ 8.5" },
      { value: "8", label: "NM/M 8" },
      { value: "7.5", label: "NM+ 7.5" },
      { value: "7", label: "NM 7" },
      { value: "6.5", label: "EX/NM+ 6.5" },
      { value: "6", label: "EX/NM 6" },
      { value: "5.5", label: "EX+ 5.5" },
      { value: "5", label: "EX 5" },
      { value: "4", label: "VG/EX 4" },
      { value: "3", label: "VG 3" },
      { value: "2", label: "Good 2" },
      { value: "1", label: "PR 1" },
    ],
  },
  {
    id: "SGC",
    label: "SGC",
    logo: require("../../assets/grading/sgc.png"),
    grades: [
      { value: "Pristine 10", label: "Pristine Gold 10" },
      { value: "10", label: "Gem Mint 10" },
      { value: "9.5", label: "Mint+ 9.5" },
      { value: "9", label: "Mint 9" },
      { value: "8.5", label: "NM/M+ 8.5" },
      { value: "8", label: "NM/M 8" },
      { value: "7", label: "NM 7" },
      { value: "6", label: "EX/NM 6" },
      { value: "5", label: "EX 5" },
      { value: "4", label: "VG/EX 4" },
      { value: "3", label: "VG 3" },
      { value: "2", label: "Good 2" },
      { value: "1", label: "PR 1" },
    ],
  },
  {
    id: "TAG",
    label: "TAG",
    logo: require("../../assets/grading/tag.png"),
    grades: [
      { value: "10", label: "Gem Mint 10" },
      { value: "9.5", label: "Mint+ 9.5" },
      { value: "9", label: "Mint 9" },
      { value: "8.5", label: "NM-M+ 8.5" },
      { value: "8", label: "NM 8" },
      { value: "7", label: "NM 7" },
      { value: "6", label: "EX 6" },
      { value: "5", label: "VG 5" },
    ],
  },
  {
    id: "ACE",
    label: "ACE",
    logo: require("../../assets/grading/ace.png"),
    grades: [
      { value: "10", label: "Gem Mint 10" },
      { value: "9.5", label: "Mint+ 9.5" },
      { value: "9", label: "Mint 9" },
      { value: "8.5", label: "NM-M+ 8.5" },
      { value: "8", label: "NM-M 8" },
      { value: "7", label: "NM 7" },
      { value: "6", label: "EX 6" },
      { value: "5", label: "VG 5" },
    ],
  },
];

// ---------------------------------------------------------------------------
// Condition tiers (for raw / ungraded cards)
// ---------------------------------------------------------------------------

export const CONDITION_TIERS: ConditionTier[] = [
  {
    tier: "A",
    title: "Gem Mint / Mint",
    shortTitle: "Mint",
    color: "#22C55E",
    description:
      "Perfect centering, razor-sharp corners, no whitening or chipping on edges, pristine surface with no scratches, print defects, or staining.",
  },
  {
    tier: "B",
    title: "Near Mint / Lightly Played",
    shortTitle: "NM / LP",
    color: "#3B82F6",
    description:
      "Minimal edge wear, very slight corner softness, minor surface scratches only visible at an angle. No creasing or bends.",
  },
  {
    tier: "C",
    title: "Moderately Played",
    shortTitle: "MP",
    color: "#F59E0B",
    description:
      "Noticeable edge and corner wear, light creasing that doesn't break the surface, some surface scuffing or light scratches visible at arm's length.",
  },
  {
    tier: "D",
    title: "Heavily Played",
    shortTitle: "HP",
    color: "#F97316",
    description:
      "Significant wear on edges and corners, creases visible from arm's length, border whitening, noticeable surface damage or clouding.",
  },
  {
    tier: "E",
    title: "Damaged",
    shortTitle: "DMG",
    color: "#EF4444",
    description:
      "Major structural damage — tears, heavy bends, water damage, severe creasing, ink loss, or missing portions of the card.",
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function getCompanyById(id: string): GradingCompany | undefined {
  return GRADING_COMPANIES.find((c) => c.id === id);
}

export function formatGradeCombined(
  company: string | null,
  gradeValue: string | null,
): string | null {
  if (!company) return null;
  if (company === "RAW") return "Raw";
  if (!gradeValue) return company;
  return `${company} ${gradeValue}`;
}

export function formatConditionLabel(tier: string | null): string {
  if (!tier) return "";
  const found = CONDITION_TIERS.find((t) => t.tier === tier);
  if (!found) return tier;
  return `${found.tier} - ${found.title}`;
}

export function formatConditionShort(tier: string | null): string {
  if (!tier) return "";
  const found = CONDITION_TIERS.find((t) => t.tier === tier);
  return found ? found.shortTitle : tier;
}

export function getConditionColor(tier: string | null): string {
  if (!tier) return "#6A7D9E";
  const found = CONDITION_TIERS.find((t) => t.tier === tier);
  return found?.color ?? "#6A7D9E";
}
