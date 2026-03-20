import { Dimensions, StyleSheet } from "react-native";
import { C, S, T } from "../theme";

const SCREEN_W = Dimensions.get("window").width;
const SIMILAR_CARD_W = SCREEN_W * 0.36;

export const ld = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  cartToast: {
    position: "absolute",
    left: S.screenPadding,
    right: S.screenPadding,
    zIndex: 20,
    backgroundColor: C.success,
    borderRadius: S.radiusSmall,
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: "center",
  },
  cartToastText: {
    color: C.textHero,
    fontSize: 13,
    fontWeight: "800",
  },
  qtyOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 19,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    paddingHorizontal: S.screenPadding,
  },
  qtySheet: {
    backgroundColor: C.surface,
    borderRadius: S.radiusCard,
    borderWidth: 1,
    borderColor: C.border,
    padding: S.lg,
    gap: S.md,
  },
  qtyTitle: {
    color: C.textPrimary,
    fontSize: 17,
    fontWeight: "800",
    textAlign: "center",
  },
  qtySubtitle: {
    color: C.textSecondary,
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
  },
  qtyRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: S.lg,
  },
  qtyBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.elevated,
    borderWidth: 1,
    borderColor: C.border,
  },
  qtyBtnDisabled: {
    opacity: 0.4,
  },
  qtyValue: {
    minWidth: 36,
    textAlign: "center",
    color: C.textPrimary,
    fontSize: 22,
    fontWeight: "900",
  },
  qtyActions: {
    flexDirection: "row",
    gap: S.sm,
  },
  qtyCancelBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: S.radiusSmall,
    borderWidth: 1,
    borderColor: C.borderIcon,
    backgroundColor: C.elevated,
    paddingVertical: 12,
  },
  qtyCancelText: {
    color: C.textPrimary,
    fontSize: 13,
    fontWeight: "700",
  },
  qtyConfirmBtn: {
    flex: 1.3,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: S.radiusSmall,
    backgroundColor: C.success,
    paddingVertical: 12,
  },
  qtyConfirmText: {
    color: C.textHero,
    fontSize: 13,
    fontWeight: "800",
  },

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
  heroGradeBadge: {
    position: "absolute",
    top: S.lg,
    right: S.lg,
    backgroundColor: C.accentGlow,
    borderRadius: S.radiusBadge,
    borderWidth: 1,
    borderColor: C.borderStream,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  heroGradeText: {
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

  // ── Price Row ──
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
    color: C.link,
    fontSize: 28,
    fontWeight: "900",
  },
  stockText: {
    color: C.success,
    fontSize: 11,
    fontWeight: "700",
    marginTop: 2,
  },
  conditionChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: C.successBg,
    borderRadius: S.radiusBadge,
    borderWidth: 1,
    borderColor: "rgba(34,197,94,0.3)",
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  conditionText: {
    color: C.success,
    fontSize: 11,
    fontWeight: "800",
  },

  // ── Divider ──
  divider: {
    height: 1,
    backgroundColor: C.border,
    marginHorizontal: S.screenPadding,
  },

  // ── Seller Row ──
  sellerSection: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: S.screenPadding,
    paddingVertical: S.xl,
    gap: S.md,
  },
  sellerAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: C.muted,
    borderWidth: 1.5,
    borderColor: C.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  sellerAvatarText: {
    color: C.textHero,
    fontSize: 16,
    fontWeight: "800",
  },
  sellerInfo: {
    flex: 1,
    gap: 2,
  },
  sellerName: {
    color: C.textPrimary,
    fontSize: 15,
    fontWeight: "700",
  },
  sellerMeta: {
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
  salesText: {
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
    ...T.priceSmall,
    fontSize: 14,
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
  msgIconBtn: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.elevated,
    borderWidth: 1,
    borderColor: C.borderIcon,
  },
  buyNowBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: C.success,
    borderRadius: S.radiusSmall,
    paddingVertical: 14,
  },
  buyNowText: {
    color: C.textHero,
    fontSize: 14,
    fontWeight: "800",
  },
  makeOfferBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: C.accent,
    borderRadius: S.radiusSmall,
    paddingVertical: 14,
  },
  makeOfferText: {
    color: C.textHero,
    fontSize: 14,
    fontWeight: "800",
  },
});

export const SIMILAR_CARD_WIDTH = SIMILAR_CARD_W;
