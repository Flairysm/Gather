import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather, Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import {
  RtcSurfaceView,
  RenderModeType,
  VideoSourceType,
  type IRtcEngine,
  type IRtcEngineEventHandler,
} from "react-native-agora";

import { C, S } from "../theme";
import { supabase } from "../lib/supabase";
import {
  fetchStream,
  fetchRecentChats,
  sendChatMessage,
  subscribeLiveChat,
  subscribeLiveStream,
  joinStream,
  leaveStream,
  toggleLike,
  type LiveStream,
  type ChatMessage,
} from "../data/live";
import CachedImage from "../components/CachedImage";
import { createAudienceEngine, destroyEngine, fetchAgoraToken } from "../lib/agora";

type Props = { streamId: string; onBack: () => void };

function formatViewers(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

export default function LiveViewerScreen({ streamId, onBack }: Props) {
  const insets = useSafeAreaInsets();
  const chatListRef = useRef<FlatList>(null);
  const engineRef = useRef<IRtcEngine | null>(null);
  const handlerRef = useRef<IRtcEngineEventHandler | null>(null);
  const initStartedRef = useRef(false);
  const [stream, setStream] = useState<LiveStream | null>(null);
  const [chats, setChats] = useState<ChatMessage[]>([]);
  const [chatText, setChatText] = useState("");
  const [sending, setSending] = useState(false);
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [remoteUid, setRemoteUid] = useState<number | null>(null);
  const [agoraReady, setAgoraReady] = useState(false);
  const [agoraFatalError, setAgoraFatalError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [streamData, chatData, authData] = await Promise.all([
      fetchStream(streamId),
      fetchRecentChats(streamId),
      supabase.auth.getUser(),
    ]);
    setStream(streamData);
    setChats(chatData);
    setLikeCount(streamData?.like_count ?? 0);
    const uid = authData.data.user?.id ?? null;
    setUserId(uid);

    if (uid && streamData && streamData.is_live) {
      try {
        await joinStream(streamId);
      } catch {}
      const { data: likeRow } = await supabase
        .from("live_likes")
        .select("id")
        .eq("stream_id", streamId)
        .eq("user_id", uid)
        .maybeSingle();
      setLiked(!!likeRow);
    }
    setLoading(false);
  }, [streamId]);

  useEffect(() => {
    load().catch(() => setLoading(false));
    return () => {
      leaveStream(streamId);
    };
  }, [load, streamId]);

  useEffect(() => {
    let cancelled = false;
    const FATAL_CODES = new Set([17, 110, 109, 101, 102, 103]);

    (async () => {
      if (initStartedRef.current) return;
      initStartedRef.current = true;

      let tokenResult;
      try {
        tokenResult = await fetchAgoraToken(streamId, "subscriber");
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
          console.log("[Agora] Viewer joined channel OK");
          setAgoraFatalError(null);
          setAgoraReady(true);
        },
        onUserJoined: (_connection, uid) => setRemoteUid(uid),
        onFirstRemoteVideoDecoded: (_connection, uid) => {
          setRemoteUid(uid);
        },
        onRemoteVideoStateChanged: (_connection, uid, state) => {
          // 2 = RemoteVideoStateDecoding
          if (state === 2) setRemoteUid(uid);
        },
        onUserOffline: (_connection, uid) => {
          setRemoteUid((prev) => (prev === uid ? null : prev));
        },
        onError: (errCode, msg) => {
          console.warn("[Agora Viewer Error]", errCode, msg);
          if (FATAL_CODES.has(errCode)) {
            const message = `${msg || "Failed to play live stream."} (code ${errCode})`;
            setAgoraFatalError(message);
            Alert.alert("Live Streaming Error", message);
          }
        },
      };
      handlerRef.current = handler;
      try {
        engineRef.current = createAudienceEngine(
          tokenResult.appId,
          streamId,
          tokenResult.token,
          tokenResult.uid,
          handler,
        );
      } catch (e: any) {
        console.warn("[Agora Viewer Init Error]", e);
        const message = e?.message ?? "Failed to join live stream.";
        setAgoraFatalError(message);
        Alert.alert("Live Streaming Error", message);
      }
    })();

    return () => {
      cancelled = true;
      destroyEngine(engineRef.current, handlerRef.current ?? undefined);
      engineRef.current = null;
      handlerRef.current = null;
      initStartedRef.current = false;
      setAgoraReady(false);
      setRemoteUid(null);
      setAgoraFatalError(null);
    };
  }, [streamId]);

  const [ended, setEnded] = useState(false);

  useEffect(() => {
    if (stream && !stream.is_live && !ended) {
      setEnded(true);
      leaveStream(streamId);
      Alert.alert("Stream Ended", "This live stream has ended.", [
        { text: "OK", onPress: onBack },
      ]);
    }
  }, [stream, ended, streamId, onBack]);

  useEffect(() => {
    const chatSub = subscribeLiveChat(streamId, (msg) => {
      setChats((prev) => [...prev.slice(-199), msg]);
      setTimeout(() => chatListRef.current?.scrollToEnd({ animated: true }), 100);
    });
    const streamSub = subscribeLiveStream(streamId, (update) => {
      setStream((prev) => (prev ? { ...prev, ...update } : prev));
      if (update.like_count !== undefined) setLikeCount(update.like_count);
    });

    return () => {
      supabase.removeChannel(chatSub);
      supabase.removeChannel(streamSub);
    };
  }, [streamId]);

  const handleSend = useCallback(async () => {
    const text = chatText.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      await sendChatMessage(streamId, text);
      setChatText("");
    } catch {
      Alert.alert("Error", "Failed to send message.");
    }
    setSending(false);
  }, [chatText, sending, streamId]);

  const handleLike = useCallback(async () => {
    if (!userId) return;
    const prev = liked;
    setLiked(!prev);
    setLikeCount((c) => (prev ? c - 1 : c + 1));
    try {
      const result = await toggleLike(streamId);
      setLiked(result.liked);
      setLikeCount(result.like_count);
    } catch {
      setLiked(prev);
      setLikeCount((c) => (prev ? c + 1 : c - 1));
    }
  }, [userId, liked, streamId]);

  const handleShare = useCallback(async () => {
    if (!stream) return;
    const name = stream.streamer?.display_name || stream.streamer?.username || "someone";
    try {
      await Share.share({
        message: `${name} is live on Gather: "${stream.title}" — Come watch!`,
      });
      await supabase
        .from("live_streams")
        .update({ share_count: (stream.share_count ?? 0) + 1 })
        .eq("id", streamId);
    } catch {}
  }, [stream, streamId]);

  if (loading) {
    return (
      <SafeAreaView style={st.root}>
        <StatusBar style="light" />
        <ActivityIndicator color={C.accent} style={{ flex: 1 }} />
      </SafeAreaView>
    );
  }

  if (!stream) {
    return (
      <SafeAreaView style={st.root}>
        <StatusBar style="light" />
        <View style={st.errorCenter}>
          <Ionicons name="alert-circle-outline" size={48} color={C.textMuted} />
          <Text style={st.errorTitle}>Stream not found</Text>
          <Pressable onPress={onBack} style={st.backBtnAlt}>
            <Text style={st.backBtnAltText}>Go back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const streamerName = stream.streamer?.display_name || stream.streamer?.username || "Streamer";

  return (
    <View style={st.root}>
      <StatusBar style="light" />

      {/* Full-screen video area */}
      <View style={st.videoArea}>
        {remoteUid ? (
          <RtcSurfaceView
            style={StyleSheet.absoluteFill}
            canvas={{
              uid: remoteUid,
              renderMode: RenderModeType.RenderModeHidden,
              sourceType: VideoSourceType.VideoSourceRemote,
            }}
          />
        ) : stream.thumbnail_url ? (
          <CachedImage source={{ uri: stream.thumbnail_url }} style={StyleSheet.absoluteFill} />
        ) : (
          <View style={st.videoPlaceholder}>
            <Feather name="play" size={32} color={C.accent} />
          </View>
        )}
        <LinearGradient colors={["rgba(0,0,0,0.5)", "transparent"]} style={st.topGrad} pointerEvents="none" />
        <LinearGradient colors={["transparent", C.bg]} style={st.bottomGrad} pointerEvents="none" />
        {!remoteUid && (
          <View style={st.waitingOverlay}>
            <ActivityIndicator size="small" color="#fff" />
            <Text style={st.waitingText}>
              {agoraFatalError
                ? "Live stream failed to connect."
                : agoraReady
                  ? "Waiting for host video..."
                  : "Connecting live stream..."}
            </Text>
          </View>
        )}

        {!stream.is_live && (
          <View style={st.endedOverlay}>
            <Text style={st.endedText}>Stream Ended</Text>
          </View>
        )}
      </View>

      {/* Top bar */}
      <View style={[st.topBar, { top: insets.top + 8 }]}>
        <Pressable onPress={onBack} style={st.topIcon}>
          <Ionicons name="chevron-back" size={20} color={C.textPrimary} />
        </Pressable>
        <View style={st.profilePill}>
          {stream.streamer?.avatar_url ? (
            <CachedImage source={{ uri: stream.streamer.avatar_url }} style={st.pillAvatar} />
          ) : (
            <View style={[st.pillAvatar, st.pillAvatarFallback]}>
              <Text style={st.pillAvatarText}>{streamerName.charAt(0).toUpperCase()}</Text>
            </View>
          )}
          <View>
            <Text style={st.pillName}>{streamerName}</Text>
            <View style={st.pillViewerRow}>
              <View style={st.liveDot} />
              <Text style={st.pillViewerText}>
                {formatViewers(stream.viewer_count)} watching
              </Text>
            </View>
          </View>
        </View>
        <Pressable style={st.topIcon}>
          <Feather name="more-horizontal" size={18} color={C.textPrimary} />
        </Pressable>
      </View>

      {/* Stream title + tags */}
      <View style={[st.streamMeta, { top: insets.top + 56 }]}>
        <Text style={st.streamTitle}>{stream.title}</Text>
        {stream.tags.length > 0 && (
          <View style={st.tagRow}>
            <View style={st.categoryChip}>
              <Text style={st.categoryText}>{stream.category}</Text>
            </View>
            {stream.tags.slice(0, 3).map((t) => (
              <View key={t} style={st.tagChip}>
                <Text style={st.tagText}>{t}</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* Chat + actions */}
      <KeyboardAvoidingView
        style={st.chatSection}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={0}
      >
        <FlatList
          ref={chatListRef}
          data={chats}
          keyExtractor={(m) => m.id}
          renderItem={({ item }) => (
            <View style={st.chatBubble}>
              <Text style={st.chatUser}>
                {item.user?.display_name || item.user?.username || "user"}
              </Text>
              <Text style={st.chatText}>{item.message}</Text>
            </View>
          )}
          style={st.chatList}
          contentContainerStyle={{ paddingVertical: 8, paddingHorizontal: S.screenPadding }}
          onContentSizeChange={() => chatListRef.current?.scrollToEnd({ animated: false })}
          initialNumToRender={30}
          maxToRenderPerBatch={20}
          windowSize={10}
        />

        {/* Bottom action row */}
        <View style={[st.bottomRow, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <TextInput
            style={st.chatInput}
            placeholder="Say something..."
            placeholderTextColor={C.textMuted}
            value={chatText}
            onChangeText={setChatText}
            onSubmitEditing={handleSend}
            returnKeyType="send"
            editable={!!userId}
          />
          <Pressable
            style={[st.actionBtn, liked && st.actionBtnLiked]}
            onPress={handleLike}
          >
            <Ionicons name={liked ? "heart" : "heart-outline"} size={20} color={liked ? C.live : C.textPrimary} />
            {likeCount > 0 && <Text style={st.actionCount}>{likeCount}</Text>}
          </Pressable>
          <Pressable style={st.actionBtn} onPress={handleShare}>
            <Ionicons name="share-outline" size={18} color={C.textPrimary} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  videoArea: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#000",
  },
  videoPlaceholder: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: "rgba(44,128,255,0.12)",
    justifyContent: "center",
    alignItems: "center",
  },
  waitingOverlay: {
    position: "absolute",
    left: 12,
    bottom: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(0,0,0,0.55)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  waitingText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  topGrad: { position: "absolute", top: 0, left: 0, right: 0, height: 100 },
  bottomGrad: { position: "absolute", bottom: 0, left: 0, right: 0, height: 60 },
  endedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
  },
  endedText: { color: C.textPrimary, fontSize: 18, fontWeight: "800" },
  topBar: {
    position: "absolute",
    left: S.screenPadding,
    right: S.screenPadding,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  topIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  profilePill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 999,
    paddingRight: 14,
    paddingVertical: 4,
    paddingLeft: 4,
    gap: 8,
  },
  pillAvatar: { width: 30, height: 30, borderRadius: 15 },
  pillAvatarFallback: {
    backgroundColor: C.muted,
    alignItems: "center",
    justifyContent: "center",
  },
  pillAvatarText: { color: C.textHero, fontSize: 12, fontWeight: "800" },
  pillName: { color: C.textHero, fontSize: 12, fontWeight: "800" },
  pillViewerRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 1 },
  liveDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: C.live },
  pillViewerText: { color: C.textSecondary, fontSize: 9, fontWeight: "600" },
  streamMeta: {
    position: "absolute",
    left: S.screenPadding,
    right: S.screenPadding,
    paddingHorizontal: S.screenPadding,
    paddingTop: 10,
    paddingBottom: 10,
    gap: 8,
    backgroundColor: "rgba(0,0,0,0.35)",
    borderRadius: 12,
    zIndex: 12,
  },
  streamTitle: { color: C.textPrimary, fontSize: 15, fontWeight: "700" },
  tagRow: { flexDirection: "row", gap: 6 },
  categoryChip: {
    backgroundColor: "rgba(44,128,255,0.15)",
    borderRadius: S.radiusBadge,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  categoryText: { color: C.textAccent, fontSize: 10, fontWeight: "700" },
  tagChip: {
    backgroundColor: C.cardAlt,
    borderRadius: S.radiusBadge,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  tagText: { color: C.textIcon, fontSize: 10, fontWeight: "700" },
  chatSection: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 12,
    maxHeight: "55%",
  },
  chatList: { maxHeight: 280 },
  chatBubble: {
    backgroundColor: C.surface,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 6,
    alignSelf: "flex-start",
    maxWidth: "85%",
  },
  chatUser: { color: C.textAccent, fontSize: 11, fontWeight: "700", marginBottom: 2 },
  chatText: { color: C.textPrimary, fontSize: 13, fontWeight: "500", lineHeight: 17 },
  bottomRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: S.screenPadding,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  chatInput: {
    flex: 1,
    backgroundColor: C.surface,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 14,
    height: 40,
    color: C.textPrimary,
    fontSize: 13,
    fontWeight: "500",
  },
  actionBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
    justifyContent: "center",
  },
  actionBtnLiked: {
    borderColor: "rgba(234,61,94,0.4)",
    backgroundColor: "rgba(234,61,94,0.1)",
  },
  actionCount: { color: C.textSecondary, fontSize: 8, fontWeight: "700", marginTop: -2 },
  errorCenter: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12 },
  errorTitle: { color: C.textPrimary, fontSize: 16, fontWeight: "700" },
  backBtnAlt: {
    backgroundColor: C.accent,
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    marginTop: 8,
  },
  backBtnAltText: { color: "#fff", fontWeight: "700", fontSize: 14 },
});
