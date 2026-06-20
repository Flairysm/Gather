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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { C, S } from "../theme";
import { supabase } from "../lib/supabase";
import { requireNetwork } from "../lib/network";
import ScreenHeader from "../components/ScreenHeader";

const MAX_REVIEW_PHOTOS = 6;

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
  photos: string[] | null;
};

type Props = {
  orderId: string;
  sellerId: string;
  onBack: () => void;
};

const STAR_LABELS = ["", "Terrible", "Poor", "Okay", "Good", "Excellent"];

export default function OrderReviewScreen({ orderId, sellerId, onBack }: Props) {
  const insets = useSafeAreaInsets();
  const [seller, setSeller] = useState<SellerProfile | null>(null);
  const [existing, setExisting] = useState<ExistingReview | null>(null);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [sellerResult, reviewResult] = await Promise.all([
      supabase
        .from("profiles")
        .select("display_name, username, avatar_url, rating, review_count")
        .eq("id", sellerId)
        .maybeSingle(),
      supabase
        .from("reviews")
        .select("id, rating, comment, photos")
        .eq("order_id", orderId)
        .eq("seller_id", sellerId)
        .maybeSingle(),
    ]);

    if (sellerResult.error) console.warn("OrderReviewScreen seller load:", sellerResult.error.message);
    if (reviewResult.error) console.warn("OrderReviewScreen review load:", reviewResult.error.message);

    if (sellerResult.data) setSeller(sellerResult.data as SellerProfile);
    if (reviewResult.data) {
      const r = reviewResult.data as ExistingReview;
      setExisting(r);
      setRating(r.rating);
      setComment(r.comment ?? "");
      setPhotos(Array.isArray(r.photos) ? r.photos : []);
    }
    setLoading(false);
  }, [orderId, sellerId]);

  useEffect(() => {
    load();
  }, [load]);

  async function pickPhotos() {
    if (photos.length >= MAX_REVIEW_PHOTOS) {
      Alert.alert("Limit reached", `You can attach up to ${MAX_REVIEW_PHOTOS} photos.`);
      return;
    }
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission needed", "Photo access is required to attach photos.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      selectionLimit: MAX_REVIEW_PHOTOS - photos.length,
      quality: 0.7,
    });
    if (result.canceled) return;
    const uris = result.assets.map((a) => a.uri);
    setPhotos((prev) => [...prev, ...uris].slice(0, MAX_REVIEW_PHOTOS));
  }

  function removePhoto(uri: string) {
    setPhotos((prev) => prev.filter((p) => p !== uri));
  }

  async function uploadPhoto(localUri: string, userId: string): Promise<string> {
    const extMatch = localUri.match(/\.(\w+)(\?|$)/);
    const ext = extMatch?.[1]?.toLowerCase() ?? "jpg";
    const mimeTypes: Record<string, string> = {
      jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
      gif: "image/gif", webp: "image/webp",
    };
    const contentType = mimeTypes[ext] ?? "image/jpeg";
    const filePath = `${userId}/${orderId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const resp = await fetch(localUri);
    const arrayBuf = await resp.arrayBuffer();
    const { error } = await supabase.storage
      .from("review-photos")
      .upload(filePath, arrayBuf, { upsert: true, contentType });
    if (error) throw error;
    return supabase.storage.from("review-photos").getPublicUrl(filePath).data.publicUrl;
  }

  async function handleSubmit() {
    if (!(await requireNetwork())) return;
    if (rating < 1 || rating > 5) {
      Alert.alert("Rating required", "Please select a star rating.");
      return;
    }
    setSubmitting(true);

    let finalPhotos: string[] = [];
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");
      finalPhotos = await Promise.all(
        photos.map((p) => (/^https?:\/\//i.test(p) ? Promise.resolve(p) : uploadPhoto(p, user.id))),
      );
    } catch (e: any) {
      setSubmitting(false);
      Alert.alert("Photo upload failed", e?.message ?? "Please try again.");
      return;
    }

    const { error } = await supabase.rpc("submit_review", {
      p_order_id: orderId,
      p_seller_id: sellerId,
      p_rating: rating,
      p_comment: comment.trim() || null,
      p_photos: finalPhotos,
    });
    setSubmitting(false);

    if (error) {
      Alert.alert("Review Failed", error.message);
      return;
    }

    // Success: navigate straight back instead of forcing an OK tap.
    onBack();
  }

  const sellerName =
    seller?.display_name ?? seller?.username ?? "Seller";
  const sellerInitial = sellerName.charAt(0).toUpperCase();
  const isEditing = !!existing;

  if (loading) {
    return (
      <SafeAreaView style={st.safe}>
        <StatusBar style="light" />
        <ScreenHeader title="Rate Seller" onBack={onBack} />
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
        <ScreenHeader title={isEditing ? "Edit Review" : "Rate Seller"} onBack={onBack} />

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
                  {Number(seller?.rating ?? 0).toFixed(1)}
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

          {/* Photos */}
          <View style={st.photoSection}>
            <Text style={st.sectionLabel}>Photos (optional)</Text>
            <View style={st.photoGrid}>
              {photos.map((uri) => (
                <View key={uri} style={st.photoThumbWrap}>
                  <Image source={{ uri }} style={st.photoThumb} />
                  <Pressable
                    style={st.photoRemove}
                    onPress={() => removePhoto(uri)}
                    hitSlop={6}
                  >
                    <Ionicons name="close" size={12} color="#fff" />
                  </Pressable>
                </View>
              ))}
              {photos.length < MAX_REVIEW_PHOTOS && (
                <Pressable style={st.photoAdd} onPress={pickPhotos}>
                  <Ionicons name="camera-outline" size={22} color={C.textMuted} />
                  <Text style={st.photoAddText}>Add</Text>
                </Pressable>
              )}
            </View>
          </View>
        </ScrollView>

        {/* Submit */}
        <View style={[st.bottomBar, { paddingBottom: Math.max(insets.bottom, 14) }]}>
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

  photoSection: {
    backgroundColor: C.surface,
    borderRadius: S.radiusCard,
    borderWidth: 1,
    borderColor: C.border,
    padding: S.lg,
    gap: 12,
    marginTop: S.xl,
  },
  photoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  photoThumbWrap: {
    width: 72,
    height: 72,
    borderRadius: 12,
    overflow: "hidden",
  },
  photoThumb: { width: 72, height: 72, borderRadius: 12 },
  photoRemove: {
    position: "absolute",
    top: 3,
    right: 3,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  photoAdd: {
    width: 72,
    height: 72,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    borderStyle: "dashed",
    backgroundColor: C.elevated,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  photoAddText: { color: C.textMuted, fontSize: 11, fontWeight: "700" },

  bottomBar: {
    paddingHorizontal: S.screenPadding,
    paddingTop: 10,
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
