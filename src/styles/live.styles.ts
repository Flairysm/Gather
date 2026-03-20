import { Dimensions, StyleSheet } from "react-native";
import { C, S } from "../theme";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

export const live = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.bg,
  },

  // ── FYP page ──
  page: {
    width: SCREEN_W,
    height: SCREEN_H,
  },

  // ── Search overlay (global, above FlatList) ──
  searchOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    paddingHorizontal: S.screenPadding,
    paddingBottom: S.md,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: S.md,
  },
  searchBar: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(17,24,34,0.75)",
    borderRadius: S.radiusSmall,
    borderWidth: 1,
    borderColor: "rgba(21,34,58,0.6)",
    paddingHorizontal: S.md,
    gap: S.sm,
    height: 40,
  },
  searchInput: {
    flex: 1,
    color: C.textPrimary,
    fontSize: 14,
    fontWeight: "500",
  },
  goLiveBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: C.live,
    borderRadius: S.radiusSmall,
    paddingHorizontal: 14,
    height: 40,
  },
  goLiveText: {
    color: C.textHero,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.5,
  },

  // ── Placeholder for stream video ──
  streamPlaceholder: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  streamPlaceholderIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(44,128,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },

  // ── Top bar: profile row ──
  topBar: {
    position: "absolute",
    left: S.screenPadding,
    right: S.screenPadding,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  profilePill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(10,14,22,0.7)",
    borderRadius: 999,
    paddingRight: 12,
    paddingVertical: 4,
    paddingLeft: 4,
    gap: 8,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: C.muted,
    borderWidth: 2,
    borderColor: C.live,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: C.textHero,
    fontSize: 14,
    fontWeight: "800",
  },
  profileInfo: {},
  streamerName: {
    color: C.textHero,
    fontSize: 13,
    fontWeight: "800",
  },
  viewerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 1,
  },
  liveDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: C.live,
  },
  viewerText: {
    color: C.textSecondary,
    fontSize: 10,
    fontWeight: "600",
  },
  followBtn: {
    backgroundColor: C.live,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  followBtnText: {
    color: C.textHero,
    fontSize: 11,
    fontWeight: "800",
  },
  topRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  topIconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(10,14,22,0.7)",
    alignItems: "center",
    justifyContent: "center",
  },

  // ── Tags row (below top bar) ──
  tagRow: {
    position: "absolute",
    left: S.screenPadding,
    flexDirection: "row",
    gap: 6,
  },
  categoryChip: {
    backgroundColor: "rgba(44,128,255,0.2)",
    borderRadius: S.radiusBadge,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  categoryText: {
    color: C.textAccent,
    fontSize: 11,
    fontWeight: "700",
  },
  tag: {
    backgroundColor: "rgba(17,24,34,0.75)",
    borderRadius: S.radiusBadge,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  tagText: {
    color: C.textIcon,
    fontSize: 11,
    fontWeight: "700",
  },

  // ── Chat messages (left side, above bottom bar) ──
  chatArea: {
    position: "absolute",
    left: S.screenPadding,
    right: 70,
  },
  chatBubble: {
    backgroundColor: "rgba(10,14,22,0.6)",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 6,
    alignSelf: "flex-start",
    maxWidth: "100%",
  },
  chatUser: {
    color: C.textAccent,
    fontSize: 11,
    fontWeight: "700",
    marginBottom: 2,
  },
  chatText: {
    color: C.textPrimary,
    fontSize: 12,
    fontWeight: "500",
    lineHeight: 16,
  },

  // ── Bottom bar: chat input + actions ──
  bottomBar: {
    position: "absolute",
    left: S.screenPadding,
    right: S.screenPadding,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  chatInput: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(17,24,34,0.75)",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(21,34,58,0.6)",
    paddingHorizontal: 14,
    height: 40,
    gap: 6,
  },
  chatInputText: {
    color: C.textMuted,
    fontSize: 13,
    fontWeight: "500",
  },
  actionBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(17,24,34,0.75)",
    borderWidth: 1,
    borderColor: "rgba(21,34,58,0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  giftBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(234,61,94,0.2)",
    borderWidth: 1,
    borderColor: "rgba(234,61,94,0.4)",
    alignItems: "center",
    justifyContent: "center",
  },

  // ── Bottom gradient ──
  bottomGradient: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 350,
  },
  // ── Top gradient ──
  topGradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 140,
  },
});
