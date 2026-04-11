import { Dimensions } from "react-native";

const { width: SCREEN_W } = Dimensions.get("window");

export const S = {
  screenPadding: 14,
  cardGap: 12,
  pillGap: 10,
  sectionGap: 12,

  xs: 2,
  sm: 4,
  md: 10,
  lg: 14,
  xl: 18,
  xxl: 22,

  radiusPill: 999,
  radiusCard: 22,
  radiusCardInner: 16,
  radiusArtInner: 14,
  radiusBadge: 6,
  radiusSmall: 8,

  streamCardW: SCREEN_W * 0.62,
  featuredCardW: SCREEN_W * 0.38,
  vaultCardW: SCREEN_W * 0.48,

  tabBarPaddingTop: 16,
  tabBarPaddingBottom: 22,
  scrollPaddingBottom: 110,

  iconSize: {
    sm: 16,
    md: 20,
    lg: 22,
    xl: 24,
    play: 26,
  },

  avatarSize: 30,
  sectionIconSize: 36,
  playCircleSize: 60,
  arrowBtnSize: 34,

  fabSize: 56,
  fabRadius: 28,
  fabBottom: 120,
  fabRight: 14,

  heroHeight: 170,
  streamHeight: 260,
  vaultArtHeight: 180,
  artPlaceholderW: 80,
  artPlaceholderH: 110,
} as const;
