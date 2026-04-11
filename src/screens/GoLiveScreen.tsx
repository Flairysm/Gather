import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  FlatList,
  Image,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, Feather, MaterialIcons } from "@expo/vector-icons";
import {
  CameraView,
  useCameraPermissions,
  useMicrophonePermissions,
  type CameraType,
} from "expo-camera";
import * as ImagePicker from "expo-image-picker";

import { C, S } from "../theme";
import { AGORA_DISABLED } from "../lib/agoraFlag";
import { supabase } from "../lib/supabase";
import {
  fetchRecentChats,
  sendChatMessage,
  subscribeLiveChat,
  subscribeLiveStream,
  endStream,
  type ChatMessage,
} from "../data/live";
import {
  fetchHostListings,
  pinProduct,
  unpinProduct,
  fetchActivePin,
  subscribePinUpdates,
  type LiveStreamPin,
} from "../data/liveCommerce";
import { createHostEngine, destroyEngine, fetchAgoraToken, type IRtcEngine, type IRtcEngineEventHandler } from "../lib/agora";
import CachedImage from "../components/CachedImage";
import HostAgoraLocalVideo from "../components/HostAgoraLocalVideo";

type Props = { onBack: () => void };

const { width: SCREEN_W } = Dimensions.get("window");
const CATEGORIES = ["General", "Pokémon", "MTG", "YGO", "Sports", "One Piece", "Mixed"];

function formatViewers(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

/* ─────────────────────────────────────────────
   Setup View — title, category, tags, camera preview
   ───────────────────────────────────────────── */

type StreamPreset = {
  id: string;
  name: string;
  title: string;
  category: string;
  tags: string;
  thumbnailUrl: string | null;
};

async function loadPresets(): Promise<StreamPreset[]> {
  const { data: authData } = await supabase.auth.getUser();
  const userId = authData.user?.id;
  if (!userId) return [];

  const { data, error } = await supabase
    .from("stream_presets")
    .select("id, name, title, category, tags, thumbnail_url")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(20);
  if (error) throw error;

  return (data ?? []).map((p: any) => ({
    id: p.id,
    name: p.name ?? "",
    title: p.title ?? "",
    category: p.category ?? "General",
    tags: Array.isArray(p.tags) ? p.tags.join(", ") : "",
    thumbnailUrl: p.thumbnail_url ?? null,
  }));
}

async function savePreset(input: Omit<StreamPreset, "id">): Promise<StreamPreset> {
  const { data: authData } = await supabase.auth.getUser();
  const userId = authData.user?.id;
  if (!userId) throw new Error("Not authenticated");

  const payload = {
    user_id: userId,
    name: input.name,
    title: input.title,
    category: input.category,
    tags: input.tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean),
    thumbnail_url: input.thumbnailUrl,
  };

  const { data, error } = await supabase
    .from("stream_presets")
    .insert(payload)
    .select("id, name, title, category, tags, thumbnail_url")
    .single();
  if (error) throw error;

  return {
    id: data.id,
    name: data.name ?? "",
    title: data.title ?? "",
    category: data.category ?? "General",
    tags: Array.isArray(data.tags) ? data.tags.join(", ") : "",
    thumbnailUrl: data.thumbnail_url ?? null,
  };
}

async function deletePresetById(id: string): Promise<void> {
  const { error } = await supabase.from("stream_presets").delete().eq("id", id);
  if (error) throw error;
}

async function uploadThumbnail(uri: string): Promise<string | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const ext = uri.split(".").pop()?.toLowerCase() ?? "jpg";
    const path = `${user.id}/${Date.now()}.${ext}`;
    const resp = await fetch(uri);
    const blob = await resp.blob();
    const arrayBuf = await new Response(blob).arrayBuffer();
    const { error } = await supabase.storage
      .from("stream-thumbnails")
      .upload(path, arrayBuf, { contentType: `image/${ext}`, upsert: true });
    if (error) throw error;
    const { data: pub } = supabase.storage.from("stream-thumbnails").getPublicUrl(path);
    return pub.publicUrl;
  } catch (e: any) {
    console.warn("Thumbnail upload failed:", e.message);
    return null;
  }
}

function SetupView({
  onGoLive,
  onBack,
}: {
  onGoLive: (title: string, category: string, tags: string[], thumbnailUrl: string | null) => void;
  onBack: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [camPermission, requestCam] = useCameraPermissions();
  const [micPermission, requestMic] = useMicrophonePermissions();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("General");
  const [tagInput, setTagInput] = useState("");
  const [starting, setStarting] = useState(false);
  const [facing, setFacing] = useState<CameraType>("back");

  const [thumbLocalUri, setThumbLocalUri] = useState<string | null>(null);
  const [thumbUploading, setThumbUploading] = useState(false);
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);

  const [presets, setPresets] = useState<StreamPreset[]>([]);
  const [presetName, setPresetName] = useState("");
  const [showPresetSave, setShowPresetSave] = useState(false);

  useEffect(() => {
    if (!camPermission?.granted) requestCam();
    if (!micPermission?.granted) requestMic();
  }, []);

  useEffect(() => {
    loadPresets()
      .then(setPresets)
      .catch(() => setPresets([]));
  }, []);

  const pickThumbnail = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;
    const uri = result.assets[0].uri;
    setThumbLocalUri(uri);
    setThumbUploading(true);
    const url = await uploadThumbnail(uri);
    setThumbUrl(url);
    setThumbUploading(false);
  };

  const removeThumbnail = () => {
    setThumbLocalUri(null);
    setThumbUrl(null);
  };

  const handleSavePreset = async () => {
    const name = presetName.trim();
    if (!name) {
      Alert.alert("Name required", "Give your preset a name.");
      return;
    }
    const newPresetInput = {
      name,
      title: title.trim(),
      category,
      tags: tagInput,
      thumbnailUrl: thumbUrl,
    };
    try {
      const created = await savePreset(newPresetInput);
      setPresets((prev) => [created, ...prev.filter((p) => p.id !== created.id)]);
      setPresetName("");
      setShowPresetSave(false);
      Alert.alert("Preset saved", `"${name}" has been saved.`);
    } catch (e: any) {
      Alert.alert("Save failed", e?.message ?? "Couldn't save preset.");
    }
  };

  const applyPreset = (p: StreamPreset) => {
    setTitle(p.title);
    setCategory(p.category);
    setTagInput(p.tags);
    if (p.thumbnailUrl) {
      setThumbUrl(p.thumbnailUrl);
      setThumbLocalUri(p.thumbnailUrl);
    }
  };

  const deletePreset = async (id: string) => {
    try {
      await deletePresetById(id);
      setPresets((prev) => prev.filter((p) => p.id !== id));
    } catch (e: any) {
      Alert.alert("Delete failed", e?.message ?? "Couldn't delete preset.");
    }
  };

  const handleStart = () => {
    if (!title.trim()) {
      Alert.alert("Title required", "Give your stream a title so viewers know what to expect.");
      return;
    }
    setStarting(true);
    const tags = tagInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    onGoLive(title.trim(), category, tags, thumbUrl);
  };

  const camReady = camPermission?.granted;

  return (
    <View style={st.root}>
      <StatusBar style="light" />

      {/* Camera preview background */}
      <View style={st.setupCameraWrap}>
        {camReady ? (
          <CameraView style={StyleSheet.absoluteFill} facing={facing} />
        ) : (
          <View style={st.noPermissionBox}>
            <Ionicons name="videocam-off-outline" size={40} color={C.textMuted} />
            <Text style={st.noPermText}>Camera permission required</Text>
            <Pressable style={st.grantBtn} onPress={requestCam}>
              <Text style={st.grantBtnText}>Grant Access</Text>
            </Pressable>
          </View>
        )}
        <SafeAreaView style={st.setupPreviewOverlay}>
          <View style={st.setupTopRow}>
            <Pressable onPress={onBack} style={st.glassBtn}>
              <Ionicons name="chevron-back" size={22} color="#fff" />
            </Pressable>
            <Text style={st.setupTitle}>Go Live</Text>
            <Pressable
              onPress={() => setFacing((f) => (f === "back" ? "front" : "back"))}
              style={st.glassBtn}
            >
              <Ionicons name="camera-reverse-outline" size={20} color="#fff" />
            </Pressable>
          </View>
        </SafeAreaView>
      </View>

      {/* Setup form */}
      <ScrollView
        style={st.setupForm}
        contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={st.field}>
          <Text style={st.label}>Stream Title</Text>
          <TextInput
            style={st.input}
            placeholder="What are you streaming today?"
            placeholderTextColor={C.textMuted}
            value={title}
            onChangeText={setTitle}
            maxLength={100}
          />
        </View>

        {/* Thumbnail */}
        <View style={st.field}>
          <Text style={st.label}>Stream Thumbnail</Text>
          {thumbLocalUri ? (
            <View style={st.thumbPreviewWrap}>
              <Image source={{ uri: thumbLocalUri }} style={st.thumbPreviewImg} />
              {thumbUploading && (
                <View style={st.thumbUploadingOverlay}>
                  <ActivityIndicator color="#fff" size="small" />
                  <Text style={st.thumbUploadingText}>Uploading…</Text>
                </View>
              )}
              <Pressable style={st.thumbRemoveBtn} onPress={removeThumbnail}>
                <Ionicons name="close-circle" size={24} color="#fff" />
              </Pressable>
            </View>
          ) : (
            <Pressable style={st.thumbPickBtn} onPress={pickThumbnail}>
              <MaterialIcons name="add-photo-alternate" size={28} color={C.textMuted} />
              <Text style={st.thumbPickText}>Tap to upload thumbnail</Text>
              <Text style={st.thumbPickHint}>16:9 recommended</Text>
            </Pressable>
          )}
        </View>

        {/* Presets */}
        <View style={st.field}>
          <Text style={st.label}>Preset</Text>
          {presets.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={st.presetScroll}>
              {presets.map((p) => (
                <Pressable key={p.id} style={st.presetCard} onPress={() => applyPreset(p)}>
                  {p.thumbnailUrl ? (
                    <CachedImage source={{ uri: p.thumbnailUrl }} style={st.presetThumb} />
                  ) : (
                    <View style={[st.presetThumb, st.presetThumbFallback]}>
                      <Ionicons name="radio-outline" size={16} color={C.textMuted} />
                    </View>
                  )}
                  <Text style={st.presetName} numberOfLines={1}>
                    {p.name}
                  </Text>
                  <Pressable
                    style={st.presetDeleteBtn}
                    onPress={() => deletePreset(p.id)}
                    hitSlop={8}
                  >
                    <Ionicons name="trash-outline" size={12} color={C.textMuted} />
                  </Pressable>
                </Pressable>
              ))}
            </ScrollView>
          )}
          {!showPresetSave ? (
            <Pressable style={st.savePresetToggle} onPress={() => setShowPresetSave(true)}>
              <Feather name="bookmark" size={14} color={C.accent} />
              <Text style={st.savePresetToggleText}>Save as Preset</Text>
            </Pressable>
          ) : (
            <View style={st.savePresetRow}>
              <TextInput
                style={[st.input, { flex: 1 }]}
                placeholder="Preset name"
                placeholderTextColor={C.textMuted}
                value={presetName}
                onChangeText={setPresetName}
                maxLength={40}
              />
              <Pressable style={st.savePresetBtn} onPress={handleSavePreset}>
                <Text style={st.savePresetBtnText}>Save</Text>
              </Pressable>
              <Pressable onPress={() => setShowPresetSave(false)}>
                <Ionicons name="close" size={22} color={C.textMuted} />
              </Pressable>
            </View>
          )}
        </View>

        <View style={st.field}>
          <Text style={st.label}>Category</Text>
          <View style={st.chipRow}>
            {CATEGORIES.map((c) => (
              <Pressable
                key={c}
                style={[st.chip, category === c && st.chipActive]}
                onPress={() => setCategory(c)}
              >
                <Text style={[st.chipText, category === c && st.chipTextActive]}>{c}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={st.field}>
          <Text style={st.label}>Tags (comma separated)</Text>
          <TextInput
            style={st.input}
            placeholder="Pack Opening, Grading, etc."
            placeholderTextColor={C.textMuted}
            value={tagInput}
            onChangeText={setTagInput}
          />
        </View>

        <Pressable
          style={[st.goLiveMainBtn, (starting || !camReady) && { opacity: 0.5 }]}
          onPress={handleStart}
          disabled={starting || !camReady}
        >
          {starting ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Ionicons name="radio" size={18} color="#fff" />
              <Text style={st.goLiveBtnText}>GO LIVE</Text>
            </>
          )}
        </Pressable>
      </ScrollView>
    </View>
  );
}

/* ─────────────────────────────────────────────
   Live Host View — full camera + control hub
   ───────────────────────────────────────────── */

function LiveHostView({
  streamId,
  onEnd,
}: {
  streamId: string;
  onEnd: () => void;
}) {
  const insets = useSafeAreaInsets();
  const chatListRef = useRef<FlatList>(null);
  const engineRef = useRef<IRtcEngine | null>(null);
  const handlerRef = useRef<IRtcEngineEventHandler | null>(null);

  const [camPermission, requestCam] = useCameraPermissions();
  const [micPermission, requestMic] = useMicrophonePermissions();

  // Camera state
  const [facing, setFacing] = useState<CameraType>("back");
  const [torch, setTorch] = useState(false);
  const [micMuted, setMicMuted] = useState(false);
  const [agoraReady, setAgoraReady] = useState(false);
  const [agoraFatalError, setAgoraFatalError] = useState<string | null>(null);
  const [localUid, setLocalUid] = useState<number>(0);

  // Stream state
  const [chats, setChats] = useState<ChatMessage[]>([]);
  const [chatText, setChatText] = useState("");
  const [sending, setSending] = useState(false);
  const [viewerCount, setViewerCount] = useState(0);
  const [likeCount, setLikeCount] = useState(0);
  const [shareCount, setShareCount] = useState(0);
  const [duration, setDuration] = useState(0);
  const [ending, setEnding] = useState(false);
  const endedRef = useRef(false);
  const streamIdRef = useRef(streamId);
  streamIdRef.current = streamId;

  // Control hub
  const [hubVisible, setHubVisible] = useState(false);
  const hubAnim = useRef(new Animated.Value(0)).current;

  // Product pinning
  const [pickerVisible, setPickerVisible] = useState(false);
  const pickerAnim = useRef(new Animated.Value(0)).current;
  const kbOffset = useRef(new Animated.Value(0)).current;
  const [activePin, setActivePin] = useState<LiveStreamPin | null>(null);
  const [hostListings, setHostListings] = useState<any[]>([]);
  const [pickerTab, setPickerTab] = useState<"listing" | "flash">("listing");
  const [pinning, setPinning] = useState(false);
  const [auctionDuration, setAuctionDuration] = useState("300");
  const [customDuration, setCustomDuration] = useState("");
  // Flash auction fields
  const [flashName, setFlashName] = useState("");
  const [flashPrice, setFlashPrice] = useState("");
  const [flashImage, setFlashImage] = useState<string | null>(null);
  const [flashIncrement, setFlashIncrement] = useState("");
  const [flashReserve, setFlashReserve] = useState("");

  // Slide picker sheet up when keyboard opens
  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const onShow = Keyboard.addListener(showEvent, (e) => {
      Animated.timing(kbOffset, {
        toValue: -e.endCoordinates.height,
        duration: Platform.OS === "ios" ? e.duration : 250,
        useNativeDriver: true,
      }).start();
    });
    const onHide = Keyboard.addListener(hideEvent, () => {
      Animated.timing(kbOffset, {
        toValue: 0,
        duration: Platform.OS === "ios" ? 250 : 200,
        useNativeDriver: true,
      }).start();
    });
    return () => { onShow.remove(); onHide.remove(); };
  }, [kbOffset]);

  useEffect(() => {
    let cancelled = false;
    const FATAL_CODES = new Set([17, 110, 109, 101, 102, 103, 1003]);

    (async () => {
      const cam = camPermission?.granted ? camPermission : await requestCam();
      const mic = micPermission?.granted ? micPermission : await requestMic();
      if (cancelled) return;
      if (!cam?.granted || !mic?.granted) {
        Alert.alert(
          "Permissions Required",
          "Camera and microphone access are needed to go live. Please grant them in Settings.",
        );
        return;
      }

      if (AGORA_DISABLED) {
        setAgoraReady(true);
        setLocalUid(1);
        return;
      }

      // Brief delay so expo-camera fully releases the hardware before Agora grabs it
      await new Promise((r) => setTimeout(r, 600));
      if (cancelled) return;

      let tokenResult;
      try {
        tokenResult = await fetchAgoraToken(streamId, "publisher");
        setLocalUid(tokenResult.uid);
      } catch (e: any) {
        console.warn("[Agora Token Error]", e);
        const message = e?.message ?? "Failed to get streaming credentials.";
        setAgoraFatalError(message);
        Alert.alert("Live Streaming Error", message);
        return;
      }
      if (cancelled) return;

      const handler: IRtcEngineEventHandler = {
        onJoinChannelSuccess: () => {
          console.log("[Agora] Host joined channel OK");
          setAgoraFatalError(null);
          setAgoraReady(true);
        },
        onError: (errCode, msg) => {
          console.warn("[Agora Host Error]", errCode, msg);
          if (FATAL_CODES.has(errCode)) {
            const message = `${msg || "Failed to initialize live video."} (code ${errCode})`;
            setAgoraFatalError(message);
            Alert.alert("Live Streaming Error", message);
          }
        },
      };
      handlerRef.current = handler;
      try {
        engineRef.current = createHostEngine(
          tokenResult.appId,
          streamId,
          tokenResult.token,
          tokenResult.uid,
          handler,
        );
      } catch (e: any) {
        console.warn("[Agora Host Init Error]", e);
        const message = e?.message ?? "Failed to start live stream.";
        setAgoraFatalError(message);
        Alert.alert("Live Streaming Error", message);
      }
    })();

    return () => {
      cancelled = true;
      destroyEngine(engineRef.current, handlerRef.current ?? undefined);
      engineRef.current = null;
      handlerRef.current = null;
      setAgoraReady(false);
      setAgoraFatalError(null);
      setLocalUid(0);
    };
  }, [streamId]);

  useEffect(() => {
    fetchRecentChats(streamId).then(setChats).catch(() => {});
  }, [streamId]);

  // Auto-end the stream on true unmount (deferred so strict-mode re-mount can cancel)
  const endTimerRef = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    endedRef.current = false;
    if (endTimerRef.current) clearTimeout(endTimerRef.current);
    return () => {
      endTimerRef.current = setTimeout(() => {
        if (!endedRef.current) {
          endedRef.current = true;
          endStream(streamIdRef.current).catch(() => {});
        }
      }, 1000);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const interval = setInterval(() => setDuration((d) => d + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const chatSub = subscribeLiveChat(streamId, (msg) => {
      setChats((prev) => [...prev.slice(-199), msg]);
      setTimeout(() => chatListRef.current?.scrollToEnd({ animated: true }), 100);
    });
    const streamSub = subscribeLiveStream(streamId, (update) => {
      if (update.viewer_count !== undefined) setViewerCount(update.viewer_count);
      if (update.like_count !== undefined) setLikeCount(update.like_count);
      if (update.share_count !== undefined) setShareCount(update.share_count);
    });
    return () => {
      supabase.removeChannel(chatSub);
      supabase.removeChannel(streamSub);
    };
  }, [streamId]);

  // Load active pin + host products
  useEffect(() => {
    fetchActivePin(streamId).then(setActivePin).catch(() => {});
    supabase.auth.getUser().then(({ data }) => {
      const uid = data.user?.id;
      if (!uid) return;
      fetchHostListings(uid).then(setHostListings).catch(() => {});
    });
  }, [streamId]);

  // Realtime pin updates
  useEffect(() => {
    const sub = subscribePinUpdates(streamId, (update) => {
      if (update.is_active === false) {
        setActivePin(null);
      } else {
        setActivePin((prev) => prev ? { ...prev, ...update } as LiveStreamPin : null);
        if (update.id && !activePin) {
          fetchActivePin(streamId).then(setActivePin).catch(() => {});
        }
      }
    });
    return () => { supabase.removeChannel(sub); };
  }, [streamId]);

  const togglePicker = useCallback(() => {
    const next = !pickerVisible;
    setPickerVisible(next);
    Animated.spring(pickerAnim, {
      toValue: next ? 1 : 0,
      useNativeDriver: true,
      tension: 65,
      friction: 10,
    }).start();
  }, [pickerVisible, pickerAnim]);

  const handlePin = useCallback(async (_type: "listing", itemId: string) => {
    setPinning(true);
    try {
      await pinProduct({
        streamId,
        pinType: "listing",
        listingId: itemId,
      });
      const pin = await fetchActivePin(streamId);
      setActivePin(pin);
      togglePicker();
    } catch (e: any) {
      Alert.alert("Pin Failed", e.message);
    }
    setPinning(false);
  }, [streamId, togglePicker]);

  const handleUnpin = useCallback(async () => {
    try {
      await unpinProduct(streamId);
      setActivePin(null);
    } catch (e: any) {
      Alert.alert("Unpin Failed", e.message);
    }
  }, [streamId]);

  const pickFlashImage = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (!result.canceled && result.assets[0]) {
      setFlashImage(result.assets[0].uri);
    }
  }, []);

  const uploadFlashImage = useCallback(async (localUri: string, userId: string): Promise<string> => {
    const extMatch = localUri.match(/\.(\w+)(\?|$)/);
    const ext = extMatch?.[1]?.toLowerCase() ?? "jpg";
    const mimeTypes: Record<string, string> = {
      jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
      gif: "image/gif", webp: "image/webp",
    };
    const contentType = mimeTypes[ext] ?? "image/jpeg";
    const filePath = `flash/${userId}/${Date.now()}.${ext}`;
    const resp = await fetch(localUri);
    const arrayBuf = await resp.arrayBuffer();
    const { error } = await supabase.storage
      .from("listing-images")
      .upload(filePath, arrayBuf, { upsert: true, contentType });
    if (error) throw error;
    const { data } = supabase.storage.from("listing-images").getPublicUrl(filePath);
    return data.publicUrl;
  }, []);

  const handleFlashAuction = useCallback(async () => {
    if (!flashName.trim()) return;
    setPinning(true);
    try {
      let imageUrl: string | undefined;
      if (flashImage) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) imageUrl = await uploadFlashImage(flashImage, user.id);
      }
      const durationSec = parseInt(auctionDuration) || 300;
      const increment = parseFloat(flashIncrement) || undefined;
      const reserve = parseFloat(flashReserve) || undefined;
      await pinProduct({
        streamId,
        pinType: "flash",
        startingPrice: parseFloat(flashPrice) || 1,
        durationSeconds: durationSec,
        flashName: flashName.trim(),
        flashImageUrl: imageUrl,
        bidIncrement: increment,
        reservePrice: reserve,
      });
      const pin = await fetchActivePin(streamId);
      setActivePin(pin);
      togglePicker();
      setFlashName("");
      setFlashPrice("");
      setFlashImage(null);
      setFlashIncrement("");
      setFlashReserve("");
    } catch (e: any) {
      Alert.alert("Flash Auction Failed", e.message);
    }
    setPinning(false);
  }, [streamId, flashName, flashPrice, flashImage, auctionDuration, togglePicker, uploadFlashImage]);

  const toggleHub = useCallback(() => {
    const next = !hubVisible;
    setHubVisible(next);
    Animated.spring(hubAnim, {
      toValue: next ? 1 : 0,
      useNativeDriver: true,
      tension: 65,
      friction: 10,
    }).start();
  }, [hubVisible, hubAnim]);

  const handleSend = useCallback(async () => {
    const text = chatText.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      await sendChatMessage(streamId, text);
      setChatText("");
    } catch {
      Alert.alert("Error", "Failed to send.");
    }
    setSending(false);
  }, [chatText, sending, streamId]);

  const handleEnd = useCallback(() => {
    Alert.alert("End Stream?", "Your live stream will end for all viewers.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "End",
        style: "destructive",
        onPress: async () => {
          setEnding(true);
          endedRef.current = true;
          try {
            await endStream(streamId);
          } catch {}
          destroyEngine(engineRef.current, handlerRef.current ?? undefined);
          engineRef.current = null;
          onEnd();
        },
      },
    ]);
  }, [streamId, onEnd]);

  const handleShare = useCallback(async () => {
    await Share.share({ message: "I'm live on Evend right now! Come watch!" });
  }, []);

  const flipCamera = () => {
    if (!AGORA_DISABLED) engineRef.current?.switchCamera();
    setFacing((f) => (f === "back" ? "front" : "back"));
  };
  const toggleTorch = () => {
    const next = !torch;
    if (!AGORA_DISABLED) engineRef.current?.setCameraTorchOn(next);
    setTorch(next);
  };
  const toggleMic = () => {
    const next = !micMuted;
    if (!AGORA_DISABLED) engineRef.current?.muteLocalAudioStream(next);
    setMicMuted(next);
  };

  const fmtDur = `${String(Math.floor(duration / 3600)).padStart(2, "0")}:${String(Math.floor((duration % 3600) / 60)).padStart(2, "0")}:${String(duration % 60).padStart(2, "0")}`;

  const hubTranslateY = hubAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [400, 0],
  });

  return (
    <View style={st.root}>
      <StatusBar style="light" />

      {/* Full-screen video: Expo Camera preview (no Agora) or Agora publisher */}
      {AGORA_DISABLED ? (
        <CameraView style={StyleSheet.absoluteFill} facing={facing} enableTorch={torch} />
      ) : (
        <HostAgoraLocalVideo localUid={localUid} />
      )}
      {!agoraReady && (
        <View style={st.agoraLoading}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={st.agoraLoadingText}>
            {agoraFatalError ? "Live video failed to start." : "Connecting live stream..."}
          </Text>
        </View>
      )}
      {AGORA_DISABLED && agoraReady && (
        <View style={st.previewModeBanner}>
          <Text style={st.previewModeText}>Preview mode · local camera only (dev build streams with Agora)</Text>
        </View>
      )}

      {/* Top bar — stats */}
      <SafeAreaView style={st.hostTopSafe} pointerEvents="box-none">
        <View style={st.hostTopBar}>
          <View style={st.livePill}>
            <View style={st.liveDot} />
            <Text style={st.liveLabel}>LIVE</Text>
            <Text style={st.durationText}>{fmtDur}</Text>
          </View>
          <View style={st.hostStatsRow}>
            <View style={st.statPill}>
              <Ionicons name="eye" size={11} color="#fff" />
              <Text style={st.statText}>{formatViewers(viewerCount)}</Text>
            </View>
            <View style={st.statPill}>
              <Ionicons name="heart" size={11} color={C.live} />
              <Text style={st.statText}>{likeCount}</Text>
            </View>
          </View>
        </View>
      </SafeAreaView>

      {/* Right-side camera controls */}
      <View style={[st.cameraControls, { top: insets.top + 70 }]}>
        <Pressable style={st.camCtrlBtn} onPress={flipCamera}>
          <Ionicons name="camera-reverse-outline" size={22} color="#fff" />
          <Text style={st.camCtrlLabel}>Flip</Text>
        </Pressable>
        <Pressable style={[st.camCtrlBtn, torch && st.camCtrlBtnActive]} onPress={toggleTorch}>
          <Ionicons name={torch ? "flash" : "flash-outline"} size={22} color={torch ? "#FFD700" : "#fff"} />
          <Text style={st.camCtrlLabel}>{torch ? "On" : "Flash"}</Text>
        </Pressable>
        <Pressable style={[st.camCtrlBtn, micMuted && st.camCtrlBtnDanger]} onPress={toggleMic}>
          <Ionicons name={micMuted ? "mic-off" : "mic"} size={22} color={micMuted ? C.live : "#fff"} />
          <Text style={st.camCtrlLabel}>{micMuted ? "Muted" : "Mic"}</Text>
        </Pressable>
        <Pressable style={st.camCtrlBtn} onPress={handleShare}>
          <Ionicons name="share-outline" size={22} color="#fff" />
          <Text style={st.camCtrlLabel}>Share</Text>
        </Pressable>
        <Pressable style={[st.camCtrlBtn, activePin && st.camCtrlBtnActive]} onPress={togglePicker}>
          <Ionicons name="pricetag" size={22} color={activePin ? C.accent : "#fff"} />
          <Text style={st.camCtrlLabel}>Products</Text>
        </Pressable>
        <Pressable style={st.camCtrlBtn} onPress={toggleHub}>
          <Ionicons name="grid-outline" size={22} color="#fff" />
          <Text style={st.camCtrlLabel}>Hub</Text>
        </Pressable>
      </View>

      {/* Chat overlay — bottom left */}
      <View style={[st.chatOverlay, { bottom: insets.bottom + 70 }]}>
        {chats.slice(-6).map((msg) => (
          <View key={msg.id} style={st.chatBubbleOverlay}>
            <Text style={st.chatUserOverlay}>
              {msg.user?.display_name || msg.user?.username || "user"}
            </Text>
            <Text style={st.chatTextOverlay}>{msg.message}</Text>
          </View>
        ))}
      </View>

      {/* Bottom bar: chat input + end */}
      <View style={[st.hostBottomBar, { paddingBottom: Math.max(insets.bottom, 14) }]}>
        <TextInput
          style={st.hostChatInput}
          placeholder="Chat with viewers..."
          placeholderTextColor="rgba(255,255,255,0.5)"
          value={chatText}
          onChangeText={setChatText}
          onSubmitEditing={handleSend}
          returnKeyType="send"
        />
        <Pressable style={st.endBtnLarge} onPress={handleEnd} disabled={ending}>
          {ending ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={st.endBtnLargeText}>END</Text>
          )}
        </Pressable>
      </View>

      {/* ── Active Pin Indicator ── */}
      {activePin && (
        <View style={[st.activePinBar, { bottom: insets.bottom + 66 }]}>
          <View style={st.activePinLeft}>
            <Ionicons name="pricetag" size={14} color={C.accent} />
            <Text style={st.activePinText} numberOfLines={1}>
              {activePin.pin_type === "listing"
                ? activePin.listing?.card_name ?? "Product"
                : activePin.flash_name ?? "Flash Auction"}
            </Text>
            {activePin.pin_type === "flash" && (
              <Text style={st.activePinBid}>
                RM{activePin.current_bid?.toFixed(0)} · {activePin.bid_count} bids
              </Text>
            )}
          </View>
          <Pressable style={st.unpinBtn} onPress={handleUnpin}>
            <Ionicons name="close-circle" size={18} color={C.live} />
          </Pressable>
        </View>
      )}

      {/* ── Product Picker Sheet ── */}
      {pickerVisible && (
        <Pressable style={st.hubBackdrop} onPress={togglePicker} />
      )}
      <Animated.View
        style={[
          st.pickerSheet,
          {
            paddingBottom: insets.bottom + 16,
            transform: [{
              translateY: Animated.add(
                pickerAnim.interpolate({ inputRange: [0, 1], outputRange: [600, 0] }),
                kbOffset,
              ),
            }],
          },
        ]}
        pointerEvents={pickerVisible ? "auto" : "none"}
      >
        <View style={st.hubHandle} />
        <Text style={st.hubTitle}>Pin a Product</Text>

        <View style={st.pickerTabs}>
          {(["listing", "flash"] as const).map((tab) => (
            <Pressable
              key={tab}
              style={[st.pickerTab, pickerTab === tab && st.pickerTabActive]}
              onPress={() => setPickerTab(tab)}
            >
              <Text style={[st.pickerTabText, pickerTab === tab && st.pickerTabTextActive]}>
                {tab === "listing" ? "Listings" : "Flash Auction"}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* ── Flash Auction form ── */}
        {pickerTab === "flash" && (
          <ScrollView
            style={{ flex: 1 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={st.auctionFields}>
              <Pressable style={st.flashImagePicker} onPress={pickFlashImage}>
                {flashImage ? (
                  <Image source={{ uri: flashImage }} style={st.flashImagePreview} />
                ) : (
                  <View style={st.flashImagePlaceholder}>
                    <Ionicons name="camera-outline" size={24} color={C.textMuted} />
                    <Text style={st.flashImageText}>Add Photo</Text>
                  </View>
                )}
              </Pressable>
              <Text style={st.flashImageHint}>
                Tip: you can screenshot your live feed and pick that photo—buyers see the same shot as on stream.
              </Text>
              <View style={st.auctionFieldRow}>
                <Text style={st.auctionFieldLabel}>Item Name</Text>
                <TextInput
                  style={st.auctionFieldInput}
                  placeholder="e.g. Charizard PSA 10"
                  placeholderTextColor={C.textMuted}
                  value={flashName}
                  onChangeText={setFlashName}
                />
              </View>
              <View style={st.auctionFieldRow}>
                <Text style={st.auctionFieldLabel}>Starting Price (RM)</Text>
                <TextInput
                  style={st.auctionFieldInput}
                  placeholder="1.00"
                  placeholderTextColor={C.textMuted}
                  keyboardType="numeric"
                  value={flashPrice}
                  onChangeText={setFlashPrice}
                />
              </View>
              <View style={st.auctionFieldRow}>
                <Text style={st.auctionFieldLabel}>Bid Increment (RM)</Text>
                <TextInput
                  style={st.auctionFieldInput}
                  placeholder="e.g. 5 (optional)"
                  placeholderTextColor={C.textMuted}
                  keyboardType="numeric"
                  value={flashIncrement}
                  onChangeText={setFlashIncrement}
                />
              </View>
              <View style={st.auctionFieldRow}>
                <Text style={st.auctionFieldLabel}>Reserve Price (RM)</Text>
                <TextInput
                  style={st.auctionFieldInput}
                  placeholder="optional"
                  placeholderTextColor={C.textMuted}
                  keyboardType="numeric"
                  value={flashReserve}
                  onChangeText={setFlashReserve}
                />
              </View>
              <View style={st.auctionFieldRow}>
                <Text style={st.auctionFieldLabel}>Duration</Text>
                <View style={st.durationRow}>
                  {["60", "120", "300", "600"].map((d) => (
                    <Pressable
                      key={d}
                      style={[st.durationChip, auctionDuration === d && !customDuration && st.durationChipActive]}
                      onPress={() => { setAuctionDuration(d); setCustomDuration(""); }}
                    >
                      <Text style={[st.durationChipText, auctionDuration === d && !customDuration && st.durationChipTextActive]}>
                        {parseInt(d) >= 60 ? `${parseInt(d) / 60}m` : `${d}s`}
                      </Text>
                    </Pressable>
                  ))}
                  <TextInput
                    style={[st.durationCustomInput, customDuration ? st.durationCustomInputActive : null]}
                    placeholder="min"
                    placeholderTextColor={C.textMuted}
                    keyboardType="numeric"
                    value={customDuration}
                    onChangeText={(v) => { setCustomDuration(v); if (v) setAuctionDuration(String(parseFloat(v) * 60 || 300)); }}
                  />
                </View>
              </View>

              <Pressable
                style={[st.flashStartBtn, (!flashName.trim() || pinning) && st.flashStartBtnDisabled]}
                onPress={handleFlashAuction}
                disabled={!flashName.trim() || pinning}
              >
                {pinning ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="flash" size={16} color="#fff" />
                    <Text style={st.flashStartBtnText}>Start Flash Auction</Text>
                  </>
                )}
              </Pressable>
            </View>
          </ScrollView>
        )}

        {/* ── Listings list ── */}
        {pickerTab === "listing" && (
          <FlatList
            data={hostListings}
            keyExtractor={(item) => item.id}
            style={st.pickerList}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <Pressable
                style={st.pickerItem}
                onPress={() => handlePin("listing", item.id)}
                disabled={pinning}
              >
                {item.images?.[0] ? (
                  <CachedImage source={{ uri: item.images[0] }} style={st.pickerItemImg} />
                ) : (
                  <View style={[st.pickerItemImg, st.pickerItemImgFallback]}>
                    <Ionicons name="cube-outline" size={18} color={C.textMuted} />
                  </View>
                )}
                <View style={st.pickerItemMeta}>
                  <Text style={st.pickerItemName} numberOfLines={1}>{item.card_name}</Text>
                  <Text style={st.pickerItemPrice}>RM{item.price?.toFixed(2)}</Text>
                </View>
                <View style={st.pickerPinBtn}>
                  <Ionicons name="pricetag-outline" size={16} color={C.accent} />
                </View>
              </Pressable>
            )}
            ListEmptyComponent={
              <View style={st.pickerEmpty}>
                <Text style={st.pickerEmptyText}>
                  No active listings. Create one from your Vendor Hub.
                </Text>
              </View>
            }
          />
        )}
      </Animated.View>

      {/* ── Control Hub Bottom Sheet ── */}
      {hubVisible && (
        <Pressable style={st.hubBackdrop} onPress={toggleHub} />
      )}
      <Animated.View
        style={[
          st.hubSheet,
          { paddingBottom: insets.bottom + 16, transform: [{ translateY: hubTranslateY }] },
        ]}
        pointerEvents={hubVisible ? "auto" : "none"}
      >
        <View style={st.hubHandle} />
        <Text style={st.hubTitle}>Stream Control Hub</Text>

        {/* Stats grid */}
        <View style={st.hubStatsGrid}>
          <View style={st.hubStatBox}>
            <Ionicons name="eye" size={20} color={C.accent} />
            <Text style={st.hubStatNum}>{formatViewers(viewerCount)}</Text>
            <Text style={st.hubStatLabel}>Viewers</Text>
          </View>
          <View style={st.hubStatBox}>
            <Ionicons name="heart" size={20} color={C.live} />
            <Text style={st.hubStatNum}>{likeCount}</Text>
            <Text style={st.hubStatLabel}>Likes</Text>
          </View>
          <View style={st.hubStatBox}>
            <Ionicons name="share-social" size={20} color={C.success} />
            <Text style={st.hubStatNum}>{shareCount}</Text>
            <Text style={st.hubStatLabel}>Shares</Text>
          </View>
          <View style={st.hubStatBox}>
            <Ionicons name="time" size={20} color={C.textAccent} />
            <Text style={st.hubStatNum}>{fmtDur}</Text>
            <Text style={st.hubStatLabel}>Duration</Text>
          </View>
        </View>

        {/* Quick actions */}
        <Text style={st.hubSectionTitle}>Quick Actions</Text>
        <View style={st.hubActionsRow}>
          <Pressable style={st.hubActionBtn} onPress={flipCamera}>
            <View style={st.hubActionIcon}>
              <Ionicons name="camera-reverse" size={20} color={C.accent} />
            </View>
            <Text style={st.hubActionLabel}>Flip Camera</Text>
          </Pressable>
          <Pressable style={st.hubActionBtn} onPress={toggleTorch}>
            <View style={[st.hubActionIcon, torch && { backgroundColor: "rgba(255,215,0,0.15)" }]}>
              <Ionicons name={torch ? "flash" : "flash-outline"} size={20} color={torch ? "#FFD700" : C.textSecondary} />
            </View>
            <Text style={st.hubActionLabel}>{torch ? "Flash On" : "Flash Off"}</Text>
          </Pressable>
          <Pressable style={st.hubActionBtn} onPress={toggleMic}>
            <View style={[st.hubActionIcon, micMuted && { backgroundColor: "rgba(234,61,94,0.15)" }]}>
              <Ionicons name={micMuted ? "mic-off" : "mic"} size={20} color={micMuted ? C.live : C.textSecondary} />
            </View>
            <Text style={st.hubActionLabel}>{micMuted ? "Unmute" : "Mute Mic"}</Text>
          </Pressable>
          <Pressable style={st.hubActionBtn} onPress={handleShare}>
            <View style={st.hubActionIcon}>
              <Ionicons name="share-social" size={20} color={C.success} />
            </View>
            <Text style={st.hubActionLabel}>Share</Text>
          </Pressable>
        </View>

        <Pressable style={st.hubEndBtn} onPress={handleEnd}>
          <Ionicons name="stop-circle" size={18} color="#fff" />
          <Text style={st.hubEndBtnText}>End Live Stream</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

/* ─────────────────────────────────────────────
   Main Export
   ───────────────────────────────────────────── */

export default function GoLiveScreen({ onBack }: Props) {
  const [streamId, setStreamId] = useState<string | null>(null);

  const handleGoLive = useCallback(
    async (title: string, category: string, tags: string[], thumbnailUrl: string | null) => {
      try {
        const { data, error } = await supabase.rpc("go_live", {
          p_title: title,
          p_category: category,
          p_tags: tags,
          p_thumbnail_url: thumbnailUrl,
        });
        if (error) throw new Error(error.message);
        setStreamId((data as any).stream_id);
      } catch (e: any) {
        Alert.alert("Failed to start stream", e.message);
      }
    },
    [],
  );

  const handleEnd = useCallback(() => {
    setStreamId(null);
    onBack();
  }, [onBack]);

  if (!streamId) {
    return <SetupView onGoLive={handleGoLive} onBack={onBack} />;
  }

  return <LiveHostView streamId={streamId} onEnd={handleEnd} />;
}

/* ─────────────────────────────────────────────
   Styles
   ───────────────────────────────────────────── */

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  agoraLoading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: "rgba(0,0,0,0.35)",
    zIndex: 2,
  },
  agoraLoadingText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
  },
  previewModeBanner: {
    position: "absolute",
    top: 120,
    left: S.screenPadding,
    right: S.screenPadding,
    backgroundColor: "rgba(0,0,0,0.65)",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    zIndex: 12,
  },
  previewModeText: {
    color: C.textSecondary,
    fontSize: 11,
    fontWeight: "600",
    textAlign: "center",
  },

  /* ── Setup ── */
  setupCameraWrap: {
    width: "100%",
    aspectRatio: 4 / 3,
    backgroundColor: "#000",
    overflow: "hidden",
  },
  setupPreviewOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  setupTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: S.screenPadding,
    paddingTop: 8,
  },
  setupTitle: { color: "#fff", fontSize: 17, fontWeight: "800" },
  glassBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  noPermissionBox: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
    backgroundColor: C.surface,
  },
  noPermText: { color: C.textSecondary, fontSize: 13, fontWeight: "600" },
  grantBtn: {
    backgroundColor: C.accent,
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  grantBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  setupForm: {
    flex: 1,
    paddingHorizontal: S.screenPadding,
    paddingTop: 18,
  },
  field: { gap: 8, marginBottom: 18 },
  label: {
    color: C.textSecondary,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: C.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 14,
    height: 46,
    color: C.textPrimary,
    fontSize: 14,
    fontWeight: "500",
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    backgroundColor: C.surface,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  chipActive: { backgroundColor: C.accent, borderColor: C.accent },
  chipText: { color: C.textSecondary, fontSize: 12, fontWeight: "700" },
  chipTextActive: { color: "#fff" },
  thumbPreviewWrap: {
    width: "100%",
    aspectRatio: 16 / 9,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: C.surface,
  },
  thumbPreviewImg: { width: "100%", height: "100%" },
  thumbUploadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  thumbUploadingText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  thumbRemoveBtn: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 12,
  },
  thumbPickBtn: {
    width: "100%",
    aspectRatio: 16 / 9,
    backgroundColor: C.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  thumbPickText: { color: C.textSecondary, fontSize: 13, fontWeight: "600" },
  thumbPickHint: { color: C.textMuted, fontSize: 10, fontWeight: "500" },

  presetScroll: { marginBottom: 4 },
  presetCard: {
    width: 100,
    marginRight: 10,
    borderRadius: 10,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    overflow: "hidden",
  },
  presetThumb: {
    width: "100%",
    aspectRatio: 16 / 9,
    backgroundColor: C.cardAlt,
  },
  presetThumbFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  presetName: {
    color: C.textPrimary,
    fontSize: 10,
    fontWeight: "700",
    paddingHorizontal: 6,
    paddingVertical: 6,
  },
  presetDeleteBtn: {
    position: "absolute",
    top: 4,
    right: 4,
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 10,
    padding: 3,
  },
  savePresetToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    marginBottom: 14,
  },
  savePresetToggleText: { color: C.accent, fontSize: 13, fontWeight: "700" },
  savePresetRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 14,
  },
  savePresetBtn: {
    backgroundColor: C.accent,
    borderRadius: 10,
    paddingHorizontal: 16,
    height: 46,
    alignItems: "center",
    justifyContent: "center",
  },
  savePresetBtnText: { color: "#fff", fontSize: 13, fontWeight: "700" },

  goLiveMainBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: C.live,
    borderRadius: 14,
    height: 52,
    marginTop: 4,
  },
  goLiveBtnText: { color: "#fff", fontSize: 16, fontWeight: "800", letterSpacing: 0.5 },

  /* ── Host — top ── */
  hostTopSafe: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  hostTopBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: S.screenPadding,
    paddingTop: 8,
  },
  livePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.live },
  liveLabel: { color: "#fff", fontSize: 11, fontWeight: "800", letterSpacing: 0.5 },
  durationText: { color: "rgba(255,255,255,0.7)", fontSize: 11, fontWeight: "700" },
  hostStatsRow: { flexDirection: "row", gap: 6 },
  statPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  statText: { color: "#fff", fontSize: 11, fontWeight: "700" },

  /* ── Host — right camera controls ── */
  cameraControls: {
    position: "absolute",
    right: S.screenPadding,
    gap: 14,
    alignItems: "center",
    zIndex: 10,
  },
  camCtrlBtn: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  camCtrlBtnActive: { backgroundColor: "rgba(255,215,0,0.25)" },
  camCtrlBtnDanger: { backgroundColor: "rgba(234,61,94,0.25)" },
  camCtrlLabel: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 8,
    fontWeight: "700",
    marginTop: 2,
    textAlign: "center",
    position: "absolute",
    bottom: -14,
  },

  /* ── Host — chat overlay ── */
  chatOverlay: {
    position: "absolute",
    left: S.screenPadding,
    right: 80,
    zIndex: 5,
  },
  chatBubbleOverlay: {
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 4,
    alignSelf: "flex-start",
    maxWidth: "100%",
  },
  chatUserOverlay: { color: C.textAccent, fontSize: 10, fontWeight: "700", marginBottom: 1 },
  chatTextOverlay: { color: "#fff", fontSize: 12, fontWeight: "500", lineHeight: 16 },

  /* ── Host — bottom bar ── */
  hostBottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: S.screenPadding,
    paddingTop: 10,
    zIndex: 10,
  },
  hostChatInput: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    paddingHorizontal: 14,
    height: 42,
    color: "#fff",
    fontSize: 13,
    fontWeight: "500",
  },
  endBtnLarge: {
    backgroundColor: C.live,
    borderRadius: 999,
    paddingHorizontal: 22,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
  },
  endBtnLargeText: { color: "#fff", fontSize: 13, fontWeight: "800", letterSpacing: 0.5 },

  /* ── Control Hub Sheet ── */
  hubBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.4)",
    zIndex: 20,
  },
  hubSheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: C.card,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: S.screenPadding,
    paddingTop: 12,
    zIndex: 30,
    borderTopWidth: 1,
    borderTopColor: C.borderCard,
  },
  hubHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.muted,
    alignSelf: "center",
    marginBottom: 14,
  },
  hubTitle: { color: C.textPrimary, fontSize: 16, fontWeight: "800", marginBottom: 16 },
  hubStatsGrid: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 20,
  },
  hubStatBox: {
    flex: 1,
    backgroundColor: C.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    paddingVertical: 14,
    alignItems: "center",
    gap: 4,
  },
  hubStatNum: { color: C.textPrimary, fontSize: 18, fontWeight: "800" },
  hubStatLabel: { color: C.textSecondary, fontSize: 10, fontWeight: "600" },
  hubSectionTitle: {
    color: C.textSecondary,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  hubActionsRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 18,
  },
  hubActionBtn: {
    flex: 1,
    alignItems: "center",
    gap: 8,
  },
  hubActionIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
    justifyContent: "center",
  },
  hubActionLabel: { color: C.textSecondary, fontSize: 10, fontWeight: "700" },
  hubEndBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: C.live,
    borderRadius: 14,
    height: 48,
    marginTop: 4,
  },
  hubEndBtnText: { color: "#fff", fontSize: 14, fontWeight: "800" },

  /* ── Active Pin Bar ── */
  activePinBar: {
    position: "absolute",
    left: S.screenPadding,
    right: S.screenPadding,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.7)",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    zIndex: 15,
  },
  activePinLeft: { flex: 1, flexDirection: "row", alignItems: "center", gap: 6 },
  activePinText: { color: C.textPrimary, fontSize: 12, fontWeight: "700", flexShrink: 1 },
  activePinBid: { color: C.textAccent, fontSize: 11, fontWeight: "700" },
  unpinBtn: { padding: 4 },

  /* ── Product Picker Sheet ── */
  pickerSheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: C.card,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: S.screenPadding,
    paddingTop: 12,
    maxHeight: "70%",
    zIndex: 30,
    borderTopWidth: 1,
    borderTopColor: C.borderCard,
  },
  pickerTabs: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 14,
  },
  pickerTab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
  },
  pickerTabActive: { backgroundColor: C.accent, borderColor: C.accent },
  pickerTabText: { color: C.textSecondary, fontSize: 12, fontWeight: "700" },
  pickerTabTextActive: { color: "#fff" },
  pickerList: { flex: 1 },
  pickerItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  pickerItemImg: { width: 48, height: 48, borderRadius: 8 },
  pickerItemImgFallback: {
    backgroundColor: C.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  pickerItemMeta: { flex: 1, gap: 2 },
  pickerItemName: { color: C.textPrimary, fontSize: 13, fontWeight: "700" },
  pickerItemPrice: { color: C.textAccent, fontSize: 12, fontWeight: "600" },
  pickerPinBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "rgba(44,128,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  pickerEmpty: { paddingVertical: 24, alignItems: "center" },
  pickerEmptyText: { color: C.textMuted, fontSize: 12, fontWeight: "500", textAlign: "center" },
  auctionFields: { gap: 10, marginBottom: 12 },
  auctionFieldRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  auctionFieldLabel: { color: C.textSecondary, fontSize: 11, fontWeight: "700", width: 110 },
  auctionFieldInput: {
    flex: 1,
    backgroundColor: C.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 10,
    height: 36,
    color: C.textPrimary,
    fontSize: 13,
    fontWeight: "600",
  },
  durationRow: { flex: 1, flexDirection: "row", flexWrap: "wrap", gap: 6 },
  durationChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
  },
  durationChipActive: { backgroundColor: C.accent, borderColor: C.accent },
  durationChipText: { color: C.textSecondary, fontSize: 11, fontWeight: "700" },
  durationChipTextActive: { color: "#fff" },
  durationCustomInput: {
    width: 48,
    height: 30,
    borderRadius: 999,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    textAlign: "center",
    color: C.textPrimary,
    fontSize: 11,
    fontWeight: "700",
    paddingHorizontal: 4,
    paddingVertical: 0,
  },
  durationCustomInputActive: { borderColor: C.accent, backgroundColor: "rgba(44,128,255,0.12)" },
  // Flash auction
  flashImagePicker: { alignSelf: "center", marginBottom: 4 },
  flashImagePreview: { width: 80, height: 80, borderRadius: 12 },
  flashImagePlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 12,
    backgroundColor: C.surface,
    borderWidth: 1.5,
    borderColor: C.border,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  flashImageText: { color: C.textMuted, fontSize: 10, fontWeight: "600" },
  flashImageHint: {
    color: C.textSecondary,
    fontSize: 11,
    fontWeight: "500",
    lineHeight: 15,
    textAlign: "center",
    marginBottom: 4,
    paddingHorizontal: 10,
  },
  flashStartBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: C.live,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 4,
  },
  flashStartBtnDisabled: { opacity: 0.5 },
  flashStartBtnText: { color: "#fff", fontSize: 14, fontWeight: "800" },
});
