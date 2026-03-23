import { Dimensions, StyleSheet } from "react-native";
import { C, S, T } from "../theme";

const SCREEN_W = Dimensions.get("window").width;
const GRID_GAP = S.cardGap;
const CARD_W = (SCREEN_W - S.screenPadding * 2 - GRID_GAP) / 2;

export const auction = StyleSheet.create({
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

  // ── Filter Pills ──
  filterScroll: {
    gap: S.pillGap,
    marginBottom: S.xl,
  },
  refreshSkeletonWrap: {
    gap: S.md,
    marginBottom: S.lg,
  },
  refreshSkeletonHeader: {
    height: 42,
    borderRadius: S.radiusSmall,
    backgroundColor: C.elevated,
    borderWidth: 1,
    borderColor: C.border,
  },
  refreshSkeletonPills: {
    height: 32,
    borderRadius: 16,
    backgroundColor: C.elevated,
    borderWidth: 1,
    borderColor: C.border,
    width: "80%",
  },
  refreshSkeletonGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: GRID_GAP,
  },
  refreshSkeletonCard: {
    width: CARD_W,
    height: CARD_W * 1.65,
    borderRadius: S.radiusCard,
    backgroundColor: C.elevated,
    borderWidth: 1,
    borderColor: C.border,
  },

  // ── Grid ──
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: GRID_GAP,
  },

  // ── Auction Card ──
  card: {
    width: CARD_W,
    backgroundColor: C.surface,
    borderRadius: S.radiusCard,
    borderWidth: 1,
    borderColor: C.border,
    padding: S.md,
    overflow: "hidden",
  },
  artArea: {
    width: "100%",
    height: CARD_W * 1.2,
    borderRadius: S.radiusCardInner,
    backgroundColor: C.cardAlt,
    borderWidth: 1,
    borderColor: C.borderCard,
    marginBottom: S.md,
    overflow: "hidden",
  },
  timerBadge: {
    position: "absolute",
    top: S.sm,
    left: S.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(234,61,94,0.85)",
    borderRadius: S.radiusBadge,
    paddingHorizontal: 7,
    paddingVertical: 3,
    zIndex: 1,
  },
  timerUrgent: {
    backgroundColor: C.live,
  },
  timerText: {
    ...T.badge,
    color: C.textHero,
  },
  gradeBadge: {
    position: "absolute",
    top: S.sm,
    right: S.sm,
    backgroundColor: C.accentGlow,
    borderRadius: S.radiusBadge,
    borderWidth: 1,
    borderColor: C.borderStream,
    paddingHorizontal: 6,
    paddingVertical: 2,
    zIndex: 1,
  },
  gradeBadgeText: {
    ...T.badge,
    color: C.textAccent,
  },

  // ── Card Info ──
  cardInfo: {
    gap: S.xs,
  },
  cardName: {
    ...T.cardNameSmall,
    fontSize: 13,
  },
  cardEdition: T.edition,
  bidRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginTop: S.sm,
  },
  currentBid: {
    ...T.priceSmall,
    fontSize: 16,
  },
  bidCount: {
    color: C.textSecondary,
    fontSize: 10,
    fontWeight: "600",
  },
  placeBidBtn: {
    backgroundColor: C.accent,
    borderRadius: S.radiusSmall,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    marginTop: S.md,
  },
  placeBidText: {
    color: C.textHero,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.5,
  },

  // ── Stats row (bids + watchers) ──
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: S.xs,
  },
  statItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  statText: {
    color: C.textSecondary,
    fontSize: 10,
    fontWeight: "600",
  },

  // ── Seller row ──
  sellerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: S.sm,
  },
  sellerAvatar: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: C.muted,
    borderWidth: 1,
    borderColor: C.borderAvatar,
  },
  sellerName: {
    color: C.textSecondary,
    fontSize: 10,
    fontWeight: "600",
  },
});
