import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { Feather, Ionicons } from "@expo/vector-icons";
import { C, S } from "../theme";
import { useAppNavigation } from "../navigation/NavigationContext";
import { fetchVendorStatus, useUser } from "../data/user";
import { supabase } from "../lib/supabase";

type Profile = {
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  rating: number;
  total_sales: number;
  total_purchases: number;
  verified_seller: boolean;
  created_at: string;
};


export default function SettingsScreen() {
  const { push } = useAppNavigation();
  const { isVerifiedVendor, vendorStatus, setVendorStatus } = useUser();
  const [refreshing, setRefreshing] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [activeListingsCount, setActiveListingsCount] = useState(0);
  const [ordersCount, setOrdersCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);

  const loadProfile = useCallback(async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      setEmail(user.email ?? null);

      const { data } = await supabase
        .from("profiles")
        .select(
          "username, display_name, avatar_url, bio, rating, total_sales, total_purchases, verified_seller, created_at",
        )
        .eq("id", user.id)
        .maybeSingle();

      if (data) setProfile(data as Profile);

      const [{ count: listCount }, { count: orderCount }] = await Promise.all([
        supabase
          .from("listings")
          .select("id", { count: "exact", head: true })
          .eq("seller_id", user.id)
          .eq("status", "active"),
        supabase
          .from("orders")
          .select("id", { count: "exact", head: true })
          .eq("buyer_id", user.id),
      ]);

      setActiveListingsCount(listCount ?? 0);
      setOrdersCount(orderCount ?? 0);
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const refreshAll = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      loadProfile(),
      fetchVendorStatus()
        .then(setVendorStatus)
        .catch(() => {}),
    ]);
    await new Promise((r) => setTimeout(r, 400));
    setRefreshing(false);
  }, [loadProfile, setVendorStatus]);

  async function handleLogout() {
    Alert.alert("Log Out", "Are you sure you want to log out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Log Out",
        style: "destructive",
        onPress: async () => {
          await supabase.auth.signOut();
        },
      },
    ]);
  }

  function handleDeleteAccount() {
    Alert.alert(
      "Delete Account",
      "This action is permanent and cannot be undone. All your data will be lost.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () =>
            Alert.alert(
              "Contact Support",
              "Please email support@gather.gg to delete your account.",
            ),
        },
      ],
    );
  }

  const displayName =
    profile?.display_name ?? profile?.username ?? "User";
  const handle = profile?.username ? `@${profile.username}` : email ?? "";
  const memberSince = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString("en-US", {
        month: "short",
        year: "numeric",
      })
    : "";

  if (loading) {
    return (
      <SafeAreaView style={st.safe}>
        <StatusBar style="light" />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={C.accent} size="large" />
        </View>
      </SafeAreaView>
    );
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
            onRefresh={refreshAll}
            tintColor={C.accent}
          />
        }
      >
        {/* ── Profile Card ── */}
        <View style={st.profileCard}>
          <View style={st.avatarWrap}>
            {profile?.avatar_url ? (
              <Image source={{ uri: profile.avatar_url }} style={st.avatar} />
            ) : (
              <View style={[st.avatar, st.avatarPlaceholder]}>
                <Text style={st.avatarInitial}>
                  {displayName.charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
          </View>
          <View style={st.profileInfo}>
            <Text style={st.profileName}>{displayName}</Text>
            <Text style={st.profileHandle}>{handle}</Text>
            <View style={st.badgeRow}>
              {isVerifiedVendor && (
                <View style={st.badge}>
                  <Ionicons name="shield-checkmark" size={9} color={C.success} />
                  <Text style={st.badgeText}>Verified Seller</Text>
                </View>
              )}
              {vendorStatus === "pending" && (
                <View style={[st.badge, st.badgeYellow]}>
                  <Ionicons name="time" size={9} color="#F59E0B" />
                  <Text style={[st.badgeText, st.badgeTextYellow]}>
                    Pending Vendor
                  </Text>
                </View>
              )}
              {vendorStatus === "rejected" && (
                <View style={[st.badge, st.badgeRejected]}>
                  <Ionicons name="close-circle" size={9} color={C.danger} />
                  <Text style={[st.badgeText, st.badgeTextRejected]}>
                    Vendor Rejected
                  </Text>
                </View>
              )}
              {memberSince ? (
                <View style={[st.badge, st.badgeMuted]}>
                  <Text style={[st.badgeText, st.badgeTextMuted]}>
                    Since {memberSince}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
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
                Manage store, orders, listings &amp; shipments
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
                {vendorStatus === "pending"
                  ? "Application Pending"
                  : vendorStatus === "rejected"
                    ? "Reapply as Seller"
                    : "Become a Seller"}
              </Text>
              <Text style={st.vendorCardSub}>
                {vendorStatus === "pending"
                  ? "Your vendor application is under review"
                  : vendorStatus === "rejected"
                    ? "Your last application was rejected. Update and reapply."
                    : "Apply to sell cards on the Gather marketplace"}
              </Text>
            </View>
            <Feather name="chevron-right" size={18} color={C.textMuted} />
          </Pressable>
        )}

        {/* ── Activity Section ── */}
        <Text style={st.sectionTitle}>Activity</Text>
        <View style={st.sectionCard}>
          <SettingsRow
            icon="receipt-outline"
            label="My Orders"
            value={ordersCount > 0 ? `${ordersCount}` : undefined}
            onPress={() => push({ type: "MY_ORDERS" })}
          />
          <View style={st.divider} />
          <SettingsRow
            icon="pricetag-outline"
            label="My Listings"
            value={activeListingsCount > 0 ? `${activeListingsCount} active` : undefined}
            onPress={() => push({ type: "MY_LISTINGS" })}
          />
          <View style={st.divider} />
          <SettingsRow
            icon="chatbubbles-outline"
            label="Messages"
            onPress={() => push({ type: "MESSAGES" })}
          />
          <View style={st.divider} />
          <SettingsRow
            icon="cart-outline"
            label="Cart"
            onPress={() => push({ type: "CART" })}
          />
        </View>

        {/* ── Account Section ── */}
        <Text style={st.sectionTitle}>Account</Text>
        <View style={st.sectionCard}>
          <SettingsRow
            icon="person-outline"
            label="Display Name"
            value={profile?.display_name ?? "Not set"}
            onPress={() => push({ type: "EDIT_PROFILE" })}
          />
          <View style={st.divider} />
          <SettingsRow
            icon="at-outline"
            label="Username"
            value={profile?.username ?? "Not set"}
            onPress={() => push({ type: "EDIT_PROFILE" })}
          />
          <View style={st.divider} />
          <SettingsRow
            icon="mail-outline"
            label="Email"
            value={email ?? "Not set"}
          />
          <View style={st.divider} />
          <SettingsRow
            icon="lock-closed-outline"
            label="Change Password"
          />
        </View>

        {/* ── Trading Section ── */}
        <Text style={st.sectionTitle}>Trading</Text>
        <View style={st.sectionCard}>
          <SettingsRow icon="cube-outline" label="Shipping Address" />
          <View style={st.divider} />
          <SettingsRow icon="card-outline" label="Payment Methods" />
          <View style={st.divider} />
          <SettingsRow icon="cash-outline" label="Currency" value="USD" />
        </View>

        {/* ── Preferences Section ── */}
        <Text style={st.sectionTitle}>Preferences</Text>
        <View style={st.sectionCard}>
          <View style={st.row}>
            <View style={st.rowIcon}>
              <Ionicons name="notifications-outline" size={18} color={C.textIcon} />
            </View>
            <Text style={st.rowLabel}>Push Notifications</Text>
            <Switch
              value={notificationsEnabled}
              onValueChange={setNotificationsEnabled}
              trackColor={{ false: C.muted, true: C.accentSoft }}
              thumbColor={notificationsEnabled ? C.accent : C.textMuted}
              ios_backgroundColor={C.muted}
            />
          </View>
        </View>

        {/* ── Support Section ── */}
        <Text style={st.sectionTitle}>Support</Text>
        <View style={st.sectionCard}>
          <SettingsRow icon="help-circle-outline" label="Help Centre" />
          <View style={st.divider} />
          <SettingsRow icon="chatbubble-outline" label="Send Feedback" />
          <View style={st.divider} />
          <SettingsRow icon="document-text-outline" label="Terms of Service" />
          <View style={st.divider} />
          <SettingsRow icon="shield-outline" label="Privacy Policy" />
        </View>

        {/* ── Danger Zone ── */}
        <Text style={st.sectionTitle}>Danger Zone</Text>
        <View style={st.sectionCard}>
          <SettingsRow
            icon="log-out-outline"
            label="Log Out"
            danger
            onPress={handleLogout}
          />
          <View style={st.divider} />
          <SettingsRow
            icon="trash-outline"
            label="Delete Account"
            danger
            onPress={handleDeleteAccount}
          />
        </View>

        <Text style={st.version}>Gather v1.0.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Reusable row component ──

function SettingsRow({
  icon,
  label,
  value,
  danger,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  value?: string;
  danger?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable style={st.row} onPress={onPress}>
      <View style={[st.rowIcon, danger && st.rowIconDanger]}>
        <Ionicons
          name={icon}
          size={18}
          color={danger ? C.danger : C.textIcon}
        />
      </View>
      <Text style={[st.rowLabel, danger && st.rowLabelDanger]}>{label}</Text>
      <View style={st.rowRight}>
        {value && (
          <Text style={st.rowValue} numberOfLines={1}>
            {value}
          </Text>
        )}
        {!danger && (
          <Feather name="chevron-right" size={16} color={C.textMuted} />
        )}
      </View>
    </Pressable>
  );
}

// ── Styles ──

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

  // Profile
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
  avatarPlaceholder: {
    backgroundColor: C.accentGlow,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: {
    color: C.accent,
    fontSize: 22,
    fontWeight: "900",
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    color: C.textPrimary,
    fontSize: 17,
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
    flexWrap: "wrap",
    gap: 6,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "rgba(34,197,94,0.12)",
    borderRadius: S.radiusBadge,
    borderWidth: 1,
    borderColor: "rgba(34,197,94,0.3)",
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  badgeText: {
    color: C.success,
    fontSize: 9,
    fontWeight: "800",
  },
  badgeYellow: {
    backgroundColor: "rgba(245,158,11,0.12)",
    borderColor: "rgba(245,158,11,0.3)",
  },
  badgeTextYellow: {
    color: "#F59E0B",
  },
  badgeRejected: {
    backgroundColor: "rgba(239,68,68,0.12)",
    borderColor: "rgba(239,68,68,0.35)",
  },
  badgeTextRejected: {
    color: C.danger,
  },
  badgeMuted: {
    backgroundColor: C.elevated,
    borderColor: C.border,
  },
  badgeTextMuted: {
    color: C.textSecondary,
  },

  // Stats Grid
  statsGrid: {
    flexDirection: "row",
    gap: 8,
    marginBottom: S.lg,
  },
  statCard: {
    flex: 1,
    alignItems: "center",
    backgroundColor: C.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    paddingVertical: 12,
    gap: 4,
  },
  statIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  statValue: {
    color: C.textPrimary,
    fontSize: 16,
    fontWeight: "900",
  },
  statLabel: {
    color: C.textSecondary,
    fontSize: 9,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },

  // Vendor Card
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
  vendorCardTitle: {
    color: C.textPrimary,
    fontSize: 14,
    fontWeight: "800",
  },
  vendorCardSub: {
    color: C.textSecondary,
    fontSize: 11,
    fontWeight: "500",
  },

  // Sections
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
    marginBottom: S.xl,
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
    maxWidth: 140,
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
