import { useEffect, useState } from "react";
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
import { requireNetwork } from "../lib/network";
import { emitAppEvent, APP_EVENTS } from "../lib/appEvents";
import GradeConditionPicker from "../components/GradeConditionPicker";
import { formatGradeCombined } from "../data/grading";

const CATEGORIES = MARKET_FILTERS.filter((f) => f !== "All");
const MAX_IMAGES = 4;

const STATUS_OPTIONS: { key: string; label: string }[] = [
  { key: "active", label: "Active" },
  { key: "paused", label: "Paused" },
  { key: "draft", label: "Draft" },
];

type Props = { listingId: string; onBack: () => void };

export default function EditListingScreen({ listingId, onBack }: Props) {
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [saving, setSaving] = useState(false);

  // images can hold both remote URLs (existing) and local file URIs (new picks).
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
  const [status, setStatus] = useState("active");

  useEffect(() => {
    let active = true;
    (async () => {
      const { data, error } = await supabase
        .from("listings")
        .select(
          "id, card_name, edition, category, grade, grading_company, grade_value, condition, price, quantity, description, images, status",
        )
        .eq("id", listingId)
        .maybeSingle();
      if (!active) return;
      if (error || !data) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      setImages(Array.isArray(data.images) ? (data.images as string[]) : []);
      setCardName(data.card_name ?? "");
      setEdition(data.edition ?? "");
      setCategory(data.category ?? "");
      setGradingCompany(data.grading_company ?? null);
      setGradeValue(data.grade_value ?? null);
      setCondition(data.condition ?? null);
      setPrice(data.price != null ? String(data.price) : "");
      setQuantity(data.quantity != null ? String(data.quantity) : "1");
      setDescription(data.description ?? "");
      setStatus(data.status ?? "active");
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [listingId]);

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

  const canSave =
    cardName.trim().length > 0 &&
    category.length > 0 &&
    price.trim().length > 0 &&
    images.length > 0;

  async function handleSave() {
    if (!canSave || saving) return;
    if (!(await requireNetwork())) return;

    const numericPrice = parseFloat(price.replace(/(RM|\$|,)/gi, ""));
    if (isNaN(numericPrice) || numericPrice <= 0) {
      Alert.alert("Error", "Please enter a valid price.");
      return;
    }
    if (images.length === 0) {
      Alert.alert("Error", "Add at least one photo.");
      return;
    }

    const qty = parseInt(quantity, 10);
    const safeQty = isNaN(qty) || qty < 0 ? 0 : qty;

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert("Error", "Please sign in to edit this listing.");
        return;
      }

      // Upload only the newly-added local images; keep existing remote URLs.
      const finalUrls = await Promise.all(
        images.map((uri, i) =>
          uri.startsWith("http") ? Promise.resolve(uri) : uploadImage(uri, user.id, i),
        ),
      );

      const { error } = await supabase
        .from("listings")
        .update({
          card_name: cardName.trim(),
          edition: edition.trim() || null,
          category,
          grade: formatGradeCombined(gradingCompany, gradeValue),
          grading_company: gradingCompany,
          grade_value: gradeValue,
          condition: condition || null,
          price: numericPrice,
          quantity: safeQty,
          description: description.trim() || null,
          images: finalUrls,
          status,
          updated_at: new Date().toISOString(),
        })
        .eq("id", listingId);

      if (error) throw error;
      emitAppEvent(APP_EVENTS.listingsChanged);
      onBack();
    } catch (err: any) {
      Alert.alert("Error", err?.message ?? "Failed to save changes.");
    } finally {
      setSaving(false);
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
          <Pressable style={cf.backBtn} onPress={onBack}>
            <Feather name="arrow-left" size={20} color={C.textPrimary} />
          </Pressable>
          <Text style={cf.headerTitle}>Edit Product</Text>
          <View style={{ width: 36 }} />
        </View>

        {loading ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <ActivityIndicator color={C.accent} size="large" />
          </View>
        ) : notFound ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32 }}>
            <Feather name="alert-circle" size={28} color={C.textMuted} />
            <Text style={[cf.sectionSub, { marginTop: 10, textAlign: "center" }]}>
              This listing couldn't be loaded.
            </Text>
          </View>
        ) : (
          <>
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={cf.scroll}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={cf.sectionTitle}>Photos</Text>
              <Text style={cf.sectionSub}>
                Up to {MAX_IMAGES} photos. The first is the cover image.
              </Text>

              <View style={cf.imageGrid}>
                {images.map((uri, i) => (
                  <View key={`${uri}-${i}`} style={[cf.imageSlot, cf.imageSlotFilled]}>
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

              {images.length === 0 && (
                <Text style={[cf.sectionSub, { color: C.danger, marginTop: 8 }]}>
                  Add at least one photo to save this listing.
                </Text>
              )}

              <Text style={cf.sectionTitle}>Card Information</Text>
              <Text style={cf.sectionSub}>Update the details about your card.</Text>

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
                    style={[cf.categoryPill, category === cat && cf.categoryPillActive]}
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

              <Text style={cf.sectionTitle}>Price & Inventory</Text>
              <Text style={cf.sectionSub}>Set your asking price and stock.</Text>

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

              <Text style={cf.fieldLabel}>Status</Text>
              <Text style={cf.sectionSub}>
                Active: visible in the marketplace · Paused: hidden from buyers · Draft: not yet published
              </Text>
              <View style={cf.categoryRow}>
                {STATUS_OPTIONS.map((opt) => (
                  <Pressable
                    key={opt.key}
                    style={[cf.categoryPill, status === opt.key && cf.categoryPillActive]}
                    onPress={() => setStatus(opt.key)}
                  >
                    <Text
                      style={[
                        cf.categoryPillText,
                        status === opt.key && cf.categoryPillTextActive,
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={cf.fieldLabel}>Description</Text>
              <TextInput
                style={cf.textArea}
                value={description}
                onChangeText={setDescription}
                placeholder="Describe the card's condition, history, notable features..."
                placeholderTextColor={C.textMuted}
                multiline
              />
            </ScrollView>

            <View style={[cf.bottomBar, { paddingBottom: Math.max(insets.bottom, 14) }]}>
              <Pressable
                style={[cf.nextBtn, (!canSave || saving) && cf.nextBtnDisabled]}
                onPress={handleSave}
                disabled={!canSave || saving}
              >
                {saving ? (
                  <ActivityIndicator size="small" color={C.textHero} />
                ) : (
                  <Text style={[cf.nextBtnText, !canSave && cf.nextBtnTextDisabled]}>
                    Save Changes
                  </Text>
                )}
              </Pressable>
            </View>
          </>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
