import { Dimensions, StyleSheet } from "react-native";
import { C, S, T } from "../theme";

const SCREEN_W = Dimensions.get("window").width;
const IMAGE_GAP = 10;
const IMAGE_SIZE = (SCREEN_W - S.screenPadding * 2 - IMAGE_GAP * 3) / 4;

export const cf = StyleSheet.create({
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
  stepIndicator: {
    color: C.textSecondary,
    fontSize: 12,
    fontWeight: "700",
  },

  // ── Step Dots ──
  dotsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: S.lg,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: C.muted,
  },
  dotActive: {
    backgroundColor: C.accent,
    width: 24,
    borderRadius: 4,
  },
  dotCompleted: {
    backgroundColor: C.accent,
  },

  // ── Scroll ──
  scroll: {
    paddingHorizontal: S.screenPadding,
    paddingBottom: 120,
  },

  // ── Section ──
  sectionTitle: {
    color: C.textPrimary,
    fontSize: 18,
    fontWeight: "900",
    marginBottom: 4,
  },
  sectionSub: {
    color: C.textSecondary,
    fontSize: 13,
    fontWeight: "500",
    marginBottom: S.xl,
  },

  // ── Image Grid ──
  imageGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: IMAGE_GAP,
    marginBottom: S.xl,
  },
  imageSlot: {
    width: IMAGE_SIZE,
    height: IMAGE_SIZE,
    borderRadius: S.radiusSmall,
    backgroundColor: C.elevated,
    borderWidth: 1.5,
    borderColor: C.border,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  imageSlotFilled: {
    borderStyle: "solid",
    borderColor: C.accent,
  },
  imagePreview: {
    width: "100%",
    height: "100%",
    borderRadius: S.radiusSmall,
  },
  imageRemove: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.7)",
    alignItems: "center",
    justifyContent: "center",
  },
  addImageText: {
    color: C.textMuted,
    fontSize: 9,
    fontWeight: "700",
    marginTop: 4,
  },

  // ── Image Picker Buttons ──
  pickerRow: {
    flexDirection: "row",
    gap: S.md,
    marginBottom: S.xl,
  },
  pickerBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: C.elevated,
    borderRadius: S.radiusSmall,
    borderWidth: 1,
    borderColor: C.borderIcon,
    paddingVertical: 14,
  },
  pickerBtnText: {
    color: C.textPrimary,
    fontSize: 13,
    fontWeight: "700",
  },

  // ── Single Image (Wanted) ──
  singleImageSlot: {
    width: SCREEN_W - S.screenPadding * 2,
    height: (SCREEN_W - S.screenPadding * 2) * 0.6,
    borderRadius: S.radiusCard,
    backgroundColor: C.elevated,
    borderWidth: 1.5,
    borderColor: C.border,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    marginBottom: S.xl,
  },
  singleImageSlotFilled: {
    borderStyle: "solid",
    borderColor: C.accent,
  },
  singleImagePreview: {
    width: "100%",
    height: "100%",
    borderRadius: S.radiusCard,
  },
  singleImagePlaceholder: {
    alignItems: "center",
    gap: 8,
  },
  singleImageText: {
    color: C.textMuted,
    fontSize: 13,
    fontWeight: "600",
  },
  singleImageSub: {
    color: C.textMuted,
    fontSize: 11,
    fontWeight: "500",
  },

  // ── Form Field ──
  fieldLabel: {
    color: C.textPrimary,
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 6,
  },
  textInput: {
    backgroundColor: C.elevated,
    borderRadius: S.radiusSmall,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 14,
    height: 46,
    color: C.textPrimary,
    fontSize: 14,
    fontWeight: "500",
    marginBottom: S.xl,
  },
  textArea: {
    backgroundColor: C.elevated,
    borderRadius: S.radiusSmall,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: C.textPrimary,
    fontSize: 14,
    fontWeight: "500",
    marginBottom: S.xl,
    minHeight: 100,
    textAlignVertical: "top",
  },
  priceInputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.elevated,
    borderRadius: S.radiusSmall,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 14,
    height: 54,
    marginBottom: S.xl,
  },
  dollarSign: {
    color: C.textAccent,
    fontSize: 22,
    fontWeight: "900",
    marginRight: 8,
  },
  priceInput: {
    flex: 1,
    color: C.textPrimary,
    fontSize: 22,
    fontWeight: "800",
  },

  // ── Category Pills ──
  categoryRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: S.xl,
  },
  categoryPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: S.radiusPill,
    backgroundColor: C.elevated,
    borderWidth: 1,
    borderColor: C.border,
  },
  categoryPillActive: {
    backgroundColor: C.accent,
    borderColor: C.accent,
  },
  categoryPillText: {
    color: C.textSecondary,
    fontSize: 12,
    fontWeight: "800",
  },
  categoryPillTextActive: {
    color: C.textHero,
  },

  // ── Condition Chips ──
  conditionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: S.xl,
  },
  conditionChip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: S.radiusSmall,
    backgroundColor: C.elevated,
    borderWidth: 1,
    borderColor: C.border,
  },
  conditionChipActive: {
    backgroundColor: C.successBg,
    borderColor: "rgba(34,197,94,0.3)",
  },
  conditionChipText: {
    color: C.textSecondary,
    fontSize: 12,
    fontWeight: "700",
  },
  conditionChipTextActive: {
    color: C.success,
  },

  // ── Review Summary ──
  reviewCard: {
    backgroundColor: C.surface,
    borderRadius: S.radiusCard,
    borderWidth: 1,
    borderColor: C.border,
    padding: S.lg,
    marginBottom: S.xl,
    gap: S.md,
  },
  reviewRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  reviewLabel: {
    color: C.textSecondary,
    fontSize: 12,
    fontWeight: "700",
  },
  reviewValue: {
    color: C.textPrimary,
    fontSize: 13,
    fontWeight: "700",
    maxWidth: "60%",
    textAlign: "right",
  },
  reviewDivider: {
    height: 1,
    backgroundColor: C.border,
  },
  reviewImages: {
    flexDirection: "row",
    gap: 6,
  },
  reviewThumb: {
    width: 44,
    height: 44,
    borderRadius: 6,
  },

  // ── Bottom Button ──
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: S.screenPadding,
    paddingTop: S.lg,
    backgroundColor: C.bg,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  nextBtn: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.accent,
    borderRadius: S.radiusSmall,
    paddingVertical: 16,
  },
  nextBtnDisabled: {
    backgroundColor: C.muted,
  },
  nextBtnText: {
    color: C.textHero,
    fontSize: 15,
    fontWeight: "800",
  },
  nextBtnTextDisabled: {
    color: C.textMuted,
  },
  submitBtn: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.success,
    borderRadius: S.radiusSmall,
    paddingVertical: 16,
  },
  submitBtnText: {
    color: C.textHero,
    fontSize: 15,
    fontWeight: "800",
  },
});

export const IMAGE_SLOT_SIZE = IMAGE_SIZE;
