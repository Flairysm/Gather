import { Pressable, SafeAreaView, ScrollView, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { Feather, Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { C, S } from "../theme";
import { wd } from "../styles/wantedDetail.styles";
import { wantedPosts, type WantedPost } from "../data/market";
import { useAppNavigation } from "../navigation/NavigationContext";
import { conversations } from "../data/messages";

type Props = {
  wantedId: string;
  onBack: () => void;
};

export default function WantedDetailScreen({ wantedId, onBack }: Props) {
  const { push } = useAppNavigation();
  const insets = useSafeAreaInsets();
  const item = wantedPosts.find((w) => w.id === wantedId);

  if (!item) return null;

  const similar = wantedPosts.filter(
    (w) => w.category === item.category && w.id !== item.id,
  );

  const buyerConversation = conversations.find(
    (c) => c.user === item.buyer && c.topic?.toLowerCase().includes(item.cardName.toLowerCase()),
  ) ?? conversations.find((c) => c.user === item.buyer);

  return (
    <SafeAreaView style={wd.safe}>
      <StatusBar style="light" />

      {/* ── Header ── */}
      <View style={wd.header}>
        <Pressable style={wd.backBtn} onPress={onBack}>
          <Feather name="arrow-left" size={20} color={C.textPrimary} />
        </Pressable>
        <Text style={wd.headerTitle}>Wanted</Text>
        <View style={wd.headerActions}>
          <Pressable style={wd.headerIconBtn}>
            <Feather name="share" size={16} color={C.textSearch} />
          </Pressable>
          <Pressable style={wd.headerIconBtn}>
            <Feather name="bookmark" size={16} color={C.textSearch} />
          </Pressable>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={wd.scroll}
      >
        {/* ── Hero Art ── */}
        <View style={wd.heroArt}>
          <Text style={wd.heroPlaceholderText}>Card Image</Text>
          <View style={wd.wtbBadge}>
            <Text style={wd.wtbBadgeText}>WTB</Text>
          </View>
          <View style={wd.gradeWantedBadge}>
            <Ionicons name="shield-checkmark" size={12} color={C.textAccent} />
            <Text style={wd.gradeWantedText}>{item.gradeWanted}</Text>
          </View>
          <View style={wd.viewsBadge}>
            <Feather name="eye" size={12} color={C.textPrimary} />
            <Text style={wd.viewsText}>
              {item.views.toLocaleString()} views
            </Text>
          </View>
        </View>

        {/* ── Card Info ── */}
        <View style={wd.infoSection}>
          <View style={wd.categoryChip}>
            <Text style={wd.categoryText}>{item.category}</Text>
          </View>
          <Text style={wd.cardName}>{item.cardName}</Text>
          <Text style={wd.editionText}>{item.edition}</Text>
        </View>

        {/* ── Offer Price Row ── */}
        <View style={wd.priceRow}>
          <View>
            <Text style={wd.priceLabel}>Offering</Text>
            <Text style={wd.price}>{item.offerPrice}</Text>
          </View>
          <View style={wd.gradeChip}>
            <Ionicons name="shield-checkmark-outline" size={13} color={C.textIcon} />
            <Text style={wd.gradeChipText}>{item.gradeWanted}</Text>
          </View>
        </View>

        <View style={wd.divider} />

        {/* ── Buyer ── */}
        <View style={wd.buyerSection}>
          <View style={wd.buyerAvatar}>
            <Text style={wd.buyerAvatarText}>
              {item.buyer.charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={wd.buyerInfo}>
            <Text style={wd.buyerName}>@{item.buyer}</Text>
            <View style={wd.buyerMeta}>
              <View style={wd.ratingRow}>
                <Ionicons name="star" size={12} color="#F59E0B" />
                <Text style={wd.ratingText}>{item.buyerRating}</Text>
              </View>
              <Text style={wd.purchasesText}>
                {item.buyerPurchases} purchases
              </Text>
            </View>
          </View>
          <Pressable style={wd.viewProfileBtn}>
            <Text style={wd.viewProfileText}>View Profile</Text>
          </Pressable>
        </View>

        <View style={wd.divider} />

        {/* ── Description ── */}
        <View style={wd.descSection}>
          <Text style={wd.descTitle}>What They're Looking For</Text>
          <Text style={wd.descText}>{item.description}</Text>
          <View style={wd.detailChips}>
            <View style={wd.detailChip}>
              <Text style={wd.detailChipLabel}>Grade</Text>
              <Text style={wd.detailChipValue}>{item.gradeWanted}</Text>
            </View>
            <View style={wd.detailChip}>
              <Text style={wd.detailChipLabel}>Budget</Text>
              <Text style={wd.detailChipValue}>{item.offerPrice}</Text>
            </View>
            <View style={wd.detailChip}>
              <Text style={wd.detailChipLabel}>Posted</Text>
              <Text style={wd.detailChipValue}>{item.postedAt}</Text>
            </View>
          </View>
        </View>

        <View style={wd.divider} />

        {/* ── Similar Wanted ── */}
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
                  <View style={wd.similarArt} />
                  <View style={wd.similarWtbTag}>
                    <Text style={wd.similarWtbText}>WTB</Text>
                  </View>
                  <Text style={wd.similarName} numberOfLines={1}>
                    {s.cardName}
                  </Text>
                  <Text style={wd.similarEdition}>{s.edition}</Text>
                  <Text style={wd.similarPrice}>{s.offerPrice}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}
      </ScrollView>

      {/* ── Bottom Bar ── */}
      <View style={[wd.bottomBar, { paddingBottom: Math.max(insets.bottom, 14) }]}>
        <Pressable
          style={wd.msgBuyerBtn}
          onPress={() => {
            if (buyerConversation) {
              push({ type: "CHAT", conversationId: buyerConversation.id });
              return;
            }
            push({ type: "MESSAGES" });
          }}
        >
          <Feather name="message-circle" size={18} color={C.textPrimary} />
          <Text style={wd.msgBuyerText}>Message</Text>
        </Pressable>
        <Pressable
          style={wd.haveCardBtn}
          onPress={() => {
            if (buyerConversation) {
              push({ type: "CHAT", conversationId: buyerConversation.id, openOffer: true });
              return;
            }
            push({ type: "MESSAGES" });
          }}
        >
          <Ionicons name="card" size={18} color={C.textHero} />
          <Text style={wd.haveCardText}>I Have This Card</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
