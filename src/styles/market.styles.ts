import { Dimensions, StyleSheet } from "react-native";
import { C, S, T } from "../theme";

const SCREEN_W = Dimensions.get("window").width;
const GRID_GAP = S.cardGap;
const CARD_W = (SCREEN_W - S.screenPadding * 2 - GRID_GAP) / 2;

export const market = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: C.bg,
  },
  root: {
    flex: 1,
  },
  scroll: {
    paddingHorizontal: S.screenPadding,
    paddingTop: 6,
    paddingBottom: S.scrollPaddingBottom,
  },

  // ── Header ──
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: S.md,
    marginBottom: S.lg,
  },
  searchBar: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.elevated,
    borderRadius: S.radiusSmall,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: S.md,
    gap: S.sm,
    height: 42,
  },
  searchInput: {
    flex: 1,
    color: C.textPrimary,
    fontSize: 14,
    fontWeight: "500",
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: C.elevated,
    borderWidth: 1,
    borderColor: C.borderIcon,
    alignItems: "center",
    justifyContent: "center",
  },

  // ── Segment Tabs ──
  segmentRow: {
    flexDirection: "row",
    backgroundColor: C.elevated,
    borderRadius: S.radiusSmall,
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: S.xl,
    padding: 3,
  },
  segmentTab: {
    flex: 1,
    paddingVertical: 9,
    alignItems: "center",
    borderRadius: S.radiusSmall - 1,
  },
  segmentTabActive: {
    backgroundColor: C.accent,
  },
  segmentLabel: {
    ...T.pill,
    color: C.textSecondary,
  },
  segmentLabelActive: {
    color: C.textHero,
  },

  // ── Filter Pills ──
  filterScroll: {
    gap: S.pillGap,
    marginBottom: S.xl,
  },

  // ── Listings Grid ──
  listingsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: GRID_GAP,
  },

  // ── Listing Card (portrait, 2-col) ──
  listingCard: {
    width: CARD_W,
    backgroundColor: C.surface,
    borderRadius: S.radiusCard,
    borderWidth: 1,
    borderColor: C.border,
    padding: S.md,
    overflow: "hidden",
  },
  listingArt: {
    width: "100%",
    height: CARD_W * 1.2,
    borderRadius: S.radiusCardInner,
    backgroundColor: C.cardAlt,
    borderWidth: 1,
    borderColor: C.borderCard,
    marginBottom: S.md,
    alignItems: "flex-end",
    justifyContent: "flex-start",
    padding: S.sm,
  },
  listingInfo: {
    gap: S.xs,
  },
  listingTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 2,
  },
  listingName: {
    ...T.cardNameSmall,
    fontSize: 13,
    flex: 1,
    marginRight: S.xs,
  },
  gradeBadge: {
    backgroundColor: C.accentGlow,
    borderRadius: S.radiusBadge,
    borderWidth: 1,
    borderColor: C.borderStream,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  gradeBadgeText: {
    ...T.badge,
    color: C.textAccent,
  },
  listingEdition: T.edition,
  listingPrice: {
    ...T.priceSmall,
    fontSize: 16,
    marginTop: 2,
  },
  listingMeta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: S.sm,
  },
  sellerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  sellerAvatar: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: C.muted,
    borderWidth: 1,
    borderColor: C.borderAvatar,
  },
  sellerName: {
    color: C.textSecondary,
    fontSize: 10,
    fontWeight: "600",
  },
  postedAt: {
    color: C.textMuted,
    fontSize: 10,
    fontWeight: "500",
  },

  // ── Wanted Grid ──
  wantedGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: GRID_GAP,
  },

  // ── Wanted Card (portrait, 2-col) ──
  wantedCard: {
    width: CARD_W,
    backgroundColor: C.surface,
    borderRadius: S.radiusCard,
    borderWidth: 1,
    borderColor: C.border,
    padding: S.md,
  },
  wantedArt: {
    width: "100%",
    height: CARD_W * 1.2,
    borderRadius: S.radiusCardInner,
    backgroundColor: C.cardAlt,
    borderWidth: 1,
    borderColor: C.borderCard,
    marginBottom: S.md,
  },
  wantedTag: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(234,61,94,0.12)",
    borderRadius: S.radiusBadge,
    borderWidth: 1,
    borderColor: "rgba(234,61,94,0.3)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: S.md,
  },
  wantedTagText: {
    ...T.badge,
    color: C.live,
  },
  wantedName: {
    ...T.cardNameSmall,
    fontSize: 13,
    marginBottom: 2,
  },
  wantedEdition: {
    ...T.edition,
    marginBottom: S.sm,
  },
  gradeWantedChip: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 4,
    backgroundColor: C.muted,
    borderRadius: S.radiusBadge,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginBottom: S.md,
  },
  gradeWantedText: {
    color: C.textIcon,
    fontSize: 10,
    fontWeight: "700",
  },
  wantedDivider: {
    height: 1,
    backgroundColor: C.border,
    marginBottom: S.md,
  },
  offerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: S.sm,
  },
  offerLabel: {
    color: C.textSecondary,
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  offerPrice: {
    ...T.priceSmall,
    fontSize: 14,
  },
  wantedMeta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  wantedBuyerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  wantedAvatar: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: C.muted,
    borderWidth: 1,
    borderColor: C.borderAvatar,
  },
  wantedBuyer: {
    color: C.textSecondary,
    fontSize: 10,
    fontWeight: "600",
  },
  wantedPostedAt: {
    color: C.textMuted,
    fontSize: 10,
    fontWeight: "500",
  },
});
