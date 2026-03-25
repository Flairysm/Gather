import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { Feather, Ionicons } from "@expo/vector-icons";
import { C, S } from "../theme";
import { supabase } from "../lib/supabase";

type SellerProfile = {
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  rating: number | null;
  review_count: number;
};

type ExistingReview = {
  id: string;
  rating: number;
  comment: string | null;
};

type Props = {
  orderId: string;
  sellerId: string;
  onBack: () => void;
};

const STAR_LABELS = ["", "Terrible", "Poor", "Okay", "Good", "Excellent"];

export default function OrderReviewScreen({ orderId, sellerId, onBack }: Props) {
  const [seller, setSeller] = useState<SellerProfile | null>(null);
  const [existing, setExisting] = useState<ExistingReview | null>(null);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: sellerData }, { data: reviewData }] = await Promise.all([
      supabase
        .from("profiles")
        .select("display_name, username, avatar_url, rating, review_count")
        .eq("id", sellerId)
        .maybeSingle(),
      supabase
        .from("reviews")
        .select("id, rating, comment")
        .eq("order_id", orderId)
        .eq("seller_id", sellerId)
        .maybeSingle(),
    ]);

    if (sellerData) setSeller(sellerData as SellerProfile);
    if (reviewData) {
      setExisting(reviewData as ExistingReview);
      setRating((reviewData as ExistingReview).rating);
      setComment((reviewData as ExistingReview).comment ?? "");
    }
    setLoading(false);
  }, [orderId, sellerId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSubmit() {
    if (rating < 1 || rating > 5) {
      Alert.alert("Rating required", "Please select a star rating.");
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.rpc("submit_review", {
      p_order_id: orderId,
      p_seller_id: sellerId,
      p_rating: rating,
      p_comment: comment.trim() || null,
    });
    setSubmitting(false);

    if (error) {
      Alert.alert("Review Failed", error.message);
      return;
    }

    Alert.alert(
      existing ? "Review Updated" : "Review Submitted",
      "Thank you for your feedback!",
      [{ text: "OK", onPress: onBack }],
    );
  }

  const sellerName =
    seller?.display_name ?? seller?.username ?? "Seller";
  const sellerInitial = sellerName.charAt(0).toUpperCase();
  const isEditing = !!existing;

  if (loading) {
    return (
      <SafeAreaView style={st.safe}>
        <StatusBar style="light" />
        <View style={st.header}>
          <Pressable style={st.backBtn} onPress={onBack}>
            <Feather name="arrow-left" size={20} color={C.textPrimary} />
          </Pressable>
          <Text style={st.headerTitle}>Rate Seller</Text>
          <View style={{ width: 36 }} />
        </View>
        <View style={st.centerLoading}>
          <ActivityIndicator size="large" color={C.accent} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={st.safe}>
      <StatusBar style="light" />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={st.header}>
          <Pressable style={st.backBtn} onPress={onBack}>
            <Feather name="arrow-left" size={20} color={C.textPrimary} />
          </Pressable>
          <Text style={st.headerTitle}>
            {isEditing ? "Edit Review" : "Rate Seller"}
          </Text>
          <View style={{ width: 36 }} />
        </View>

        <ScrollView
          contentContainerStyle={st.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Seller card */}
          <View style={st.sellerCard}>
            <View style={st.sellerAvatar}>
              {seller?.avatar_url ? (
                <Image
                  source={{ uri: seller.avatar_url }}
                  style={st.sellerAvatarImg}
                />
              ) : (
                <Text style={st.sellerInitial}>{sellerInitial}</Text>
              )}
            </View>
            <View style={st.sellerInfo}>
              <Text style={st.sellerName}>{sellerName}</Text>
              {seller?.username && (
                <Text style={st.sellerHandle}>@{seller.username}</Text>
              )}
              <View style={st.sellerStatsRow}>
                <Ionicons name="star" size={12} color="#F59E0B" />
                <Text style={st.sellerRating}>
                  {Number(seller?.rating ?? 5).toFixed(1)}
                </Text>
                {(seller?.review_count ?? 0) > 0 && (
                  <Text style={st.sellerReviewCount}>
                    ({seller!.review_count} review
                    {seller!.review_count === 1 ? "" : "s"})
                  </Text>
                )}
              </View>
            </View>
          </View>

          {/* Star rating */}
          <View style={st.ratingSection}>
            <Text style={st.sectionLabel}>Your Rating</Text>
            <View style={st.starsRow}>
              {[1, 2, 3, 4, 5].map((star) => (
                <Pressable
                  key={star}
                  onPress={() => setRating(star)}
                  hitSlop={8}
                  style={st.starBtn}
                >
                  <Ionicons
                    name={star <= rating ? "star" : "star-outline"}
                    size={36}
                    color={star <= rating ? "#F59E0B" : C.textMuted}
                  />
                </Pressable>
              ))}
            </View>
            {rating > 0 && (
              <Text style={st.ratingLabel}>{STAR_LABELS[rating]}</Text>
            )}
          </View>

          {/* Comment */}
          <View style={st.commentSection}>
            <Text style={st.sectionLabel}>Comment (optional)</Text>
            <TextInput
              style={st.commentInput}
              value={comment}
              onChangeText={setComment}
              placeholder="How was your experience with this seller?"
              placeholderTextColor={C.textMuted}
              multiline
              textAlignVertical="top"
              maxLength={500}
            />
            <Text style={st.charCount}>{comment.length}/500</Text>
          </View>
        </ScrollView>

        {/* Submit */}
        <View style={st.bottomBar}>
          <Pressable
            style={[st.submitBtn, rating < 1 && st.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={rating < 1 || submitting}
          >
            {submitting ? (
              <ActivityIndicator size="small" color={C.textHero} />
            ) : (
              <Text
                style={[
                  st.submitBtnText,
                  rating < 1 && st.submitBtnTextDisabled,
                ]}
              >
                {isEditing ? "Update Review" : "Submit Review"}
              </Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  centerLoading: { flex: 1, alignItems: "center", justifyContent: "center" },

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
    textAlign: "center",
  },

  scroll: {
    paddingHorizontal: S.screenPadding,
    paddingTop: S.xl,
    paddingBottom: 40,
  },

  sellerCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.surface,
    borderRadius: S.radiusCard,
    borderWidth: 1,
    borderColor: C.border,
    padding: S.lg,
    gap: 14,
    marginBottom: S.xl,
  },
  sellerAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: C.elevated,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  sellerAvatarImg: { width: 52, height: 52, borderRadius: 26 },
  sellerInitial: { color: C.accent, fontSize: 18, fontWeight: "900" },
  sellerInfo: { flex: 1, gap: 2 },
  sellerName: { color: C.textPrimary, fontSize: 15, fontWeight: "800" },
  sellerHandle: { color: C.textSecondary, fontSize: 12, fontWeight: "600" },
  sellerStatsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  sellerRating: { color: "#F59E0B", fontSize: 12, fontWeight: "800" },
  sellerReviewCount: { color: C.textSecondary, fontSize: 11, fontWeight: "600" },

  ratingSection: {
    backgroundColor: C.surface,
    borderRadius: S.radiusCard,
    borderWidth: 1,
    borderColor: C.border,
    padding: S.lg,
    alignItems: "center",
    gap: 12,
    marginBottom: S.xl,
  },
  sectionLabel: {
    color: C.textSecondary,
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    alignSelf: "flex-start",
  },
  starsRow: {
    flexDirection: "row",
    gap: 10,
    paddingVertical: 8,
  },
  starBtn: { padding: 2 },
  ratingLabel: {
    color: C.textPrimary,
    fontSize: 14,
    fontWeight: "700",
  },

  commentSection: {
    backgroundColor: C.surface,
    borderRadius: S.radiusCard,
    borderWidth: 1,
    borderColor: C.border,
    padding: S.lg,
    gap: 10,
  },
  commentInput: {
    color: C.textPrimary,
    fontSize: 14,
    fontWeight: "500",
    minHeight: 100,
    backgroundColor: C.elevated,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    padding: 12,
    lineHeight: 20,
  },
  charCount: {
    color: C.textMuted,
    fontSize: 11,
    fontWeight: "600",
    textAlign: "right",
  },

  bottomBar: {
    paddingHorizontal: S.screenPadding,
    paddingTop: 10,
    paddingBottom: 30,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  submitBtn: {
    backgroundColor: C.accent,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  submitBtnDisabled: {
    backgroundColor: C.elevated,
    borderWidth: 1,
    borderColor: C.border,
  },
  submitBtnText: {
    color: C.textHero,
    fontSize: 15,
    fontWeight: "900",
  },
  submitBtnTextDisabled: {
    color: C.textMuted,
  },
});
