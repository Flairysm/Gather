import { StyleSheet } from "react-native";
import { C, S, T } from "../theme";

export const shared = StyleSheet.create({
  pill: {
    backgroundColor: C.elevated,
    borderRadius: S.radiusPill,
    paddingHorizontal: S.xl,
    paddingVertical: S.md,
  },
  pillActive: {
    backgroundColor: C.accent,
  },
  pillText: {
    ...T.pill,
    color: C.textSecondary,
  },
  pillTextActive: {
    color: C.textHero,
  },
  pillSeeAll: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: C.border,
  },
  pillSeeAllText: {
    ...T.pill,
    color: C.textIcon,
  },

  sectionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: S.sectionGap,
  },
  sectionLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: S.md,
  },
  sectionIcon: {
    width: S.sectionIconSize,
    height: S.sectionIconSize,
    borderRadius: S.sectionIconSize / 2,
    backgroundColor: C.iconBg,
    borderWidth: 1,
    borderColor: C.borderIcon,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  sectionName: T.sectionName,
  liveTag: {
    ...T.tag,
    color: C.live,
    marginTop: 1,
  },
  offlineTag: {
    ...T.tag,
    color: C.textMuted,
    marginTop: 1,
  },
  arrowBtn: {
    width: S.arrowBtnSize,
    height: S.arrowBtnSize,
    borderRadius: S.arrowBtnSize / 2,
    backgroundColor: C.muted,
    alignItems: "center",
    justifyContent: "center",
  },

  tabBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    paddingTop: S.tabBarPaddingTop,
    paddingBottom: S.tabBarPaddingBottom,
    backgroundColor: C.bg,
    borderTopWidth: 1,
    borderTopColor: C.borderTab,
  },
  tabItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  tabLabel: {
    ...T.tabLabel,
    color: C.textMuted,
  },
  tabLabelActive: {
    ...T.tabLabel,
    color: C.accent,
  },
});
