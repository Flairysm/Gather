import { TextStyle } from "react-native";
import { C } from "./colors";

export const T = {
  brand: {
    color: C.textBrand,
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: 2,
  } as TextStyle,

  heroTitle: {
    color: C.textHero,
    fontSize: 30,
    fontWeight: "900",
    letterSpacing: 0.5,
  } as TextStyle,

  heroSub: {
    color: C.textAccent,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 2,
  } as TextStyle,

  sectionName: {
    color: C.textPrimary,
    fontSize: 18,
    fontWeight: "800",
  } as TextStyle,

  pill: {
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  } as TextStyle,

  tag: {
    fontSize: 10,
    fontWeight: "800",
  } as TextStyle,

  edition: {
    color: C.textSecondary,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  } as TextStyle,

  cardName: {
    color: C.textPrimary,
    fontSize: 18,
    fontWeight: "900",
  } as TextStyle,

  cardNameSmall: {
    color: "#E0EAFF",
    fontSize: 15,
    fontWeight: "800",
  } as TextStyle,

  price: {
    color: C.link,
    fontSize: 20,
    fontWeight: "900",
  } as TextStyle,

  priceSmall: {
    color: C.link,
    fontSize: 18,
    fontWeight: "900",
  } as TextStyle,

  streamCta: {
    color: "#E8F1FF",
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: 1.5,
  } as TextStyle,

  streamMeta: {
    color: "#3690FF",
    fontSize: 11,
    fontWeight: "700",
  } as TextStyle,

  badge: {
    color: C.textHero,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.5,
  } as TextStyle,

  trend: {
    fontSize: 10,
    fontWeight: "800",
  } as TextStyle,

  tabLabel: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0,
  } as TextStyle,
} as const;
