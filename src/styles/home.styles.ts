import { StyleSheet } from "react-native";
import { C, S, T } from "../theme";

export const home = StyleSheet.create({
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

  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: S.md,
    marginBottom: S.lg,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: S.md,
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
    position: "relative" as const,
  },
  cartBadge: {
    position: "absolute" as const,
    top: -4,
    right: -4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: C.live,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    paddingHorizontal: 4,
  },
  cartBadgeText: {
    color: "#fff",
    fontSize: 9,
    fontWeight: "800" as const,
  },
  avatar: {
    width: S.avatarSize,
    height: S.avatarSize,
    borderRadius: S.avatarSize / 2,
    borderWidth: 1.5,
    borderColor: C.borderAvatar,
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

  hero: {
    height: S.heroHeight,
    borderRadius: S.radiusCard,
    overflow: "hidden",
  },
  heroImg: {
    borderRadius: S.radiusCard,
  },
  noBanner: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
    gap: 6,
  },
  noBannerTitle: {
    color: C.textPrimary,
    fontSize: 16,
    fontWeight: "800",
  },
  noBannerSub: {
    color: C.textSecondary,
    fontSize: 12,
    fontWeight: "500",
  },
  heroGradient: {
    flex: 1,
    justifyContent: "flex-end",
    paddingHorizontal: S.xl,
    paddingBottom: 16,
  },
  heroTitle: T.heroTitle,
  heroSub: {
    ...T.heroSub,
    marginTop: S.sm,
  },

  filterScroll: {
    gap: S.pillGap,
    marginTop: S.lg,
    marginBottom: S.xl,
  },
  refreshSkeletonWrap: {
    gap: S.md,
    marginBottom: S.lg,
  },
  refreshSkeletonHero: {
    height: S.heroHeight,
    borderRadius: S.radiusCard,
    backgroundColor: C.elevated,
    borderWidth: 1,
    borderColor: C.border,
  },
  refreshSkeletonPills: {
    flexDirection: "row",
    gap: S.sm,
  },
  refreshSkeletonPill: {
    height: 30,
    width: 92,
    borderRadius: 15,
    backgroundColor: C.elevated,
    borderWidth: 1,
    borderColor: C.border,
  },
  refreshSkeletonPillShort: {
    height: 30,
    width: 60,
    borderRadius: 15,
    backgroundColor: C.elevated,
    borderWidth: 1,
    borderColor: C.border,
  },

  streamRow: {
    gap: S.cardGap,
    marginBottom: S.xxl,
  },
  streamCard: {
    height: S.streamHeight,
    borderRadius: S.radiusCard,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: C.borderStream,
    backgroundColor: "#060D17",
  },
  streamInner: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  playCircle: {
    width: S.playCircleSize,
    height: S.playCircleSize,
    borderRadius: S.playCircleSize / 2,
    backgroundColor: C.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  streamCta: {
    ...T.streamCta,
    marginTop: S.lg,
  },
  streamMeta: {
    ...T.streamMeta,
    marginTop: 3,
  },

  featuredCard: {
    height: S.streamHeight,
    borderRadius: S.radiusCard,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.card,
    padding: S.md,
    justifyContent: "flex-end",
  },
  featuredArt: {
    flex: 1,
    borderRadius: S.radiusArtInner,
    backgroundColor: C.cardInner,
    borderWidth: 1,
    borderColor: C.borderCard,
    marginBottom: S.md,
  },
  featuredEdition: T.edition,
  featuredName: {
    ...T.cardNameSmall,
    marginTop: S.xs,
  },
  featuredPrice: {
    ...T.priceSmall,
    marginTop: S.xs,
  },

  vaultScroll: {
    gap: S.cardGap,
    paddingBottom: S.sm,
  },
  vaultCard: {
    borderRadius: S.radiusCard,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
    padding: S.md,
  },
  vaultArt: {
    height: S.vaultArtHeight,
    borderRadius: S.radiusCardInner,
    backgroundColor: C.cardAlt,
    borderWidth: 1,
    borderColor: C.borderCard,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  badgeChip: {
    position: "absolute",
    top: S.md,
    alignSelf: "center",
    backgroundColor: C.live,
    borderRadius: S.radiusBadge,
    paddingHorizontal: 8,
    paddingVertical: 3,
    zIndex: 1,
  },
  badgeText: T.badge,
  artPlaceholder: {
    width: S.artPlaceholderW,
    height: S.artPlaceholderH,
    borderRadius: S.radiusSmall,
    backgroundColor: "#111D30",
    marginTop: 20,
  },
  vaultEdition: {
    ...T.edition,
    marginTop: S.md,
  },
  vaultName: {
    ...T.cardName,
    marginTop: 3,
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 6,
  },
  vaultPrice: T.price,
  trendChip: {
    borderRadius: S.radiusSmall,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  trendUp: {
    backgroundColor: C.successBg,
  },
  trendDown: {
    backgroundColor: C.dangerBg,
  },
  trendText: T.trend,
  trendTextUp: {
    color: C.success,
  },
  trendTextDown: {
    color: C.danger,
  },

  // Vendor Stores
  vendorStoreScroll: {
    gap: S.cardGap,
    marginBottom: S.xxl,
  },
  vendorStoreCard: {
    borderRadius: S.radiusCard,
    borderWidth: 1,
    backgroundColor: C.surface,
    overflow: "hidden",
  },
  vendorStoreBanner: {
    height: 70,
    width: "100%",
  },
  vendorStoreBody: {
    padding: S.md,
  },
  vendorStoreHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: -22,
    marginBottom: 8,
  },
  vendorStoreLogo: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.bg,
  },
  vendorStoreName: {
    color: C.textPrimary,
    fontSize: 13,
    fontWeight: "800",
    marginTop: 10,
  },
  vendorStoreDesc: {
    color: C.textSecondary,
    fontSize: 10,
    fontWeight: "500",
    marginTop: 1,
  },
  vendorItemsRow: {
    gap: 8,
  },
  vendorItemCard: {
    width: 80,
    gap: 4,
  },
  vendorItemArt: {
    width: 80,
    height: 80,
    borderRadius: 10,
    backgroundColor: C.elevated,
    borderWidth: 1,
    borderColor: C.borderCard,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  vendorItemImg: {
    width: 80,
    height: 80,
    borderRadius: 10,
  },
  vendorItemName: {
    color: C.textPrimary,
    fontSize: 10,
    fontWeight: "600",
  },
  vendorItemPrice: {
    color: C.accent,
    fontSize: 10,
    fontWeight: "800",
  },

  vendorSection: {
    marginBottom: S.xl,
  },

  sectionLogoImg: {
    width: S.sectionIconSize,
    height: S.sectionIconSize,
    borderRadius: S.sectionIconSize / 2,
  },

  // Display item image inside vault-style card
  displayItemImg: {
    width: "100%",
    height: "100%",
    borderRadius: S.radiusCardInner,
  },

  // Empty display items fallback
  noDisplayItems: {
    height: 80,
    borderRadius: S.radiusCard,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  noDisplayItemsText: {
    color: C.textMuted,
    fontSize: 12,
    fontWeight: "500",
  },
});
