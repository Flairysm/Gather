import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
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
import { useBadgeContext } from "../hooks/useBadgeCounts";

const ORDER_SHORTCUTS = [
  { label: "To Pay", filter: "pending", icon: "card-outline", color: "#F59E0B", bg: "rgba(245,158,11,0.10)" },
  { label: "To Ship", filter: "confirmed", icon: "cube-outline", color: C.accent, bg: "rgba(44,128,255,0.10)" },
  { label: "To Receive", filter: "shipped", icon: "car-outline", color: "#8B5CF6", bg: "rgba(139,92,246,0.10)" },
  { label: "To Rate", filter: "to_rate", icon: "star-outline", color: "#F97316", bg: "rgba(249,115,22,0.10)" },
] as const;

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
  phone_number: string | null;
  phone_verified: boolean;
  transaction_banned: boolean;
  transaction_ban_reason: string | null;
};


export default function SettingsScreen() {
  const { push } = useAppNavigation();
  const { isVerifiedVendor, vendorStatus, setVendorStatus } = useUser();
  const { counts, refresh: refreshBadges } = useBadgeContext();
  const [refreshing, setRefreshing] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [activeListingsCount, setActiveListingsCount] = useState(0);
  const [ordersCount, setOrdersCount] = useState(0);
  const [addressCount, setAddressCount] = useState(0);
  const [bookmarksCount, setBookmarksCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);

  const loadProfile = useCallback(async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      setEmail(user.email ?? null);

      const { data, error: profileError } = await supabase
        .from("profiles")
        .select(
          "username, display_name, avatar_url, bio, rating, total_sales, total_purchases, verified_seller, created_at, phone_number, phone_verified, transaction_banned, transaction_ban_reason",
        )
        .eq("id", user.id)
        .maybeSingle();

      if (profileError) {
        console.warn("SettingsScreen loadProfile failed:", profileError.message);
      } else if (data) {
        setProfile(data as Profile);
      }

      const [listResult, orderResult, addrResult, savedResult] = await Promise.all([
        supabase
          .from("listings")
          .select("id", { count: "exact", head: true })
          .eq("seller_id", user.id)
          .eq("status", "active"),
        supabase
          .from("orders")
          .select("id", { count: "exact", head: true })
          .eq("buyer_id", user.id),
        supabase
          .from("user_addresses")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id),
        supabase
          .from("saved_items")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id),
      ]);

      if (listResult.error) console.warn("SettingsScreen listings count failed:", listResult.error.message);
      if (orderResult.error) console.warn("SettingsScreen orders count failed:", orderResult.error.message);
      if (addrResult.error) console.warn("SettingsScreen addresses count failed:", addrResult.error.message);
      if (savedResult.error) console.warn("SettingsScreen saved count failed:", savedResult.error.message);

      setActiveListingsCount(listResult.count ?? 0);
      setOrdersCount(orderResult.count ?? 0);
      setAddressCount(addrResult.count ?? 0);
      setBookmarksCount(savedResult.count ?? 0);
    } catch (e) {
      console.warn("SettingsScreen loadProfile unexpected error:", e);
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
      refreshBadges().catch(() => {}),
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
              "Please email support@evend.gg to delete your account.",
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
              {counts.pendingShipments > 0 && (
                <View style={st.vendorIconBadge}>
                  <Text style={st.vendorIconBadgeText}>
                    {counts.pendingShipments > 99 ? "99+" : counts.pendingShipments}
                  </Text>
                </View>
              )}
            </View>
            <View style={st.vendorCardInfo}>
              <Text style={st.vendorCardTitle}>Vendor Hub</Text>
              <Text style={st.vendorCardSub}>
                {counts.pendingShipments > 0
                  ? `${counts.pendingShipments} order${counts.pendingShipments === 1 ? "" : "s"} to ship`
                  : "Manage store, orders, listings & shipments"}
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
                    : "Apply to sell cards on the Evend marketplace"}
              </Text>
            </View>
            <Feather name="chevron-right" size={18} color={C.textMuted} />
          </Pressable>
        )}

        {/* ── My Orders Grid ── */}
        <Pressable
          style={st.ordersCard}
          onPress={() => push({ type: "MY_ORDERS" })}
        >
          <View style={st.ordersHeader}>
            <Text style={st.ordersHeaderTitle}>My Orders</Text>
            <View style={st.ordersHeaderRight}>
              <Feather name="chevron-right" size={18} color={C.textMuted} />
            </View>
          </View>
          <View style={st.ordersGrid}>
            {ORDER_SHORTCUTS.map((s) => (
              <Pressable
                key={s.filter}
                style={st.ordersGridItem}
                onPress={() => push({ type: "MY_ORDERS", filter: s.filter })}
              >
                <View style={[st.ordersIconWrap, { backgroundColor: s.bg }]}>
                  <Ionicons name={s.icon as any} size={22} color={s.color} />
                  {((counts.myOrdersByCategory as any)[s.filter] ?? 0) > 0 && (
                    <View style={st.ordersItemBadge}>
                      <Text style={st.ordersItemBadgeText}>
                        {((counts.myOrdersByCategory as any)[s.filter] ?? 0) > 99
                          ? "99+"
                          : (counts.myOrdersByCategory as any)[s.filter]}
                      </Text>
                    </View>
                  )}
                </View>
                <Text style={st.ordersGridLabel}>{s.label}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>

        {/* ── Activity Section ── */}
        <Text style={st.sectionTitle}>Activity</Text>
        <View style={st.sectionCard}>
          <SettingsRow
            icon="pricetag-outline"
            label="My Listings"
            value={activeListingsCount > 0 ? `${activeListingsCount} active` : undefined}
            onPress={() => push({ type: "MY_LISTINGS" })}
          />
          <View style={st.divider} />
          <SettingsRow
            icon="bookmark-outline"
            label="My Bookmarks"
            value={bookmarksCount > 0 ? `${bookmarksCount}` : undefined}
            onPress={() => push({ type: "MY_BOOKMARKS" })}
          />
          <View style={st.divider} />
          <SettingsRow
            icon="hammer-outline"
            label="My Auctions"
            onPress={() => push({ type: "MY_AUCTIONS" })}
          />
          <View style={st.divider} />
          <SettingsRow
            icon="chatbubbles-outline"
            label="Messages"
            value={counts.unreadChats > 0 ? `${counts.unreadChats} unread` : undefined}
            onPress={() => push({ type: "MESSAGES" })}
          />
          <View style={st.divider} />
          <SettingsRow
            icon="notifications-outline"
            label="Notifications"
            value={counts.unreadNotifications > 0 ? `${counts.unreadNotifications} new` : undefined}
            onPress={() => push({ type: "NOTIFICATIONS_HUB" })}
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
            onPress={() => {
              if (!email) return;
              Alert.alert(
                "Reset Password",
                `We'll send a password reset link to ${email}.`,
                [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Send Link",
                    onPress: async () => {
                      const { error } = await supabase.auth.resetPasswordForEmail(email);
                      if (error) Alert.alert("Error", error.message);
                      else Alert.alert("Email Sent", "Check your inbox for the reset link.");
                    },
                  },
                ],
              );
            }}
          />
        </View>

        {/* ── Trading Section ── */}
        <Text style={st.sectionTitle}>Trading</Text>
        <View style={st.sectionCard}>
          <SettingsRow
            icon="call-outline"
            label="Phone Verification"
            value={profile?.phone_verified ? "Verified" : "Not verified"}
            onPress={() => push({ type: "PHONE_VERIFY" })}
          />
          <View style={st.divider} />
          <SettingsRow
            icon="location-outline"
            label="Address Book"
            value={addressCount > 0 ? `${addressCount} saved` : "No addresses"}
            onPress={() => push({ type: "ADDRESS_BOOK" })}
          />
          <View style={st.divider} />
          <SettingsRow icon="card-outline" label="Payment Methods" />
          <View style={st.divider} />
          <SettingsRow icon="cash-outline" label="Currency" value="MYR" />
        </View>

        {profile?.transaction_banned && (
          <>
            <Text style={st.sectionTitle}>Account Status</Text>
            <View style={[st.sectionCard, { borderColor: "rgba(239,68,68,0.25)" }]}>
              <View style={st.row}>
                <View style={[st.rowIcon, st.rowIconDanger]}>
                  <Ionicons name="ban" size={18} color={C.danger} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[st.rowLabel, { color: C.danger }]}>Transaction Banned</Text>
                  <Text style={{ color: C.textSecondary, fontSize: 11, fontWeight: "500" }}>
                    {profile.transaction_ban_reason ?? "Contact support for details"}
                  </Text>
                </View>
              </View>
            </View>
          </>
        )}

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
          <View style={st.divider} />
          <SettingsRow
            icon="options-outline"
            label="My Feed Categories"
            onPress={() => push({ type: "FEED_PREFERENCES" })}
          />
        </View>

        {/* ── Support Section ── */}
        <Text style={st.sectionTitle}>Support</Text>
        <View style={st.sectionCard}>
          <SettingsRow
            icon="help-circle-outline"
            label="Help Centre"
            onPress={() => Linking.openURL("https://evend.gg/help")}
          />
          <View style={st.divider} />
          <SettingsRow
            icon="chatbubble-outline"
            label="Send Feedback"
            onPress={() => Linking.openURL("mailto:support@evend.gg?subject=App Feedback")}
          />
          <View style={st.divider} />
          <SettingsRow
            icon="document-text-outline"
            label="Terms of Service"
            onPress={() => Linking.openURL("https://evend.gg/terms")}
          />
          <View style={st.divider} />
          <SettingsRow
            icon="shield-outline"
            label="Privacy Policy"
            onPress={() => Linking.openURL("https://evend.gg/privacy")}
          />
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

        <Text style={st.version}>Evend v1.0.0</Text>
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
  vendorIconBadge: {
    position: "absolute",
    top: -5,
    right: -5,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: C.live,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  vendorIconBadgeText: {
    color: "#fff",
    fontSize: 9,
    fontWeight: "900",
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
  sectionHint: {
    color: C.textMuted,
    fontSize: 11,
    fontWeight: "500",
    marginBottom: S.sm + 2,
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

  // My Orders grid
  ordersCard: {
    backgroundColor: C.surface,
    borderRadius: S.radiusCard,
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: S.xl,
    overflow: "hidden",
  },
  ordersHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: S.lg,
    paddingTop: S.lg,
    paddingBottom: S.sm,
  },
  ordersHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  ordersHeaderTitle: {
    color: C.textPrimary,
    fontSize: 15,
    fontWeight: "800",
  },
  ordersGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 8,
    paddingBottom: S.md,
  },
  ordersGridItem: {
    width: "25%",
    alignItems: "center",
    paddingVertical: 10,
    gap: 6,
  },
  ordersIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  ordersItemBadge: {
    position: "absolute",
    top: -5,
    right: -5,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: C.live,
    borderWidth: 2,
    borderColor: C.surface,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  ordersItemBadgeText: {
    color: "#fff",
    fontSize: 9,
    fontWeight: "900",
  },
  ordersGridLabel: {
    color: C.textSecondary,
    fontSize: 10,
    fontWeight: "700",
    textAlign: "center",
  },
  badgeCount: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: C.live,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  badgeCountText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "800",
  },

  version: {
    color: C.textMuted,
    fontSize: 11,
    fontWeight: "500",
    textAlign: "center",
    marginTop: S.md,
  },
});
