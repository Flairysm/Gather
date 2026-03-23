import {
  Image,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  Switch,
  Text,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { Feather, Ionicons } from "@expo/vector-icons";
import { StyleSheet } from "react-native";
import { useCallback, useState } from "react";
import { C, S } from "../theme";
import { useAppNavigation } from "../navigation/NavigationContext";
import { useUser } from "../data/user";
import { supabase } from "../lib/supabase";

type SettingRow = {
  id: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  value?: string;
  toggle?: boolean;
  danger?: boolean;
};

type Section = {
  title: string;
  rows: SettingRow[];
};

const SECTIONS: Section[] = [
  {
    title: "Trading",
    rows: [
      { id: "shipping", icon: "cube-outline", label: "Shipping Address" },
      { id: "payment", icon: "card-outline", label: "Payment Methods" },
      { id: "listings", icon: "storefront-outline", label: "My Listings" },
      { id: "bids", icon: "hammer-outline", label: "My Bids" },
    ],
  },
  {
    title: "Account",
    rows: [
      { id: "profile", icon: "person-outline", label: "Edit Profile" },
      { id: "username", icon: "at-outline", label: "Username", value: "@collector_x" },
      { id: "email", icon: "mail-outline", label: "Email", value: "user@gather.gg" },
      { id: "password", icon: "lock-closed-outline", label: "Change Password" },
    ],
  },
  {
    title: "Preferences",
    rows: [
      { id: "notifications", icon: "notifications-outline", label: "Push Notifications", toggle: true },
      { id: "dark_mode", icon: "moon-outline", label: "Dark Mode", toggle: true },
      { id: "currency", icon: "cash-outline", label: "Currency", value: "USD" },
      { id: "categories", icon: "pricetag-outline", label: "My Categories", value: "Pokémon, MTG" },
    ],
  },
  {
    title: "Support",
    rows: [
      { id: "help", icon: "help-circle-outline", label: "Help Centre" },
      { id: "feedback", icon: "chatbubble-outline", label: "Send Feedback" },
      { id: "terms", icon: "document-text-outline", label: "Terms of Service" },
      { id: "privacy", icon: "shield-outline", label: "Privacy Policy" },
    ],
  },
  {
    title: "Danger Zone",
    rows: [
      { id: "logout", icon: "log-out-outline", label: "Log Out", danger: true },
      { id: "delete", icon: "trash-outline", label: "Delete Account", danger: true },
    ],
  },
];

export default function SettingsScreen() {
  const { push } = useAppNavigation();
  const { isVerifiedVendor, vendorStatus, setVendorStatus } = useUser();
  const [refreshing, setRefreshing] = useState(false);

  const refreshVendorState = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setVendorStatus("none");
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("verified_seller")
      .eq("id", user.id)
      .maybeSingle();

    if (profile?.verified_seller) {
      setVendorStatus("approved");
      return;
    }

    const { data: application } = await supabase
      .from("vendor_applications")
      .select("status")
      .eq("profile_id", user.id)
      .maybeSingle();

    setVendorStatus(application?.status === "pending" ? "pending" : "none");
  }, [setVendorStatus]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshVendorState().catch(() => {});
    await new Promise((resolve) => setTimeout(resolve, 500));
    setRefreshing(false);
  }, [refreshVendorState]);

  function handleRowPress(rowId: string) {
    if (rowId === "listings") {
      push({ type: "MY_LISTINGS" });
    }
  }

  return (
    <SafeAreaView style={st.safe}>
      <StatusBar style="light" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={st.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={C.accent}
          />
        }
      >
        {/* ── Profile Card ── */}
        <View style={st.profileCard}>
          <View style={st.avatarWrap}>
            <Image
              source={require("../../assets/icon.png")}
              style={st.avatar}
            />
            <Pressable style={st.avatarEdit}>
              <Feather name="camera" size={12} color={C.textHero} />
            </Pressable>
          </View>
          <View style={st.profileInfo}>
            <Text style={st.profileName}>Collector X</Text>
            <Text style={st.profileHandle}>@collector_x</Text>
            <View style={st.badgeRow}>
              {isVerifiedVendor ? (
                <View style={st.badge}>
                  <Text style={st.badgeText}>Verified Seller</Text>
                </View>
              ) : vendorStatus === "pending" ? (
                <View style={[st.badge, st.badgeYellow]}>
                  <Text style={[st.badgeText, st.badgeTextYellow]}>Pending Vendor</Text>
                </View>
              ) : null}
              <View style={[st.badge, st.badgeBlue]}>
                <Text style={[st.badgeText, st.badgeTextBlue]}>Pro</Text>
              </View>
            </View>
          </View>
          <Pressable style={st.editBtn}>
            <Text style={st.editBtnText}>Edit</Text>
          </Pressable>
        </View>

        {/* ── Stats Row ── */}
        <View style={st.statsRow}>
          {[
            { label: "Listings", value: "24" },
            { label: "Sold", value: "138" },
            { label: "Rating", value: "4.9★" },
          ].map((stat) => (
            <View key={stat.label} style={st.statItem}>
              <Text style={st.statValue}>{stat.value}</Text>
              <Text style={st.statLabel}>{stat.label}</Text>
            </View>
          ))}
        </View>

        {/* ── Vendor Card ── */}
        {isVerifiedVendor ? (
          <Pressable
            style={st.vendorCard}
            onPress={() => push({ type: "VENDOR_HUB" })}
          >
            <View style={st.vendorIconWrap}>
              <Ionicons name="storefront" size={22} color={C.accent} />
            </View>
            <View style={st.vendorCardInfo}>
              <Text style={st.vendorCardTitle}>Vendor Hub</Text>
              <Text style={st.vendorCardSub}>
                Manage your store, display items &amp; listings
              </Text>
            </View>
            <Feather name="chevron-right" size={18} color={C.textMuted} />
          </Pressable>
        ) : (
          <Pressable
            style={st.vendorCard}
            onPress={() => push({ type: "VENDOR_APPLICATION" })}
          >
            <View style={st.vendorIconWrap}>
              <Ionicons name="storefront" size={22} color={C.accent} />
            </View>
            <View style={st.vendorCardInfo}>
              <Text style={st.vendorCardTitle}>
                {vendorStatus === "pending" ? "Application Pending" : "Become a Seller"}
              </Text>
              <Text style={st.vendorCardSub}>
                {vendorStatus === "pending"
                  ? "Your vendor application is under review"
                  : "Apply to sell cards on the Gather marketplace"}
              </Text>
            </View>
            <Feather name="chevron-right" size={18} color={C.textMuted} />
          </Pressable>
        )}

        {/* ── Sections ── */}
        {SECTIONS.map((section) => (
          <View key={section.title} style={st.section}>
            <Text style={st.sectionTitle}>{section.title}</Text>
            <View style={st.sectionCard}>
              {section.rows.map((row, i) => (
                <View key={row.id}>
                  <Pressable style={st.row} onPress={() => handleRowPress(row.id)}>
                    <View style={[st.rowIcon, row.danger && st.rowIconDanger]}>
                      <Ionicons
                        name={row.icon}
                        size={18}
                        color={row.danger ? C.danger : C.textIcon}
                      />
                    </View>
                    <Text style={[st.rowLabel, row.danger && st.rowLabelDanger]}>
                      {row.label}
                    </Text>
                    <View style={st.rowRight}>
                      {row.value && (
                        <Text style={st.rowValue} numberOfLines={1}>
                          {row.value}
                        </Text>
                      )}
                      {row.toggle ? (
                        <Switch
                          value={true}
                          trackColor={{ false: C.muted, true: C.accentSoft }}
                          thumbColor={C.accent}
                          ios_backgroundColor={C.muted}
                        />
                      ) : (
                        !row.danger && (
                          <Feather
                            name="chevron-right"
                            size={16}
                            color={C.textMuted}
                          />
                        )
                      )}
                    </View>
                  </Pressable>
                  {i < section.rows.length - 1 && (
                    <View style={st.divider} />
                  )}
                </View>
              ))}
            </View>
          </View>
        ))}

        <Text style={st.version}>Gather v1.0.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: C.bg,
  },
  scroll: {
    paddingHorizontal: S.screenPadding,
    paddingTop: 12,
    paddingBottom: S.scrollPaddingBottom,
  },

  // ── Profile ──
  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.surface,
    borderRadius: S.radiusCard,
    borderWidth: 1,
    borderColor: C.border,
    padding: S.lg,
    gap: S.md,
    marginBottom: S.md,
  },
  avatarWrap: {
    position: "relative",
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: C.accent,
  },
  avatarEdit: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: C.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    color: C.textPrimary,
    fontSize: 16,
    fontWeight: "800",
  },
  profileHandle: {
    color: C.textSecondary,
    fontSize: 12,
    fontWeight: "500",
    marginTop: 1,
    marginBottom: 6,
  },
  badgeRow: {
    flexDirection: "row",
    gap: 6,
  },
  badge: {
    backgroundColor: "rgba(34,197,94,0.12)",
    borderRadius: S.radiusBadge,
    borderWidth: 1,
    borderColor: "rgba(34,197,94,0.3)",
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  badgeBlue: {
    backgroundColor: C.accentGlow,
    borderColor: C.borderStream,
  },
  badgeText: {
    color: C.success,
    fontSize: 9,
    fontWeight: "800",
  },
  badgeTextBlue: {
    color: C.textAccent,
  },
  badgeYellow: {
    backgroundColor: "rgba(245,158,11,0.12)",
    borderColor: "rgba(245,158,11,0.3)",
  },
  badgeTextYellow: {
    color: "#F59E0B",
  },
  editBtn: {
    backgroundColor: C.elevated,
    borderRadius: S.radiusSmall,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  editBtnText: {
    color: C.textPrimary,
    fontSize: 12,
    fontWeight: "700",
  },

  vendorCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.accentGlow,
    borderRadius: S.radiusCard,
    borderWidth: 1,
    borderColor: C.borderStream,
    padding: S.lg,
    gap: S.md,
    marginBottom: S.xl,
  },
  vendorIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: C.elevated,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
    justifyContent: "center",
  },
  vendorCardInfo: { flex: 1, gap: 2 },
  vendorCardTitle: { color: C.textPrimary, fontSize: 14, fontWeight: "800" },
  vendorCardSub: { color: C.textSecondary, fontSize: 11, fontWeight: "500" },

  // ── Stats ──
  statsRow: {
    flexDirection: "row",
    backgroundColor: C.surface,
    borderRadius: S.radiusCard,
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: S.xxl,
  },
  statItem: {
    flex: 1,
    alignItems: "center",
    paddingVertical: S.lg,
  },
  statValue: {
    color: C.textPrimary,
    fontSize: 18,
    fontWeight: "900",
  },
  statLabel: {
    color: C.textSecondary,
    fontSize: 11,
    fontWeight: "600",
    marginTop: 2,
  },

  // ── Sections ──
  section: {
    marginBottom: S.xl,
  },
  sectionTitle: {
    color: C.textSecondary,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: S.sm,
    marginLeft: 4,
  },
  sectionCard: {
    backgroundColor: C.surface,
    borderRadius: S.radiusCard,
    borderWidth: 1,
    borderColor: C.border,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 13,
    paddingHorizontal: S.lg,
    gap: S.md,
  },
  rowIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: C.iconBg,
    borderWidth: 1,
    borderColor: C.borderIcon,
    alignItems: "center",
    justifyContent: "center",
  },
  rowIconDanger: {
    backgroundColor: "rgba(239,68,68,0.1)",
    borderColor: "rgba(239,68,68,0.25)",
  },
  rowLabel: {
    flex: 1,
    color: C.textPrimary,
    fontSize: 14,
    fontWeight: "500",
  },
  rowLabelDanger: {
    color: C.danger,
  },
  rowRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  rowValue: {
    color: C.textSecondary,
    fontSize: 12,
    fontWeight: "500",
    maxWidth: 100,
  },
  divider: {
    height: 1,
    backgroundColor: C.border,
    marginLeft: 56,
  },

  version: {
    color: C.textMuted,
    fontSize: 11,
    fontWeight: "500",
    textAlign: "center",
    marginTop: S.md,
  },
});
