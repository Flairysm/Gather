import { StyleSheet } from "react-native";
import { C, S } from "../theme";

export const vendorHub = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center" },

  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: S.screenPadding,
    paddingVertical: 12,
    gap: S.md,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: C.elevated,
    borderWidth: 1,
    borderColor: C.borderIcon,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    color: C.textPrimary,
    fontSize: 18,
    fontWeight: "800",
    textAlign: "center",
  },

  tabRow: {
    flexDirection: "row",
    marginHorizontal: S.screenPadding,
    backgroundColor: C.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    padding: 4,
    marginBottom: S.lg,
  },
  tabBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6,
  },
  tabBtnActive: {
    backgroundColor: C.accentGlow,
  },
  tabLabel: {
    color: C.textMuted,
    fontSize: 12,
    fontWeight: "700",
  },
  tabLabelActive: {
    color: C.accent,
  },

  content: {
    paddingHorizontal: S.screenPadding,
    paddingBottom: 60,
  },

  // Store Design - Preview
  previewCard: {
    borderRadius: S.radiusCard,
    borderWidth: 1,
    backgroundColor: C.surface,
    overflow: "hidden",
    marginBottom: S.xl,
  },
  previewBanner: {
    height: 100,
    width: "100%",
  },
  previewBody: {
    padding: S.lg,
  },
  previewLogoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: S.md,
    marginTop: -36,
  },
  previewLogo: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.bg,
  },
  previewInfo: { flex: 1, paddingTop: 14 },
  previewName: {
    color: C.textPrimary,
    fontSize: 16,
    fontWeight: "800",
  },
  previewDesc: {
    color: C.textSecondary,
    fontSize: 12,
    fontWeight: "500",
    marginTop: 2,
  },

  // Form
  sectionTitle: {
    color: C.textSecondary,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: S.sm,
    marginLeft: 4,
  },
  formCard: {
    backgroundColor: C.surface,
    borderRadius: S.radiusCard,
    borderWidth: 1,
    borderColor: C.border,
    padding: S.lg,
    gap: S.lg,
    marginBottom: S.xl,
  },
  field: { gap: 6 },
  label: {
    color: C.textSecondary,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  input: {
    backgroundColor: C.elevated,
    borderRadius: S.radiusSmall,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: C.textPrimary,
    fontSize: 14,
    fontWeight: "500",
  },
  inputMulti: {
    minHeight: 72,
    textAlignVertical: "top",
  },
  uploadBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: C.elevated,
    borderRadius: S.radiusSmall,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  uploadBtnText: {
    color: C.textPrimary,
    fontSize: 13,
    fontWeight: "600",
  },

  // Colors
  colorRow: {
    flexDirection: "row",
    gap: 12,
    flexWrap: "wrap",
    marginBottom: S.xl,
  },
  colorDot: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  colorDotActive: {
    borderWidth: 3,
    borderColor: "#fff",
  },

  saveBtn: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  saveBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "800",
  },

  // Display Items
  displayHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 2,
  },
  displayCount: {
    color: C.accent,
    fontSize: 13,
    fontWeight: "800",
  },
  displayHint: {
    color: C.textSecondary,
    fontSize: 12,
    fontWeight: "500",
    marginBottom: S.lg,
  },
  displayRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    padding: 12,
    gap: 10,
    marginBottom: 8,
  },
  displayOrder: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: C.accentGlow,
    alignItems: "center",
    justifyContent: "center",
  },
  displayOrderText: {
    color: C.accent,
    fontSize: 12,
    fontWeight: "900",
  },
  displayInfo: { flex: 1 },
  displayName: {
    color: C.textPrimary,
    fontSize: 13,
    fontWeight: "700",
  },
  displayMeta: {
    color: C.textSecondary,
    fontSize: 11,
    fontWeight: "500",
    marginTop: 2,
  },
  displayActions: {
    flexDirection: "row",
    gap: 4,
  },
  miniBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: C.elevated,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
    justifyContent: "center",
  },
  miniBtnDisabled: {
    opacity: 0.35,
  },

  emptyCard: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.surface,
    borderRadius: S.radiusCard,
    borderWidth: 1,
    borderColor: C.border,
    paddingVertical: 40,
    gap: 8,
  },
  emptyTitle: {
    color: C.textPrimary,
    fontSize: 15,
    fontWeight: "800",
  },
  emptySub: {
    color: C.textSecondary,
    fontSize: 12,
    fontWeight: "500",
    textAlign: "center",
    paddingHorizontal: 40,
  },

  // My Listings
  listingsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: S.screenPadding,
    marginBottom: S.md,
  },
  newListingBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.accent,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 6,
  },
  newListingBtnText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "800",
  },
  listingRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    padding: 12,
    gap: 10,
    marginBottom: 8,
  },
  listingThumb: {
    width: 48,
    height: 48,
    borderRadius: 10,
    backgroundColor: C.elevated,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  listingThumbImg: {
    width: 48,
    height: 48,
    borderRadius: 10,
  },
  listingInfo: { flex: 1 },
  listingName: {
    color: C.textPrimary,
    fontSize: 13,
    fontWeight: "700",
  },
  listingMeta: {
    color: C.textSecondary,
    fontSize: 11,
    fontWeight: "500",
    marginTop: 2,
  },
  listingPrice: {
    color: C.accent,
    fontSize: 13,
    fontWeight: "800",
    marginTop: 2,
  },
  listingActions: {
    alignItems: "flex-end",
    gap: 6,
  },
  statusChip: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  statusActive: {
    backgroundColor: "rgba(34,197,94,0.12)",
  },
  statusInactive: {
    backgroundColor: "rgba(100,116,139,0.12)",
  },
  statusText: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  statusTextActive: {
    color: C.success,
  },
  statusTextInactive: {
    color: C.textMuted,
  },
  displayToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  displayToggleActive: {
    borderColor: "rgba(245,158,11,0.4)",
    backgroundColor: "rgba(245,158,11,0.08)",
  },
  displayToggleText: {
    color: C.textMuted,
    fontSize: 10,
    fontWeight: "700",
  },
  displayToggleTextActive: {
    color: "#F59E0B",
  },

  // Toast
  toast: {
    position: "absolute",
    bottom: 40,
    left: 20,
    right: 20,
    backgroundColor: C.success,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  toastText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
  },
});
