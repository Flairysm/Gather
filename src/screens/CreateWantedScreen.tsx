import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { Feather } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { C } from "../theme";
import { cf } from "../styles/createForm.styles";
import { MARKET_FILTERS } from "../data/market";
import { supabase } from "../lib/supabase";

const CATEGORIES = MARKET_FILTERS.filter((f) => f !== "All");

type Props = { onBack: () => void };

export default function CreateWantedScreen({ onBack }: Props) {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const [image, setImage] = useState<string | null>(null);
  const [cardName, setCardName] = useState("");
  const [edition, setEdition] = useState("");
  const [category, setCategory] = useState("");
  const [gradeWanted, setGradeWanted] = useState("");
  const [offerPrice, setOfferPrice] = useState("");
  const [description, setDescription] = useState("");

  const stepTitles = ["Reference Image", "Card Details", "Set Budget"];

  async function pickFromGallery() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.8,
    });
    if (!result.canceled) {
      setImage(result.assets[0].uri);
    }
  }

  async function pickFromCamera() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", "Camera access is required to take photos.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    if (!result.canceled) {
      setImage(result.assets[0].uri);
    }
  }

  function canAdvance(): boolean {
    if (step === 0) return true; // image is optional
    if (step === 1) return cardName.trim().length > 0 && category.length > 0;
    return offerPrice.trim().length > 0;
  }

  function handleNext() {
    if (step < 2) {
      setStep(step + 1);
    } else {
      handleSubmit();
    }
  }

  function handleBack() {
    if (step > 0) {
      setStep(step - 1);
    } else {
      onBack();
    }
  }

  async function handleSubmit() {
    setSubmitting(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setSubmitting(false);
      Alert.alert("Error", "Please sign in to create a wanted post.");
      return;
    }

    try {
      const numericPrice = parseFloat(offerPrice.replace(/(RM|\$|,)/gi, ""));
      if (isNaN(numericPrice) || numericPrice <= 0) {
        setSubmitting(false);
        Alert.alert("Error", "Please enter a valid offer price.");
        return;
      }

      let imageUrl: string | null = null;
      if (image) {
        const extMatch = image.match(/\.(\w+)(\?|$)/);
        const ext = extMatch?.[1]?.toLowerCase() ?? "jpg";
        const mimeTypes: Record<string, string> = {
          jpg: "image/jpeg",
          jpeg: "image/jpeg",
          png: "image/png",
          gif: "image/gif",
          webp: "image/webp",
        };
        const contentType = mimeTypes[ext] ?? "image/jpeg";
        const filePath = `${user.id}/wanted-${Date.now()}.${ext}`;
        const resp = await fetch(image);
        const arrayBuf = await resp.arrayBuffer();

        const { error: uploadError } = await supabase.storage
          .from("listing-images")
          .upload(filePath, arrayBuf, {
            upsert: true,
            contentType,
          });

        if (uploadError) {
          throw uploadError;
        }
        const { data: publicUrlData } = supabase.storage
          .from("listing-images")
          .getPublicUrl(filePath);
        imageUrl = publicUrlData.publicUrl;
      }

      const { error } = await supabase.from("wanted_posts").insert({
        buyer_id: user.id,
        card_name: cardName.trim(),
        edition: edition.trim() || null,
        grade_wanted: gradeWanted.trim() || null,
        offer_price: numericPrice,
        category,
        description: description.trim() || null,
        image_url: imageUrl,
        status: "active",
      });

      if (error) throw error;
      onBack();
    } catch (err: any) {
      Alert.alert("Error", err?.message ?? "Failed to create wanted post.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={cf.safe}>
      <StatusBar style="light" />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {/* ── Header ── */}
        <View style={cf.header}>
          <Pressable style={cf.backBtn} onPress={handleBack}>
            <Feather name="arrow-left" size={20} color={C.textPrimary} />
          </Pressable>
          <Text style={cf.headerTitle}>{stepTitles[step]}</Text>
          <Text style={cf.stepIndicator}>{step + 1} / 3</Text>
        </View>

        {/* ── Step Dots ── */}
        <View style={cf.dotsRow}>
          {[0, 1, 2].map((i) => (
            <View
              key={i}
              style={[
                cf.dot,
                i === step && cf.dotActive,
                i < step && cf.dotCompleted,
              ]}
            />
          ))}
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={cf.scroll}
          keyboardShouldPersistTaps="handled"
        >
          {/* ═══ STEP 0: Reference Image ═══ */}
          {step === 0 && (
            <>
              <Text style={cf.sectionTitle}>Add a Reference Image</Text>
              <Text style={cf.sectionSub}>
                Help sellers identify the card you're looking for. This is
                optional.
              </Text>

              {image ? (
                <Pressable
                  style={[cf.singleImageSlot, cf.singleImageSlotFilled]}
                  onPress={pickFromGallery}
                >
                  <Image
                    source={{ uri: image }}
                    style={cf.singleImagePreview}
                  />
                  <Pressable
                    style={cf.imageRemove}
                    onPress={() => setImage(null)}
                  >
                    <Feather name="x" size={12} color="#fff" />
                  </Pressable>
                </Pressable>
              ) : (
                <Pressable
                  style={cf.singleImageSlot}
                  onPress={pickFromGallery}
                >
                  <View style={cf.singleImagePlaceholder}>
                    <Feather name="image" size={36} color={C.textMuted} />
                    <Text style={cf.singleImageText}>
                      Tap to add reference image
                    </Text>
                    <Text style={cf.singleImageSub}>Optional</Text>
                  </View>
                </Pressable>
              )}

              <View style={cf.pickerRow}>
                <Pressable style={cf.pickerBtn} onPress={pickFromCamera}>
                  <Feather name="camera" size={18} color={C.textAccent} />
                  <Text style={cf.pickerBtnText}>Camera</Text>
                </Pressable>
                <Pressable style={cf.pickerBtn} onPress={pickFromGallery}>
                  <Feather name="image" size={18} color={C.textAccent} />
                  <Text style={cf.pickerBtnText}>Gallery</Text>
                </Pressable>
              </View>
            </>
          )}

          {/* ═══ STEP 1: Details ═══ */}
          {step === 1 && (
            <>
              <Text style={cf.sectionTitle}>What Are You Looking For?</Text>
              <Text style={cf.sectionSub}>
                Describe the card you want to buy.
              </Text>

              <Text style={cf.fieldLabel}>Card Name *</Text>
              <TextInput
                style={cf.textInput}
                value={cardName}
                onChangeText={setCardName}
                placeholder="e.g. Charizard Holo"
                placeholderTextColor={C.textMuted}
              />

              <Text style={cf.fieldLabel}>Edition</Text>
              <TextInput
                style={cf.textInput}
                value={edition}
                onChangeText={setEdition}
                placeholder="e.g. 1st Edition Base Set"
                placeholderTextColor={C.textMuted}
              />

              <Text style={cf.fieldLabel}>Category *</Text>
              <View style={cf.categoryRow}>
                {CATEGORIES.map((cat) => (
                  <Pressable
                    key={cat}
                    style={[
                      cf.categoryPill,
                      category === cat && cf.categoryPillActive,
                    ]}
                    onPress={() => setCategory(cat)}
                  >
                    <Text
                      style={[
                        cf.categoryPillText,
                        category === cat && cf.categoryPillTextActive,
                      ]}
                    >
                      {cat}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={cf.fieldLabel}>Grade Wanted</Text>
              <TextInput
                style={cf.textInput}
                value={gradeWanted}
                onChangeText={setGradeWanted}
                placeholder="e.g. PSA 9+, BGS 9.5"
                placeholderTextColor={C.textMuted}
              />
            </>
          )}

          {/* ═══ STEP 2: Budget ═══ */}
          {step === 2 && (
            <>
              <Text style={cf.sectionTitle}>Set Your Budget</Text>
              <Text style={cf.sectionSub}>
                How much are you willing to pay?
              </Text>

              <Text style={cf.fieldLabel}>Offer Price *</Text>
              <View style={cf.priceInputRow}>
                <Text style={cf.dollarSign}>RM</Text>
                <TextInput
                  style={cf.priceInput}
                  value={offerPrice}
                  onChangeText={setOfferPrice}
                  placeholder="0.00"
                  placeholderTextColor={C.textMuted}
                  keyboardType="numeric"
                />
              </View>

              <Text style={cf.fieldLabel}>Description</Text>
              <TextInput
                style={cf.textArea}
                value={description}
                onChangeText={setDescription}
                placeholder="Specific requirements, acceptable conditions, notes for sellers..."
                placeholderTextColor={C.textMuted}
                multiline
              />

              {/* Review Summary */}
              <Text style={cf.fieldLabel}>Review</Text>
              <View style={cf.reviewCard}>
                {image && (
                  <>
                    <View style={cf.reviewImages}>
                      <Image source={{ uri: image }} style={cf.reviewThumb} />
                    </View>
                    <View style={cf.reviewDivider} />
                  </>
                )}
                <View style={cf.reviewRow}>
                  <Text style={cf.reviewLabel}>Card</Text>
                  <Text style={cf.reviewValue} numberOfLines={1}>
                    {cardName || "—"}
                  </Text>
                </View>
                <View style={cf.reviewRow}>
                  <Text style={cf.reviewLabel}>Edition</Text>
                  <Text style={cf.reviewValue} numberOfLines={1}>
                    {edition || "—"}
                  </Text>
                </View>
                <View style={cf.reviewRow}>
                  <Text style={cf.reviewLabel}>Category</Text>
                  <Text style={cf.reviewValue}>{category || "—"}</Text>
                </View>
                <View style={cf.reviewRow}>
                  <Text style={cf.reviewLabel}>Grade Wanted</Text>
                  <Text style={cf.reviewValue}>{gradeWanted || "—"}</Text>
                </View>
                <View style={cf.reviewDivider} />
                <View style={cf.reviewRow}>
                  <Text style={cf.reviewLabel}>Offering</Text>
                  <Text
                    style={[
                      cf.reviewValue,
                      { color: C.live, fontSize: 18, fontWeight: "900" },
                    ]}
                  >
                    {offerPrice
                      ? `RM${offerPrice.replace(/^(RM|\$)/i, "")}`
                      : "—"}
                  </Text>
                </View>
              </View>
            </>
          )}
        </ScrollView>

        {/* ── Bottom Button ── */}
        <View
          style={[cf.bottomBar, { paddingBottom: Math.max(insets.bottom, 14) }]}
        >
          {step < 2 ? (
            <Pressable
              style={[cf.nextBtn, !canAdvance() && cf.nextBtnDisabled]}
              onPress={handleNext}
              disabled={!canAdvance()}
            >
              <Text
                style={[
                  cf.nextBtnText,
                  !canAdvance() && cf.nextBtnTextDisabled,
                ]}
              >
                {step === 0 ? (image ? "Continue" : "Skip") : "Continue"}
              </Text>
            </Pressable>
          ) : (
            <Pressable
              style={[cf.submitBtn, !canAdvance() && cf.nextBtnDisabled]}
              onPress={handleSubmit}
              disabled={!canAdvance() || submitting}
            >
              {submitting ? (
                <ActivityIndicator size="small" color={C.textHero} />
              ) : (
                <Text
                  style={[
                    cf.submitBtnText,
                    !canAdvance() && cf.nextBtnTextDisabled,
                  ]}
                >
                  Post Wanted
                </Text>
              )}
            </Pressable>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
