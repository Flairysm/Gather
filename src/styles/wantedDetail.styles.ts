import { Dimensions, StyleSheet } from "react-native";
import { C, S, T } from "../theme";

const SCREEN_W = Dimensions.get("window").width;
const SIMILAR_CARD_W = SCREEN_W * 0.36;

export const wd = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },

  // ── Header ──
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: S.screenPadding,
    paddingVertical: S.md,
    gap: S.md,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: C.elevated,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    color: C.textPrimary,
    fontSize: 16,
    fontWeight: "800",
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: S.sm + 4,
  },
  headerIconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: C.elevated,
    borderWidth: 1,
    borderColor: C.borderIcon,
    alignItems: "center",
    justifyContent: "center",
  },

  // ── Scroll ──
  scroll: {
    paddingBottom: 100,
  },

  // ── Hero Art ──
  heroArt: {
    width: SCREEN_W,
    height: SCREEN_W * 1.1,
    backgroundColor: C.cardAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  heroPlaceholderText: {
    color: C.textMuted,
    fontSize: 14,
    fontWeight: "600",
  },
  wtbBadge: {
    position: "absolute",
    top: S.lg,
    left: S.lg,
    backgroundColor: "rgba(234,61,94,0.15)",
    borderRadius: S.radiusBadge,
    borderWidth: 1,
    borderColor: "rgba(234,61,94,0.35)",
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  wtbBadgeText: {
    ...T.badge,
    color: C.live,
    fontSize: 11,
  },
  gradeWantedBadge: {
    position: "absolute",
    top: S.lg,
    right: S.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: C.accentGlow,
    borderRadius: S.radiusBadge,
    borderWidth: 1,
    borderColor: C.borderStream,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  gradeWantedText: {
    ...T.badge,
    color: C.textAccent,
    fontSize: 11,
  },
  viewsBadge: {
    position: "absolute",
    bottom: S.lg,
    left: S.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: S.radiusBadge,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  viewsText: {
    color: C.textPrimary,
    fontSize: 11,
    fontWeight: "700",
  },

  // ── Card Info ──
  infoSection: {
    paddingHorizontal: S.screenPadding,
    paddingTop: S.xl,
    gap: 6,
  },
  categoryChip: {
    alignSelf: "flex-start",
    backgroundColor: C.muted,
    borderRadius: S.radiusBadge,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 4,
  },
  categoryText: {
    color: C.textIcon,
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  cardName: {
    color: C.textPrimary,
    fontSize: 22,
    fontWeight: "900",
  },
  editionText: {
    ...T.edition,
    fontSize: 11,
  },

  // ── Offer Price Row ──
  priceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: S.screenPadding,
    paddingTop: S.xl,
    paddingBottom: S.lg,
  },
  priceLabel: {
    color: C.textSecondary,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  price: {
    color: C.live,
    fontSize: 28,
    fontWeight: "900",
  },
  gradeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: C.muted,
    borderRadius: S.radiusBadge,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  gradeChipText: {
    color: C.textIcon,
    fontSize: 11,
    fontWeight: "800",
  },

  // ── Divider ──
  divider: {
    height: 1,
    backgroundColor: C.border,
    marginHorizontal: S.screenPadding,
  },

  // ── Buyer Row ──
  buyerSection: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: S.screenPadding,
    paddingVertical: S.xl,
    gap: S.md,
  },
  buyerAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: C.muted,
    borderWidth: 1.5,
    borderColor: C.live,
    alignItems: "center",
    justifyContent: "center",
  },
  buyerAvatarText: {
    color: C.textHero,
    fontSize: 16,
    fontWeight: "800",
  },
  buyerInfo: {
    flex: 1,
    gap: 2,
  },
  buyerName: {
    color: C.textPrimary,
    fontSize: 15,
    fontWeight: "700",
  },
  buyerMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  ratingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  ratingText: {
    color: "#F59E0B",
    fontSize: 12,
    fontWeight: "800",
  },
  purchasesText: {
    color: C.textSecondary,
    fontSize: 12,
    fontWeight: "600",
  },
  viewProfileBtn: {
    backgroundColor: C.elevated,
    borderRadius: S.radiusSmall,
    borderWidth: 1,
    borderColor: C.borderIcon,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  viewProfileText: {
    color: C.textAccent,
    fontSize: 11,
    fontWeight: "800",
  },

  // ── Description ──
  descSection: {
    paddingHorizontal: S.screenPadding,
    paddingVertical: S.xl,
    gap: S.md,
  },
  descTitle: {
    color: C.textPrimary,
    fontSize: 15,
    fontWeight: "800",
  },
  descText: {
    color: C.textSecondary,
    fontSize: 13,
    lineHeight: 20,
    fontWeight: "500",
  },
  detailChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 4,
  },
  detailChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: C.elevated,
    borderRadius: S.radiusBadge,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  detailChipLabel: {
    color: C.textMuted,
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  detailChipValue: {
    color: C.textPrimary,
    fontSize: 11,
    fontWeight: "700",
  },

  // ── Similar ──
  similarSection: {
    paddingTop: S.xl,
    paddingBottom: S.lg,
    gap: S.md,
  },
  similarTitle: {
    color: C.textPrimary,
    fontSize: 15,
    fontWeight: "800",
    paddingHorizontal: S.screenPadding,
  },
  similarScroll: {
    paddingHorizontal: S.screenPadding,
    gap: S.cardGap,
  },
  similarCard: {
    width: SIMILAR_CARD_W,
    backgroundColor: C.surface,
    borderRadius: S.radiusCard,
    borderWidth: 1,
    borderColor: C.border,
    padding: S.md,
    overflow: "hidden",
  },
  similarArt: {
    width: "100%",
    height: SIMILAR_CARD_W * 1.1,
    borderRadius: S.radiusCardInner,
    backgroundColor: C.cardAlt,
    borderWidth: 1,
    borderColor: C.borderCard,
    marginBottom: S.md,
  },
  similarWtbTag: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(234,61,94,0.12)",
    borderRadius: S.radiusBadge,
    borderWidth: 1,
    borderColor: "rgba(234,61,94,0.3)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginBottom: 4,
  },
  similarWtbText: {
    ...T.badge,
    color: C.live,
    fontSize: 8,
  },
  similarName: {
    ...T.cardNameSmall,
    fontSize: 12,
    marginBottom: 2,
  },
  similarEdition: {
    ...T.edition,
    fontSize: 8,
    marginBottom: 4,
  },
  similarPrice: {
    color: C.live,
    fontSize: 14,
    fontWeight: "900",
  },

  // ── Bottom Bar ──
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: S.md,
    paddingHorizontal: S.screenPadding,
    paddingTop: S.lg,
    backgroundColor: C.bg,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  msgBuyerBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: C.elevated,
    borderRadius: S.radiusSmall,
    borderWidth: 1,
    borderColor: C.borderIcon,
    paddingVertical: 14,
  },
  msgBuyerText: {
    color: C.textPrimary,
    fontSize: 14,
    fontWeight: "800",
  },
  haveCardBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: C.live,
    borderRadius: S.radiusSmall,
    paddingVertical: 14,
  },
  haveCardText: {
    color: C.textHero,
    fontSize: 14,
    fontWeight: "800",
  },
});
