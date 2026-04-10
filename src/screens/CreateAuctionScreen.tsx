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
import { Feather, Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { C } from "../theme";
import { cf } from "../styles/createForm.styles";
import { MARKET_FILTERS } from "../data/market";
import { supabase } from "../lib/supabase";
import { requireNetwork } from "../lib/network";

import GradeConditionPicker from "../components/GradeConditionPicker";
import { formatGradeCombined, formatConditionLabel } from "../data/grading";

const CATEGORIES = MARKET_FILTERS.filter((f) => f !== "All");
const MAX_IMAGES = 4;

type Duration = { label: string; hours: number };
const DURATIONS: Duration[] = [
  { label: "1 Hour", hours: 1 },
  { label: "3 Hours", hours: 3 },
  { label: "12 Hours", hours: 12 },
  { label: "1 Day", hours: 24 },
  { label: "3 Days", hours: 72 },
  { label: "7 Days", hours: 168 },
];

type Props = { onBack: () => void };

export default function CreateAuctionScreen({ onBack }: Props) {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const [images, setImages] = useState<string[]>([]);
  const [cardName, setCardName] = useState("");
  const [edition, setEdition] = useState("");
  const [category, setCategory] = useState("");
  const [gradingCompany, setGradingCompany] = useState<string | null>(null);
  const [gradeValue, setGradeValue] = useState<string | null>(null);
  const [condition, setCondition] = useState<string | null>(null);
  const [startingPrice, setStartingPrice] = useState("");
  const [reservePrice, setReservePrice] = useState("");
  const [buyNowPrice, setBuyNowPrice] = useState("");
  const [duration, setDuration] = useState<Duration>(DURATIONS[3]);
  const [minIncrement, setMinIncrement] = useState("1");
  const [description, setDescription] = useState("");

  const stepTitles = ["Add Photos", "Card Details", "Auction Settings"];

  async function pickFromGallery() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      selectionLimit: MAX_IMAGES - images.length,
      quality: 0.8,
    });
    if (!result.canceled) {
      const uris = result.assets.map((a) => a.uri);
      setImages((prev) => [...prev, ...uris].slice(0, MAX_IMAGES));
    }
  }

  async function pickFromCamera() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", "Camera access is required.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    if (!result.canceled) {
      setImages((prev) => [...prev, result.assets[0].uri].slice(0, MAX_IMAGES));
    }
  }

  function removeImage(idx: number) {
    setImages((prev) => prev.filter((_, i) => i !== idx));
  }

  function canAdvance(): boolean {
    if (step === 0) return images.length > 0;
    if (step === 1) return cardName.trim().length > 0 && category.length > 0;
    return startingPrice.trim().length > 0;
  }

  function handleNext() {
    if (step < 2) setStep(step + 1);
    else handleSubmit();
  }

  function handleBack() {
    if (step > 0) setStep(step - 1);
    else onBack();
  }

  async function uploadImage(localUri: string, userId: string, index: number): Promise<string> {
    const extMatch = localUri.match(/\.(\w+)(\?|$)/);
    const ext = extMatch?.[1]?.toLowerCase() ?? "jpg";
    const mimeTypes: Record<string, string> = {
      jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
      gif: "image/gif", webp: "image/webp",
    };
    const contentType = mimeTypes[ext] ?? "image/jpeg";
    const filePath = `${userId}/auction-${Date.now()}-${index}.${ext}`;
    const resp = await fetch(localUri);
    const arrayBuf = await resp.arrayBuffer();
    const { error } = await supabase.storage
      .from("listing-images")
      .upload(filePath, arrayBuf, { upsert: true, contentType });
    if (error) throw error;
    const { data } = supabase.storage.from("listing-images").getPublicUrl(filePath);
    return data.publicUrl;
  }

  async function handleSubmit() {
    if (!(await requireNetwork())) return;
    setSubmitting(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setSubmitting(false);
      Alert.alert("Error", "Please sign in.");
      return;
    }

    try {
      const uploadedUrls = await Promise.all(images.map((uri, i) => uploadImage(uri, user.id, i)));

      const numStart = parseFloat(startingPrice.replace(/(RM|\$|,)/gi, ""));
      if (isNaN(numStart) || numStart <= 0) {
        setSubmitting(false);
        Alert.alert("Error", "Please enter a valid starting price.");
        return;
      }

      const numReserve = reservePrice.trim()
        ? parseFloat(reservePrice.replace(/(RM|\$|,)/gi, ""))
        : null;
      if (numReserve !== null && (isNaN(numReserve) || numReserve < numStart)) {
        setSubmitting(false);
        Alert.alert("Error", "Reserve price must be at least the starting price.");
        return;
      }

      const numBuyNow = buyNowPrice.trim()
        ? parseFloat(buyNowPrice.replace(/(RM|\$|,)/gi, ""))
        : null;
      if (numBuyNow !== null && (isNaN(numBuyNow) || numBuyNow <= numStart)) {
        setSubmitting(false);
        Alert.alert("Error", "Buy Now price must be higher than starting price.");
        return;
      }

      const numIncrement = Math.max(1, parseFloat(minIncrement.replace(/(RM|\$|,)/gi, "")) || 1);

      const endsAt = new Date(Date.now() + duration.hours * 3600000).toISOString();

      const { error } = await supabase.from("auction_items").insert({
        seller_id: user.id,
        card_name: cardName.trim(),
        edition: edition.trim() || null,
        grade: formatGradeCombined(gradingCompany, gradeValue),
        grading_company: gradingCompany,
        grade_value: gradeValue,
        condition: condition || null,
        starting_price: numStart,
        reserve_price: numReserve,
        buy_now_price: numBuyNow,
        min_bid_increment: numIncrement,
        category,
        description: description.trim() || null,
        images: uploadedUrls,
        ends_at: endsAt,
        original_ends_at: endsAt,
        status: "active",
      });

      if (error) throw error;
      onBack();
    } catch (err: any) {
      Alert.alert("Error", err?.message ?? "Failed to create auction.");
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
        <View style={cf.header}>
          <Pressable style={cf.backBtn} onPress={handleBack}>
            <Feather name="arrow-left" size={20} color={C.textPrimary} />
          </Pressable>
          <Text style={cf.headerTitle}>{stepTitles[step]}</Text>
          <Text style={cf.stepIndicator}>{step + 1} / 3</Text>
        </View>

        <View style={cf.dotsRow}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={[cf.dot, i === step && cf.dotActive, i < step && cf.dotCompleted]} />
          ))}
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={cf.scroll}
          keyboardShouldPersistTaps="handled"
        >
          {step === 0 && (
            <>
              <Text style={cf.sectionTitle}>Upload Card Photos</Text>
              <Text style={cf.sectionSub}>Add up to {MAX_IMAGES} photos of your card.</Text>
              <View style={cf.imageGrid}>
                {images.map((uri, i) => (
                  <View key={uri} style={[cf.imageSlot, cf.imageSlotFilled]}>
                    <Image source={{ uri }} style={cf.imagePreview} />
                    <Pressable style={cf.imageRemove} onPress={() => removeImage(i)}>
                      <Feather name="x" size={12} color="#fff" />
                    </Pressable>
                  </View>
                ))}
                {images.length < MAX_IMAGES && (
                  <Pressable style={cf.imageSlot} onPress={pickFromGallery}>
                    <Feather name="plus" size={22} color={C.textMuted} />
                    <Text style={cf.addImageText}>ADD</Text>
                  </Pressable>
                )}
              </View>
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

          {step === 1 && (
            <>
              <Text style={cf.sectionTitle}>Card Information</Text>
              <Text style={cf.sectionSub}>Fill in the details about your card.</Text>

              <Text style={cf.fieldLabel}>Card Name *</Text>
              <TextInput style={cf.textInput} value={cardName} onChangeText={setCardName} placeholder="e.g. Charizard Holo" placeholderTextColor={C.textMuted} />

              <Text style={cf.fieldLabel}>Edition</Text>
              <TextInput style={cf.textInput} value={edition} onChangeText={setEdition} placeholder="e.g. 1999 Base Set" placeholderTextColor={C.textMuted} />

              <Text style={cf.fieldLabel}>Category *</Text>
              <View style={cf.categoryRow}>
                {CATEGORIES.map((cat) => (
                  <Pressable key={cat} style={[cf.categoryPill, category === cat && cf.categoryPillActive]} onPress={() => setCategory(cat)}>
                    <Text style={[cf.categoryPillText, category === cat && cf.categoryPillTextActive]}>{cat}</Text>
                  </Pressable>
                ))}
              </View>

              <GradeConditionPicker
                gradingCompany={gradingCompany}
                gradeValue={gradeValue}
                condition={condition}
                onChangeGradingCompany={setGradingCompany}
                onChangeGradeValue={setGradeValue}
                onChangeCondition={setCondition}
              />
            </>
          )}

          {step === 2 && (
            <>
              <Text style={cf.sectionTitle}>Auction Settings</Text>
              <Text style={cf.sectionSub}>Configure your auction parameters.</Text>

              <Text style={cf.fieldLabel}>Starting Price *</Text>
              <View style={cf.priceInputRow}>
                <Text style={cf.dollarSign}>RM</Text>
                <TextInput style={cf.priceInput} value={startingPrice} onChangeText={setStartingPrice} placeholder="0.00" placeholderTextColor={C.textMuted} keyboardType="numeric" />
              </View>

              <Text style={cf.fieldLabel}>Reserve Price (optional)</Text>
              <View style={cf.priceInputRow}>
                <Text style={cf.dollarSign}>RM</Text>
                <TextInput style={cf.priceInput} value={reservePrice} onChangeText={setReservePrice} placeholder="Min price to sell" placeholderTextColor={C.textMuted} keyboardType="numeric" />
              </View>

              <Text style={cf.fieldLabel}>Buy It Now Price (optional)</Text>
              <View style={cf.priceInputRow}>
                <Text style={cf.dollarSign}>RM</Text>
                <TextInput style={cf.priceInput} value={buyNowPrice} onChangeText={setBuyNowPrice} placeholder="Instant purchase price" placeholderTextColor={C.textMuted} keyboardType="numeric" />
              </View>

              <Text style={cf.fieldLabel}>Min Bid Increment</Text>
              <View style={cf.priceInputRow}>
                <Text style={cf.dollarSign}>RM</Text>
                <TextInput style={cf.priceInput} value={minIncrement} onChangeText={setMinIncrement} placeholder="1" placeholderTextColor={C.textMuted} keyboardType="numeric" />
              </View>

              <Text style={cf.fieldLabel}>Duration</Text>
              <View style={cf.categoryRow}>
                {DURATIONS.map((d) => (
                  <Pressable
                    key={d.label}
                    style={[cf.categoryPill, duration.label === d.label && cf.categoryPillActive]}
                    onPress={() => setDuration(d)}
                  >
                    <Text style={[cf.categoryPillText, duration.label === d.label && cf.categoryPillTextActive]}>
                      {d.label}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={cf.fieldLabel}>Description</Text>
              <TextInput
                style={cf.textArea}
                value={description}
                onChangeText={setDescription}
                placeholder="Describe the card, its history, notable features..."
                placeholderTextColor={C.textMuted}
                multiline
              />

              <Text style={cf.fieldLabel}>Review</Text>
              <View style={cf.reviewCard}>
                {images.length > 0 && (
                  <>
                    <View style={cf.reviewImages}>
                      {images.map((uri) => (
                        <Image key={uri} source={{ uri }} style={cf.reviewThumb} />
                      ))}
                    </View>
                    <View style={cf.reviewDivider} />
                  </>
                )}
                <View style={cf.reviewRow}>
                  <Text style={cf.reviewLabel}>Card</Text>
                  <Text style={cf.reviewValue} numberOfLines={1}>{cardName || "—"}</Text>
                </View>
                <View style={cf.reviewRow}>
                  <Text style={cf.reviewLabel}>Edition</Text>
                  <Text style={cf.reviewValue} numberOfLines={1}>{edition || "—"}</Text>
                </View>
                <View style={cf.reviewRow}>
                  <Text style={cf.reviewLabel}>Category</Text>
                  <Text style={cf.reviewValue}>{category || "—"}</Text>
                </View>
                <View style={cf.reviewRow}>
                  <Text style={cf.reviewLabel}>Grade</Text>
                  <Text style={cf.reviewValue}>
                    {formatGradeCombined(gradingCompany, gradeValue) || "—"}
                  </Text>
                </View>
                <View style={cf.reviewRow}>
                  <Text style={cf.reviewLabel}>Condition</Text>
                  <Text style={cf.reviewValue}>
                    {condition ? formatConditionLabel(condition) : "—"}
                  </Text>
                </View>
                <View style={cf.reviewDivider} />
                <View style={cf.reviewRow}>
                  <Text style={cf.reviewLabel}>Starting Price</Text>
                  <Text style={[cf.reviewValue, { color: C.link, fontSize: 18, fontWeight: "900" }]}>
                    {startingPrice
                      ? `RM${startingPrice.replace(/^(RM|\$)/i, "")}`
                      : "—"}
                  </Text>
                </View>
                {reservePrice.trim() ? (
                  <View style={cf.reviewRow}>
                    <Text style={cf.reviewLabel}>Reserve</Text>
                    <Text style={cf.reviewValue}>
                      RM${reservePrice.replace(/^(RM|\$)/i, "")}
                    </Text>
                  </View>
                ) : null}
                {buyNowPrice.trim() ? (
                  <View style={cf.reviewRow}>
                    <Text style={cf.reviewLabel}>Buy Now</Text>
                    <Text style={[cf.reviewValue, { color: C.success }]}>
                      RM${buyNowPrice.replace(/^(RM|\$)/i, "")}
                    </Text>
                  </View>
                ) : null}
                <View style={cf.reviewRow}>
                  <Text style={cf.reviewLabel}>Duration</Text>
                  <Text style={cf.reviewValue}>{duration.label}</Text>
                </View>
                <View style={cf.reviewRow}>
                  <Text style={cf.reviewLabel}>Min Raise</Text>
                  <Text style={cf.reviewValue}>RM{minIncrement || "1"}</Text>
                </View>
              </View>
            </>
          )}
        </ScrollView>

        <View style={[cf.bottomBar, { paddingBottom: Math.max(insets.bottom, 14) }]}>
          {step < 2 ? (
            <Pressable
              style={[cf.nextBtn, !canAdvance() && cf.nextBtnDisabled]}
              onPress={handleNext}
              disabled={!canAdvance()}
            >
              <Text style={[cf.nextBtnText, !canAdvance() && cf.nextBtnTextDisabled]}>Continue</Text>
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
                <Text style={[cf.submitBtnText, !canAdvance() && cf.nextBtnTextDisabled]}>
                  Start Auction
                </Text>
              )}
            </Pressable>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
