import {
  ActivityIndicator,
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

import { C } from "../theme";
import { wd } from "../styles/wantedDetail.styles";
import { formatListingPrice, timeAgo, type WantedPost } from "../data/market";
import { useAppNavigation } from "../navigation/NavigationContext";
import { supabase } from "../lib/supabase";

type Props = {
  wantedId: string;
  onBack: () => void;
};

export default function WantedDetailScreen({ wantedId, onBack }: Props) {
  const { push } = useAppNavigation();
  const insets = useSafeAreaInsets();
  const [item, setItem] = useState<WantedPost | null>(null);
  const [similar, setSimilar] = useState<WantedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSaved, setIsSaved] = useState(false);
  const [togglingSave, setTogglingSave] = useState(false);

  const loadPost = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("wanted_posts")
      .select(`
        id, buyer_id, card_name, edition, grade_wanted, offer_price,
        category, description, image_url, views, status, created_at,
        buyer:profiles!buyer_id(username, display_name, rating, total_purchases, avatar_url)
      `)
      .eq("id", wantedId)
      .maybeSingle();

    if (data) {
      const post = {
        ...data,
        buyer: Array.isArray(data.buyer) ? data.buyer[0] : data.buyer,
      } as WantedPost;
      setItem(post);

      const { data: sim } = await supabase
        .from("wanted_posts")
        .select(`
          id, buyer_id, card_name, edition, grade_wanted, offer_price,
          category, description, image_url, views, status, created_at,
          buyer:profiles!buyer_id(username, display_name, rating, total_purchases, avatar_url)
        `)
        .eq("status", "active")
        .eq("category", post.category)
        .neq("id", wantedId)
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
      message: `Looking for "${item.card_name}" on Gather — offering ${formatListingPrice(item.offer_price)}!`,
    });
  }

  async function handleToggleSave() {
    if (togglingSave) return;
    setTogglingSave(true);
    const { data, error } = await supabase.rpc("toggle_save_item", {
      p_item_type: "wanted",
      p_item_id: wantedId,
    });
    setTogglingSave(false);
    if (!error) setIsSaved((data as any).saved);
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
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color={C.accent} />
        </View>
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
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: C.textMuted, fontSize: 14 }}>Post not found</Text>
        </View>
      </SafeAreaView>
    );
  }

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
          <View>
            <Text style={wd.priceLabel}>Offering</Text>
            <Text style={wd.price}>{formatListingPrice(item.offer_price)}</Text>
          </View>
          {item.grade_wanted && (
            <View style={wd.gradeChip}>
              <Ionicons name="shield-checkmark-outline" size={13} color={C.textIcon} />
              <Text style={wd.gradeChipText}>{item.grade_wanted}</Text>
            </View>
          )}
        </View>

        <View style={wd.divider} />

        {/* Buyer */}
        <View style={wd.buyerSection}>
          <View style={wd.buyerAvatar}>
            <Text style={wd.buyerAvatarText}>
              {(item.buyer?.username ?? "U").charAt(0).toUpperCase()}
            </Text>
          </View>
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
          <Pressable style={wd.viewProfileBtn}>
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
                  <Text style={wd.detailChipValue}>{formatListingPrice(item.offer_price)}</Text>
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
                  <Text style={wd.similarPrice}>{formatListingPrice(s.offer_price)}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}
      </ScrollView>

      {/* Bottom Bar */}
      <View style={[wd.bottomBar, { paddingBottom: Math.max(insets.bottom, 14) }]}>
        <Pressable
          style={wd.msgBuyerBtn}
          onPress={() => push({ type: "MESSAGES" })}
        >
          <Feather name="message-circle" size={18} color={C.textPrimary} />
          <Text style={wd.msgBuyerText}>Message</Text>
        </Pressable>
        <Pressable
          style={wd.haveCardBtn}
          onPress={() => push({ type: "MESSAGES" })}
        >
          <Ionicons name="card" size={18} color={C.textHero} />
          <Text style={wd.haveCardText}>I Have This Card</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
