import {
  Alert,
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useCallback, useEffect, useState } from "react";
import { Share } from "react-native";
import { StatusBar } from "expo-status-bar";
import { Feather, Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { C, S } from "../theme";
import { wd } from "../styles/wantedDetail.styles";
import { formatBudget, formatListingPrice, timeAgo, type WantedPost } from "../data/market";
import { useAppNavigation } from "../navigation/NavigationContext";
import { supabase } from "../lib/supabase";
import ErrorState from "../components/ErrorState";
import Shimmer, { ShimmerGroup } from "../components/Shimmer";

type Props = {
  wantedId: string;
  onBack: () => void;
};

function describeExpiry(expiresAt: string | null): {
  expiryLabel: string | null;
  expiryExpired: boolean;
} {
  if (!expiresAt) return { expiryLabel: null, expiryExpired: false };
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return { expiryLabel: "Bounty expired", expiryExpired: true };
  const days = Math.ceil(ms / (24 * 60 * 60 * 1000));
  if (days === 1) return { expiryLabel: "Expires in 1 day", expiryExpired: false };
  if (days <= 60) return { expiryLabel: `Expires in ${days} days`, expiryExpired: false };
  return { expiryLabel: null, expiryExpired: false };
}

export default function WantedDetailScreen({ wantedId, onBack }: Props) {
  const { push } = useAppNavigation();
  const insets = useSafeAreaInsets();
  const [item, setItem] = useState<WantedPost | null>(null);
  const [similar, setSimilar] = useState<WantedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [togglingSave, setTogglingSave] = useState(false);
  const [meId, setMeId] = useState<string | null>(null);

  const loadPost = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    const { data, error } = await supabase
      .from("wanted_posts")
      .select(`
        id, buyer_id, card_name, edition, grade_wanted, offer_price, offer_price_max,
        category, description, image_url, views, status, created_at, expires_at,
        buyer:profiles!buyer_id(username, display_name, rating, total_purchases, avatar_url)
      `)
      .eq("id", wantedId)
      .maybeSingle();

    if (error) {
      console.warn("WantedDetail load error:", error.message);
      setItem(null);
      setLoadError(true);
      setLoading(false);
      return;
    }

    if (!data) {
      setItem(null);
      setSimilar([]);
      setLoadError(false);
      setLoading(false);
      return;
    }

    {
      const post = {
        ...data,
        buyer: Array.isArray(data.buyer) ? data.buyer[0] : data.buyer,
      } as WantedPost;
      setItem(post);

      const nowISO = new Date().toISOString();
      const { data: sim } = await supabase
        .from("wanted_posts")
        .select(`
          id, buyer_id, card_name, edition, grade_wanted, offer_price, offer_price_max,
          category, description, image_url, views, status, created_at, expires_at,
          buyer:profiles!buyer_id(username, display_name, rating, total_purchases, avatar_url)
        `)
        .eq("status", "active")
        .eq("category", post.category)
        .neq("id", wantedId)
        .or(`expires_at.is.null,expires_at.gt.${nowISO}`)
        .order("created_at", { ascending: false })
        .limit(6);

      if (sim) {
        setSimilar(
          (sim as any[]).map((r) => ({
            ...r,
            buyer: Array.isArray(r.buyer) ? r.buyer[0] : r.buyer,
          })),
        );
      }
    }
    setLoading(false);
  }, [wantedId]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setMeId(user.id);
        supabase
          .from("saved_items")
          .select("id")
          .eq("user_id", user.id)
          .eq("item_type", "wanted")
          .eq("item_id", wantedId)
          .maybeSingle()
          .then(({ data }) => setIsSaved(!!data));
      }
    });
    supabase.rpc("increment_wanted_views", { p_wanted_id: wantedId });
    loadPost().catch(() => setLoading(false));
  }, [loadPost]);

  function handleShare() {
    if (!item) return;
    Share.share({
      message: `Looking for "${item.card_name}" on Evend — offering ${formatBudget(item.offer_price, item.offer_price_max)}!`,
    });
  }

  async function handleToggleSave() {
    if (togglingSave) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      Alert.alert("Sign in required", "Please sign in to bookmark wanted posts.");
      return;
    }
    setTogglingSave(true);
    const { data, error } = await supabase.rpc("toggle_save_item", {
      p_item_type: "wanted",
      p_item_id: wantedId,
    });
    setTogglingSave(false);
    if (error) {
      console.warn("WantedDetailScreen toggle save failed:", error.message);
      Alert.alert("Error", "Failed to save item. Please try again.");
      return;
    }
    setIsSaved((data as any).saved);
  }

  if (loading) {
    return (
      <SafeAreaView style={wd.safe}>
        <StatusBar style="light" />
        <View style={wd.header}>
          <Pressable style={wd.backBtn} onPress={onBack}>
            <Feather name="arrow-left" size={20} color={C.textPrimary} />
          </Pressable>
          <Text style={wd.headerTitle}>Wanted</Text>
          <View style={{ width: 68 }} />
        </View>
        <ShimmerGroup>
          <ScrollView contentContainerStyle={{ padding: S.screenPadding, gap: 14 }}>
            <Shimmer width="100%" height={220} borderRadius={S.radiusCard} />
            <Shimmer width="35%" height={12} borderRadius={6} />
            <Shimmer width="75%" height={20} borderRadius={6} />
            <Shimmer width="50%" height={13} borderRadius={6} />
            <View style={{ height: 8 }} />
            <Shimmer width="30%" height={10} borderRadius={5} />
            <Shimmer width="45%" height={22} borderRadius={6} />
            <View style={{ height: 12 }} />
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Shimmer width={40} height={40} borderRadius={20} />
              <View style={{ flex: 1, gap: 6 }}>
                <Shimmer width="50%" height={13} borderRadius={5} />
                <Shimmer width="35%" height={10} borderRadius={5} />
              </View>
            </View>
          </ScrollView>
        </ShimmerGroup>
      </SafeAreaView>
    );
  }

  if (!item) {
    return (
      <SafeAreaView style={wd.safe}>
        <StatusBar style="light" />
        <View style={wd.header}>
          <Pressable style={wd.backBtn} onPress={onBack}>
            <Feather name="arrow-left" size={20} color={C.textPrimary} />
          </Pressable>
          <Text style={wd.headerTitle}>Wanted</Text>
          <View style={{ width: 68 }} />
        </View>
        {loadError ? (
          <ErrorState message="Failed to load post. Check your connection and try again." onRetry={loadPost} />
        ) : (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ color: C.textMuted, fontSize: 14 }}>Post not found</Text>
          </View>
        )}
      </SafeAreaView>
    );
  }

  const { expiryLabel, expiryExpired } = describeExpiry(item.expires_at);

  return (
    <SafeAreaView style={wd.safe}>
      <StatusBar style="light" />

      <View style={wd.header}>
        <Pressable style={wd.backBtn} onPress={onBack}>
          <Feather name="arrow-left" size={20} color={C.textPrimary} />
        </Pressable>
        <Text style={wd.headerTitle}>Wanted</Text>
        <View style={wd.headerActions}>
          <Pressable style={wd.headerIconBtn} onPress={handleShare}>
            <Feather name="share" size={16} color={C.textSearch} />
          </Pressable>
          <Pressable style={wd.headerIconBtn} onPress={handleToggleSave}>
            <Ionicons name={isSaved ? "bookmark" : "bookmark-outline"} size={16} color={isSaved ? C.accent : C.textSearch} />
          </Pressable>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={wd.scroll}
      >
        {/* Hero Art */}
        <View style={wd.heroArt}>
          {item.image_url ? (
            <Image
              source={{ uri: item.image_url }}
              style={{ width: "100%", height: "100%", borderRadius: 12 }}
            />
          ) : (
            <Text style={wd.heroPlaceholderText}>Card Image</Text>
          )}
          <View style={wd.wtbBadge}>
            <Text style={wd.wtbBadgeText}>WTB</Text>
          </View>
          {item.grade_wanted && (
            <View style={wd.gradeWantedBadge}>
              <Ionicons name="shield-checkmark" size={12} color={C.textAccent} />
              <Text style={wd.gradeWantedText}>{item.grade_wanted}</Text>
            </View>
          )}
          <View style={wd.viewsBadge}>
            <Feather name="eye" size={12} color={C.textPrimary} />
            <Text style={wd.viewsText}>
              {(item.views ?? 0).toLocaleString()} views
            </Text>
          </View>
        </View>

        {/* Card Info */}
        <View style={wd.infoSection}>
          <View style={wd.categoryChip}>
            <Text style={wd.categoryText}>{item.category}</Text>
          </View>
          <Text style={wd.cardName}>{item.card_name}</Text>
          <Text style={wd.editionText}>{item.edition ?? "—"}</Text>
        </View>

        {/* Offer Price Row */}
        <View style={wd.priceRow}>
          <View style={{ flexShrink: 1, marginRight: 10 }}>
            <Text style={wd.priceLabel}>Offering</Text>
            <Text style={wd.price} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
              {formatBudget(item.offer_price, item.offer_price_max)}
            </Text>
          </View>
          {item.grade_wanted && (
            <View style={wd.gradeChip}>
              <Ionicons name="shield-checkmark-outline" size={13} color={C.textIcon} />
              <Text style={wd.gradeChipText}>{item.grade_wanted}</Text>
            </View>
          )}
        </View>

        {expiryLabel && (
          <View style={wd.expiryChip}>
            <Ionicons
              name={expiryExpired ? "time-outline" : "time"}
              size={13}
              color={expiryExpired ? C.danger : C.textSecondary}
            />
            <Text style={[wd.expiryChipText, expiryExpired && wd.expiryChipExpired]}>
              {expiryLabel}
            </Text>
          </View>
        )}

        <View style={wd.divider} />

        {/* Buyer */}
        <View style={wd.buyerSection}>
          {item.buyer?.avatar_url ? (
            <Image source={{ uri: item.buyer.avatar_url }} style={wd.buyerAvatarImg} />
          ) : (
            <View style={wd.buyerAvatar}>
              <Text style={wd.buyerAvatarText}>
                {(item.buyer?.username ?? "U").charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
          <View style={wd.buyerInfo}>
            <Text style={wd.buyerName}>@{item.buyer?.username ?? "user"}</Text>
            <View style={wd.buyerMeta}>
              <View style={wd.ratingRow}>
                <Ionicons name="star" size={12} color="#F59E0B" />
                <Text style={wd.ratingText}>{Number(item.buyer?.rating ?? 5).toFixed(1)}</Text>
              </View>
              <Text style={wd.purchasesText}>
                {item.buyer?.total_purchases ?? 0} purchases
              </Text>
            </View>
          </View>
          <Pressable
            style={wd.viewProfileBtn}
            onPress={() => push({ type: "USER_PROFILE", userId: item.buyer_id })}
          >
            <Text style={wd.viewProfileText}>View Profile</Text>
          </Pressable>
        </View>

        <View style={wd.divider} />

        {/* Description */}
        {item.description && (
          <>
            <View style={wd.descSection}>
              <Text style={wd.descTitle}>What They're Looking For</Text>
              <Text style={wd.descText}>{item.description}</Text>
              <View style={wd.detailChips}>
                {item.grade_wanted && (
                  <View style={wd.detailChip}>
                    <Text style={wd.detailChipLabel}>Grade</Text>
                    <Text style={wd.detailChipValue}>{item.grade_wanted}</Text>
                  </View>
                )}
                <View style={wd.detailChip}>
                  <Text style={wd.detailChipLabel}>Budget</Text>
                  <Text style={wd.detailChipValue}>{formatBudget(item.offer_price, item.offer_price_max)}</Text>
                </View>
                <View style={wd.detailChip}>
                  <Text style={wd.detailChipLabel}>Posted</Text>
                  <Text style={wd.detailChipValue}>{timeAgo(item.created_at)}</Text>
                </View>
              </View>
            </View>
            <View style={wd.divider} />
          </>
        )}

        {/* Similar Wanted */}
        {similar.length > 0 && (
          <View style={wd.similarSection}>
            <Text style={wd.similarTitle}>Similar Wanted</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={wd.similarScroll}
            >
              {similar.map((s) => (
                <Pressable
                  key={s.id}
                  style={wd.similarCard}
                  onPress={() =>
                    push({ type: "WANTED_DETAIL", wantedId: s.id })
                  }
                >
                  <View style={wd.similarArt}>
                    {s.image_url ? (
                      <Image
                        source={{ uri: s.image_url }}
                        style={{ width: "100%", height: "100%", borderRadius: 8 }}
                      />
                    ) : null}
                  </View>
                  <View style={wd.similarWtbTag}>
                    <Text style={wd.similarWtbText}>WTB</Text>
                  </View>
                  <Text style={wd.similarName} numberOfLines={1}>
                    {s.card_name}
                  </Text>
                  <Text style={wd.similarEdition}>{s.edition ?? "—"}</Text>
                  <Text style={wd.similarPrice}>{formatBudget(s.offer_price, s.offer_price_max)}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}
      </ScrollView>

      {/* Bottom Bar */}
      <View style={[wd.bottomBar, { paddingBottom: Math.max(insets.bottom, 14) }]}>
        {meId && item.buyer_id === meId ? (
          <View style={wd.ownPostNote}>
            <Ionicons name="information-circle-outline" size={16} color={C.textMuted} />
            <Text style={wd.ownPostText}>This is your wanted post</Text>
          </View>
        ) : expiryExpired ? (
          <View style={wd.ownPostNote}>
            <Ionicons name="time-outline" size={16} color={C.danger} />
            <Text style={[wd.ownPostText, { color: C.danger }]}>This bounty has expired</Text>
          </View>
        ) : (
          <>
            <Pressable
              style={wd.msgBuyerBtn}
              onPress={() =>
                push({
                  type: "CHAT",
                  sellerId: item.buyer_id,
                  wantedId: item.id,
                  topic: item.card_name,
                })
              }
            >
              <Feather name="message-circle" size={18} color={C.textPrimary} />
              <Text style={wd.msgBuyerText}>Message</Text>
            </Pressable>
            <Pressable
              style={wd.haveCardBtn}
              onPress={() =>
                push({
                  type: "CHAT",
                  sellerId: item.buyer_id,
                  wantedId: item.id,
                  shareWantedId: item.id,
                  initialMessage: "I have this card",
                  topic: item.card_name,
                })
              }
            >
              <Ionicons name="card" size={18} color={C.textHero} />
              <Text style={wd.haveCardText}>I Have This Card</Text>
            </Pressable>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}
