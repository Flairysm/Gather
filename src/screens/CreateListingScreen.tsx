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

type Props = { onBack: () => void };

export default function CreateListingScreen({ onBack }: Props) {
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
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [description, setDescription] = useState("");

  const stepTitles = ["Add Photos", "Card Details", "Set Price"];

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
      Alert.alert("Permission needed", "Camera access is required to take photos.");
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
    return price.trim().length > 0;
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

  async function uploadImage(localUri: string, userId: string, index: number): Promise<string> {
    const extMatch = localUri.match(/\.(\w+)(\?|$)/);
    const ext = extMatch?.[1]?.toLowerCase() ?? "jpg";
    const mimeTypes: Record<string, string> = {
      jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
      gif: "image/gif", webp: "image/webp",
    };
    const contentType = mimeTypes[ext] ?? "image/jpeg";
    const filePath = `${userId}/${Date.now()}-${index}.${ext}`;

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
      Alert.alert("Error", "Please sign in to create a listing.");
      return;
    }

    try {
      const uploadedUrls = await Promise.all(
        images.map((uri, i) => uploadImage(uri, user.id, i)),
      );

      const numericPrice = parseFloat(price.replace(/(RM|\$|,)/gi, ""));
      if (isNaN(numericPrice) || numericPrice <= 0) {
        setSubmitting(false);
        Alert.alert("Error", "Please enter a valid price.");
        return;
      }

      const qty = parseInt(quantity, 10);
      const safeQty = isNaN(qty) || qty < 1 ? 1 : qty;

      const { error } = await supabase.from("listings").insert({
        seller_id: user.id,
        card_name: cardName.trim(),
        edition: edition.trim() || null,
        grade: formatGradeCombined(gradingCompany, gradeValue),
        grading_company: gradingCompany,
        grade_value: gradeValue,
        condition: condition || null,
        price: numericPrice,
        quantity: safeQty,
        category,
        description: description.trim() || null,
        images: uploadedUrls,
        status: "active",
      });

      if (error) throw error;
      onBack();
    } catch (err: any) {
      Alert.alert("Error", err?.message ?? "Failed to create listing.");
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
          {step === 0 && (
            <>
              <Text style={cf.sectionTitle}>Upload Card Photos</Text>
              <Text style={cf.sectionSub}>
                Add up to {MAX_IMAGES} photos. Front, back, close-ups of any
                flaws.
              </Text>

              <View style={cf.imageGrid}>
                {images.map((uri, i) => (
                  <View key={uri} style={[cf.imageSlot, cf.imageSlotFilled]}>
                    <Image source={{ uri }} style={cf.imagePreview} />
                    <Pressable
                      style={cf.imageRemove}
                      onPress={() => removeImage(i)}
                    >
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
              <Text style={cf.sectionSub}>
                Fill in the details about your card.
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
                placeholder="e.g. 1999 Base Set"
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
              <Text style={cf.sectionTitle}>Set Your Price</Text>
              <Text style={cf.sectionSub}>
                Enter your asking price and add a description.
              </Text>

              <Text style={cf.fieldLabel}>Asking Price *</Text>
              <View style={cf.priceInputRow}>
                <Text style={cf.dollarSign}>RM</Text>
                <TextInput
                  style={cf.priceInput}
                  value={price}
                  onChangeText={setPrice}
                  placeholder="0.00"
                  placeholderTextColor={C.textMuted}
                  keyboardType="numeric"
                />
              </View>

              <Text style={cf.fieldLabel}>Quantity</Text>
              <TextInput
                style={cf.textInput}
                value={quantity}
                onChangeText={setQuantity}
                placeholder="1"
                placeholderTextColor={C.textMuted}
                keyboardType="number-pad"
              />

              <Text style={cf.fieldLabel}>Description</Text>
              <TextInput
                style={cf.textArea}
                value={description}
                onChangeText={setDescription}
                placeholder="Describe the card's condition, history, notable features..."
                placeholderTextColor={C.textMuted}
                multiline
              />

              <Text style={cf.fieldLabel}>Review</Text>
              <View style={cf.reviewCard}>
                {images.length > 0 && (
                  <>
                    <View style={cf.reviewImages}>
                      {images.map((uri) => (
                        <Image
                          key={uri}
                          source={{ uri }}
                          style={cf.reviewThumb}
                        />
                      ))}
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
                  <Text style={cf.reviewLabel}>Asking Price</Text>
                  <Text style={[cf.reviewValue, { color: C.link, fontSize: 18, fontWeight: "900" }]}>
                    {price
                      ? `RM${price.replace(/^(RM|\$)/i, "")}`
                      : "—"}
                  </Text>
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
              <Text
                style={[cf.nextBtnText, !canAdvance() && cf.nextBtnTextDisabled]}
              >
                Continue
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
                  style={[cf.submitBtnText, !canAdvance() && cf.nextBtnTextDisabled]}
                >
                  Post Listing
                </Text>
              )}
            </Pressable>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
