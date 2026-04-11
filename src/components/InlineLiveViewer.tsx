import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  FlatList,
  Image,
  Keyboard,
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather, Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";

import { C, S } from "../theme";
import { AGORA_DISABLED } from "../lib/agoraFlag";
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
import {
  fetchActivePin,
  subscribePinUpdates,
  subscribeAlerts,
  subscribeLiveBids,
  placeLiveBid,
  tryFinalizeFlashPin,
  type LiveStreamPin,
  type LiveStreamAlert,
  type LiveAuctionBid,
} from "../data/liveCommerce";
import CachedImage from "./CachedImage";
import AgoraRemoteVideo from "./AgoraRemoteVideo";
import {
  createAudienceEngine,
  destroyEngine,
  fetchAgoraToken,
  type IRtcEngine,
  type IRtcEngineEventHandler,
} from "../lib/agora";
import { useAppNavigation } from "../navigation/NavigationContext";

const { height: SCREEN_H } = Dimensions.get("window");

function CountdownTimer({ endsAt, compact, onExpired }: { endsAt: string; compact?: boolean; onExpired?: () => void }) {
  const [remaining, setRemaining] = useState("");
  const firedRef = useRef(false);
  useEffect(() => {
    firedRef.current = false;
    const update = () => {
      const diff = Math.max(0, new Date(endsAt).getTime() - Date.now());
      const m = Math.floor(diff / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setRemaining(`${m}:${String(s).padStart(2, "0")}`);
      if (diff === 0 && !firedRef.current) {
        firedRef.current = true;
        onExpired?.();
      }
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [endsAt, onExpired]);

  const diff = Math.max(0, new Date(endsAt).getTime() - Date.now());
  const urgent = diff < 30000;

  return (
    <View style={[ctSt.wrap, compact && ctSt.wrapCompact]}>
      <Ionicons name="time-outline" size={compact ? 9 : 14} color={urgent ? C.live : C.textAccent} />
      <Text style={[compact ? ctSt.textCompact : ctSt.text, urgent && ctSt.textUrgent]}>{remaining}</Text>
    </View>
  );
}

const ctSt = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 6 },
  wrapCompact: { gap: 3, marginBottom: 0 },
  text: { color: C.textAccent, fontSize: 16, fontWeight: "800" },
  textCompact: { color: C.textAccent, fontSize: 10, fontWeight: "800" },
  textUrgent: { color: C.live },
});

function formatViewers(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

type Props = {
  streamId: string;
  isActive: boolean;
  onBack?: () => void;
  /** Pre-loaded stream data so the component can render immediately */
  initialStream?: LiveStream;
};

export default function InlineLiveViewer({
  streamId,
  isActive,
  onBack,
  initialStream,
}: Props) {
  const insets = useSafeAreaInsets();
  const chatListRef = useRef<FlatList>(null);
  const engineRef = useRef<IRtcEngine | null>(null);
  const handlerRef = useRef<IRtcEngineEventHandler | null>(null);
  const initStartedRef = useRef(false);

  const [stream, setStream] = useState<LiveStream | null>(initialStream ?? null);
  const [chats, setChats] = useState<ChatMessage[]>([]);
  const [chatText, setChatText] = useState("");
  const [sending, setSending] = useState(false);
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(initialStream?.like_count ?? 0);
  const [loading, setLoading] = useState(!initialStream);
  const [userId, setUserId] = useState<string | null>(null);
  const [remoteUid, setRemoteUid] = useState<number | null>(null);
  const [agoraReady, setAgoraReady] = useState(false);
  const [agoraFatalError, setAgoraFatalError] = useState<string | null>(null);
  const [ended, setEnded] = useState(false);

  // Commerce state
  const [activePin, setActivePin] = useState<LiveStreamPin | null>(null);
  const [alerts, setAlerts] = useState<LiveStreamAlert[]>([]);
  const [recentBids, setRecentBids] = useState<LiveAuctionBid[]>([]);
  const [bidAmount, setBidAmount] = useState("");
  const [bidding, setBidding] = useState(false);
  const [showBidOverlay, setShowBidOverlay] = useState(false);
  const [winnerOverlay, setWinnerOverlay] = useState<{
    winId: string; winnerName: string; amount: number; itemName: string; isMe: boolean;
  } | null>(null);
  const kbOffset = useRef(new Animated.Value(0)).current;
  const { push } = useAppNavigation();

  // Slide bid overlay up with keyboard
  useEffect(() => {
    const showEvt = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvt = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const onShow = Keyboard.addListener(showEvt, (e) => {
      Animated.timing(kbOffset, {
        toValue: -e.endCoordinates.height,
        duration: Platform.OS === "ios" ? e.duration : 250,
        useNativeDriver: true,
      }).start();
    });
    const onHide = Keyboard.addListener(hideEvt, () => {
      Animated.timing(kbOffset, {
        toValue: 0,
        duration: Platform.OS === "ios" ? 250 : 200,
        useNativeDriver: true,
      }).start();
    });
    return () => { onShow.remove(); onHide.remove(); };
  }, [kbOffset]);

  // ── Data load ──
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
      try { await joinStream(streamId); } catch {}
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
    if (!isActive) return;
    load().catch(() => setLoading(false));
    return () => { leaveStream(streamId); };
  }, [isActive, load, streamId]);

  // ── Agora lifecycle: only connect when isActive ──
  useEffect(() => {
    if (!isActive) {
      destroyEngine(engineRef.current, handlerRef.current ?? undefined);
      engineRef.current = null;
      handlerRef.current = null;
      initStartedRef.current = false;
      setAgoraReady(false);
      setRemoteUid(null);
      setAgoraFatalError(null);
      return;
    }

    if (AGORA_DISABLED) {
      setAgoraReady(true);
      setAgoraFatalError(null);
      return () => {
        setAgoraReady(false);
        setAgoraFatalError(null);
      };
    }

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
        setAgoraFatalError(e?.message ?? "Failed to get streaming credentials.");
        return;
      }
      if (cancelled) return;

      const handler: IRtcEngineEventHandler = {
        onJoinChannelSuccess: () => {
          setAgoraFatalError(null);
          setAgoraReady(true);
        },
        onUserJoined: (_conn: unknown, uid: number) => setRemoteUid(uid),
        onFirstRemoteVideoDecoded: (_conn: unknown, uid: number) => setRemoteUid(uid),
        onRemoteVideoStateChanged: (_conn: unknown, uid: number, state: number) => {
          if (state === 2) setRemoteUid(uid);
        },
        onUserOffline: (_conn: unknown, uid: number) => {
          setRemoteUid((prev) => (prev === uid ? null : prev));
        },
        onError: (errCode: number, msg: string) => {
          console.warn("[Agora Viewer Error]", errCode, msg);
          if (FATAL_CODES.has(errCode)) {
            setAgoraFatalError(`${msg || "Failed to play live stream."} (code ${errCode})`);
          }
        },
      };
      handlerRef.current = handler;
      try {
        engineRef.current = createAudienceEngine(
          tokenResult.appId, streamId, tokenResult.token, tokenResult.uid, handler,
        );
      } catch (e: any) {
        console.warn("[Agora Viewer Init Error]", e);
        setAgoraFatalError(e?.message ?? "Failed to join live stream.");
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
  }, [isActive, streamId]);

  // ── Stream ended detection ──
  useEffect(() => {
    if (stream && !stream.is_live && !ended) {
      setEnded(true);
      leaveStream(streamId);
    }
  }, [stream, ended, streamId]);

  // ── Realtime subscriptions (only when active) ──
  useEffect(() => {
    if (!isActive) return;
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
  }, [isActive, streamId]);

  // ── Commerce: pin + alerts ──
  useEffect(() => {
    if (!isActive) return;
    fetchActivePin(streamId).then(setActivePin).catch(() => {});

    const pinSub = subscribePinUpdates(streamId, (update) => {
      if (update.is_active === false) {
        setActivePin(null);
        setShowBidOverlay(false);
      } else {
        setActivePin((prev) => prev ? { ...prev, ...update } as LiveStreamPin : null);
        if (update.id && !activePin) {
          fetchActivePin(streamId).then(setActivePin).catch(() => {});
        }
      }
    });
    const alertSub = subscribeAlerts(streamId, (alert) => {
      setAlerts((prev) => [alert, ...prev].slice(0, 5));
      setTimeout(() => {
        setAlerts((prev) => prev.filter((a) => a.id !== alert.id));
      }, 4000);

      if (alert.alert_type === "auction_won") {
        const p = alert.payload as any;
        const isMe = p.winner_id === userId;
        setWinnerOverlay({
          winId: p.win_id ?? "",
          winnerName: isMe ? "You" : (p.winner_name || "Someone"),
          amount: p.amount ?? 0,
          itemName: p.flash_name ?? "Item",
          isMe,
        });
        setShowBidOverlay(false);
        setActivePin(null);
      }
    });
    return () => {
      supabase.removeChannel(pinSub);
      supabase.removeChannel(alertSub);
    };
  }, [isActive, streamId]);

  // Subscribe to live bids for the active flash pin
  useEffect(() => {
    if (!isActive || !activePin || activePin.pin_type !== "flash") {
      setRecentBids([]);
      return;
    }
    const bidSub = subscribeLiveBids(activePin.id, (bid) => {
      setRecentBids((prev) => [bid, ...prev].slice(0, 5));
      setActivePin((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          current_bid: Math.max(prev.current_bid ?? 0, bid.amount),
          bid_count: (prev.bid_count ?? 0) + 1,
          highest_bidder_id: bid.amount >= (prev.current_bid ?? 0) ? bid.bidder_id : prev.highest_bidder_id,
          highest_bidder: bid.amount >= (prev.current_bid ?? 0) ? bid.bidder : prev.highest_bidder,
        };
      });
    });
    return () => { supabase.removeChannel(bidSub); };
  }, [isActive, activePin?.id, activePin?.pin_type]);

  const handleFlashExpired = useCallback(async () => {
    if (!activePin) return;
    try {
      const result = await tryFinalizeFlashPin(activePin.id);
      if (result.status === "won" && result.winner_id && result.win_id) {
        const isMe = result.winner_id === userId;
        const winnerName = activePin.highest_bidder?.display_name
          || activePin.highest_bidder?.username || "Someone";
        setWinnerOverlay({
          winId: result.win_id,
          winnerName: isMe ? "You" : winnerName,
          amount: activePin.current_bid ?? 0,
          itemName: activePin.flash_name ?? "Flash Item",
          isMe,
        });
        setShowBidOverlay(false);
        setActivePin(null);
      }
    } catch {
      // cron will handle it
    }
  }, [activePin, userId]);

  const handleBid = useCallback(async () => {
    if (!activePin || bidding) return;
    const amount = parseFloat(bidAmount);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert("Invalid Bid", "Enter a valid amount.");
      return;
    }
    setBidding(true);
    try {
      const result = await placeLiveBid(activePin.id, amount);
      setActivePin((prev) => prev ? { ...prev, current_bid: result.current_bid, bid_count: result.bid_count, ends_at: result.ends_at } : null);
      setBidAmount("");
    } catch (e: any) {
      Alert.alert("Bid Failed", e.message);
    }
    setBidding(false);
  }, [activePin, bidAmount, bidding]);

  const quickBidAmount = activePin?.current_bid
    ? (activePin.bid_increment
        ? activePin.current_bid + activePin.bid_increment
        : Math.ceil(activePin.current_bid * 1.1))
    : activePin?.starting_price ?? 1;

  const handleQuickBid = useCallback(async () => {
    if (!activePin || bidding) return;
    setBidding(true);
    try {
      const result = await placeLiveBid(activePin.id, quickBidAmount);
      setActivePin((prev) => prev ? { ...prev, current_bid: result.current_bid, bid_count: result.bid_count, ends_at: result.ends_at } : null);
    } catch (e: any) {
      Alert.alert("Bid Failed", e.message);
    }
    setBidding(false);
  }, [activePin, bidding, quickBidAmount]);

  // ── Actions ──
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
      await Share.share({ message: `${name} is live on Evend: "${stream.title}" — Come watch!` });
      await supabase
        .from("live_streams")
        .update({ share_count: (stream.share_count ?? 0) + 1 })
        .eq("id", streamId);
    } catch {}
  }, [stream, streamId]);

  // ── Inactive thumbnail placeholder ──
  if (!isActive) {
    return (
      <View style={st.root}>
        {stream?.thumbnail_url ? (
          <CachedImage source={{ uri: stream.thumbnail_url }} style={StyleSheet.absoluteFill} />
        ) : (
          <View style={st.videoPlaceholder}>
            <Feather name="play" size={32} color={C.accent} />
          </View>
        )}
        <LinearGradient colors={["rgba(0,0,0,0.6)", "transparent", "rgba(0,0,0,0.6)"]} style={StyleSheet.absoluteFill} />
        {stream && (
          <View style={st.inactiveInfo}>
            <View style={st.liveBadge}>
              <View style={st.liveDot} />
              <Text style={st.liveBadgeText}>LIVE</Text>
            </View>
            <Text style={st.inactiveTitle} numberOfLines={1}>{stream.title}</Text>
            <Text style={st.inactiveSub}>
              {stream.streamer?.display_name || stream.streamer?.username || "Streamer"}
              {" · "}{formatViewers(stream.viewer_count)} watching
            </Text>
          </View>
        )}
      </View>
    );
  }

  // ── Loading state ──
  if (loading) {
    return (
      <View style={st.root}>
        <StatusBar style="light" />
        <ActivityIndicator color={C.accent} style={{ flex: 1 }} />
      </View>
    );
  }

  if (!stream) {
    return (
      <View style={st.root}>
        <View style={st.errorCenter}>
          <Ionicons name="alert-circle-outline" size={48} color={C.textMuted} />
          <Text style={st.errorTitle}>Stream not found</Text>
        </View>
      </View>
    );
  }

  const streamerName = stream.streamer?.display_name || stream.streamer?.username || "Streamer";

  return (
    <Pressable style={st.root} onPress={Keyboard.dismiss}>
      <StatusBar style="light" />

      {/* Full-screen video */}
      <View style={st.videoArea}>
        {remoteUid ? (
          <AgoraRemoteVideo remoteUid={remoteUid} />
        ) : stream.thumbnail_url ? (
          <CachedImage source={{ uri: stream.thumbnail_url }} style={StyleSheet.absoluteFill} />
        ) : (
          <View style={st.videoPlaceholder}>
            <Feather name="play" size={32} color={C.accent} />
          </View>
        )}
        <LinearGradient colors={["rgba(0,0,0,0.5)", "transparent"]} style={st.topGrad} pointerEvents="none" />
        <LinearGradient colors={["transparent", "rgba(0,0,0,0.7)"]} style={st.bottomGrad} pointerEvents="none" />

        {!AGORA_DISABLED && !remoteUid && !ended && (
          <View style={st.waitingOverlay}>
            <ActivityIndicator size="small" color="#fff" />
            <Text style={st.waitingText}>
              {agoraFatalError ? "Live stream failed to connect."
                : agoraReady ? "Waiting for host video..."
                : "Connecting live stream..."}
            </Text>
          </View>
        )}
        {ended && (
          <View style={st.endedOverlay}>
            <Text style={st.endedText}>Stream Ended</Text>
          </View>
        )}
      </View>

      {/* Top bar */}
      <View style={[st.topBar, { top: insets.top + 8 }]}>
        {onBack && (
          <Pressable onPress={onBack} style={st.topIcon}>
            <Ionicons name="chevron-back" size={20} color={C.textPrimary} />
          </Pressable>
        )}
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
              <Text style={st.pillViewerText}>{formatViewers(stream.viewer_count)} watching</Text>
            </View>
          </View>
        </View>
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

      {/* Alert Toasts */}
      {alerts.length > 0 && (
        <View style={st.alertStack}>
          {alerts.map((alert) => (
            <View key={alert.id} style={st.alertToast}>
              <Ionicons
                name={alert.alert_type === "bid" ? "flash" : alert.alert_type === "purchase" ? "bag-check" : alert.alert_type === "auction_won" ? "trophy" : "pricetag"}
                size={14}
                color={alert.alert_type === "bid" ? "#FFD700" : alert.alert_type === "purchase" ? C.success : C.accent}
              />
              <Text style={st.alertText}>
                {alert.alert_type === "bid"
                  ? `${(alert.payload as any).bidder_name || "Someone"} bid RM${(alert.payload as any).amount}`
                  : alert.alert_type === "purchase"
                  ? "Someone just purchased!"
                  : alert.alert_type === "auction_won"
                  ? `${(alert.payload as any).winner_name || "Someone"} won ${(alert.payload as any).flash_name || "item"} for RM${(alert.payload as any).amount ?? 0}!`
                  : "Product updated"}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Pinned Product Card */}
      {activePin && (() => {
        const isFlash = activePin.pin_type === "flash";
        const imgUri = isFlash
          ? activePin.flash_image_url
          : activePin.listing?.images?.[0] ?? null;
        const name = isFlash
          ? activePin.flash_name ?? "Flash Item"
          : activePin.listing?.card_name ?? "Product";
        const category = isFlash ? null : activePin.listing?.category;

        return (
          <Pressable
            style={[st.pinnedCard, showBidOverlay && { bottom: 230 }]}
            onPress={() => {
              if (isFlash) {
                setShowBidOverlay(!showBidOverlay);
              } else if (activePin.listing_id) {
                push({ type: "LISTING_DETAIL", listingId: activePin.listing_id });
              }
            }}
          >
            {/* Thumbnail */}
            {imgUri ? (
              <CachedImage source={{ uri: imgUri }} style={st.pinnedThumb} />
            ) : (
              <View style={[st.pinnedThumb, st.pinnedThumbFallback]}>
                <Ionicons name={isFlash ? "flash" : "cube-outline"} size={20} color={C.textMuted} />
              </View>
            )}

            {/* Info */}
            <View style={st.pinnedInfo}>
              <View style={st.pinnedTopRow}>
                <View style={[st.pinnedBadge, isFlash && st.pinnedBadgeFlash]}>
                  <Ionicons
                    name={isFlash ? "flash" : "pricetag"}
                    size={8}
                    color="#fff"
                    style={{ marginRight: 3 }}
                  />
                  <Text style={st.pinnedBadgeText}>
                    {isFlash ? "FLASH AUCTION" : "BUY NOW"}
                  </Text>
                </View>
                {isFlash && activePin.ends_at && (
                  <CountdownTimer endsAt={activePin.ends_at} compact onExpired={handleFlashExpired} />
                )}
              </View>
              <Text style={st.pinnedName} numberOfLines={1}>{name}</Text>
              {category && (
                <Text style={st.pinnedCategory} numberOfLines={1}>{category}</Text>
              )}
              <View style={st.pinnedPriceRow}>
                {isFlash ? (
                  <>
                    <Text style={st.pinnedPriceBid}>
                      RM{activePin.current_bid?.toFixed(0) ?? "0"}
                    </Text>
                    <Text style={st.pinnedBidCount}>{activePin.bid_count} bids</Text>
                  </>
                ) : (
                  <Text style={st.pinnedPriceBuy}>
                    RM{activePin.listing?.price?.toFixed(2)}
                  </Text>
                )}
              </View>
              {isFlash && activePin.highest_bidder && (
                <View style={st.pinnedBidderRow}>
                  <Ionicons name="trophy" size={10} color="#FFD700" />
                  <Text style={st.pinnedBidderName} numberOfLines={1}>
                    {activePin.highest_bidder.display_name || activePin.highest_bidder.username || "Bidder"}
                  </Text>
                  {activePin.reserve_price != null && (
                    <Text style={[
                      st.pinnedReserve,
                      (activePin.current_bid ?? 0) >= activePin.reserve_price && st.pinnedReserveMet,
                    ]}>
                      {(activePin.current_bid ?? 0) >= activePin.reserve_price ? "Reserve met" : "No reserve"}
                    </Text>
                  )}
                </View>
              )}
            </View>

            {/* CTA */}
            <View style={[st.pinnedCta, isFlash && st.pinnedCtaFlash]}>
              <Text style={st.pinnedCtaText}>{isFlash ? "BID" : "BUY"}</Text>
              <Ionicons
                name={isFlash ? "arrow-up-circle" : "cart"}
                size={14}
                color="#fff"
              />
            </View>
          </Pressable>
        );
      })()}

      {/* Bid Overlay */}
      {showBidOverlay && activePin?.pin_type === "flash" && (
        <Animated.View style={[st.bidOverlay, { transform: [{ translateY: kbOffset }] }]}>
          <View style={st.bidHeader}>
            <Text style={st.bidTitle}>Place Your Bid</Text>
            <Pressable onPress={() => setShowBidOverlay(false)}>
              <Ionicons name="close" size={20} color={C.textMuted} />
            </Pressable>
          </View>

          {/* Product being auctioned */}
          <View style={st.bidProductRow}>
            {activePin.flash_image_url ? (
              <CachedImage source={{ uri: activePin.flash_image_url }} style={st.bidProductImg} />
            ) : (
              <View style={[st.bidProductImg, st.bidProductImgFallback]}>
                <Ionicons name="flash" size={16} color={C.textMuted} />
              </View>
            )}
            <View style={st.bidProductInfo}>
              <Text style={st.bidProductName} numberOfLines={1}>
                {activePin.flash_name ?? "Flash Item"}
              </Text>
              <Text style={st.bidProductStart}>
                Starting RM{activePin.starting_price?.toFixed(0) ?? "0"}
                {activePin.bid_increment ? ` · +RM${activePin.bid_increment.toFixed(0)}/bid` : ""}
              </Text>
              {activePin.reserve_price != null && (
                <Text style={[
                  st.bidProductReserve,
                  (activePin.current_bid ?? 0) >= activePin.reserve_price && st.bidProductReserveMet,
                ]}>
                  {(activePin.current_bid ?? 0) >= activePin.reserve_price ? "Reserve met" : "Reserve not met"}
                </Text>
              )}
            </View>
            {activePin.ends_at && (
              <CountdownTimer endsAt={activePin.ends_at} compact />
            )}
          </View>

          <View style={st.bidCurrentRow}>
            <View>
              <Text style={st.bidCurrentLabel}>Current Bid</Text>
              {activePin.highest_bidder && (
                <View style={st.bidLeaderRow}>
                  <Ionicons name="trophy" size={11} color="#FFD700" />
                  <Text style={st.bidLeaderName} numberOfLines={1}>
                    {activePin.highest_bidder.display_name || activePin.highest_bidder.username || "Bidder"}
                  </Text>
                </View>
              )}
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={st.bidCurrentValue}>RM{activePin.current_bid?.toFixed(2) ?? "0.00"}</Text>
              <Text style={st.bidCountLabel}>{activePin.bid_count} bids</Text>
            </View>
          </View>

          {recentBids.length > 0 && (
            <View style={st.bidFeed}>
              {recentBids.slice(0, 3).map((b) => (
                <View key={b.id} style={st.bidFeedItem}>
                  <Ionicons name="flash" size={10} color="#FFD700" />
                  <Text style={st.bidFeedName} numberOfLines={1}>
                    {b.bidder?.display_name || b.bidder?.username || "Someone"}
                  </Text>
                  <Text style={st.bidFeedAmount}>RM{b.amount.toFixed(0)}</Text>
                </View>
              ))}
            </View>
          )}
          <View style={st.bidInputRow}>
            <TextInput
              style={st.bidInput}
              placeholder={`Min RM${(quickBidAmount).toFixed(0)}`}
              placeholderTextColor={C.textMuted}
              keyboardType="numeric"
              value={bidAmount}
              onChangeText={setBidAmount}
            />
            <Pressable style={st.bidSubmitBtn} onPress={handleBid} disabled={bidding}>
              {bidding ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={st.bidSubmitText}>BID</Text>
              )}
            </Pressable>
          </View>
          <Pressable style={st.quickBidBtn} onPress={handleQuickBid} disabled={bidding}>
            <Ionicons name="flash" size={16} color="#FFD700" />
            <Text style={st.quickBidText}>Quick Bid RM{quickBidAmount.toFixed(0)}</Text>
          </Pressable>
        </Animated.View>
      )}

      {/* Winner Overlay */}
      {winnerOverlay && (
        <View style={st.winOverlay}>
          <View style={st.winCard}>
            <Ionicons name="trophy" size={36} color="#FFD700" />
            <Text style={st.winTitle}>
              {winnerOverlay.isMe ? "You Won!" : `${winnerOverlay.winnerName} Won!`}
            </Text>
            <Text style={st.winItem}>{winnerOverlay.itemName}</Text>
            <Text style={st.winAmount}>RM{winnerOverlay.amount.toFixed(0)}</Text>
            {winnerOverlay.isMe && winnerOverlay.winId ? (
              <Pressable
                style={st.winPayBtn}
                onPress={() => {
                  push({ type: "AUCTION_CHECKOUT", winId: winnerOverlay.winId });
                  setWinnerOverlay(null);
                }}
              >
                <Text style={st.winPayBtnText}>Pay Now</Text>
                <Ionicons name="arrow-forward" size={16} color="#fff" />
              </Pressable>
            ) : null}
            <Pressable onPress={() => setWinnerOverlay(null)} style={st.winDismiss}>
              <Text style={st.winDismissText}>{winnerOverlay.isMe ? "Pay Later" : "Dismiss"}</Text>
            </Pressable>
          </View>
        </View>
      )}

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
              <Text style={st.chatUser}>{item.user?.display_name || item.user?.username || "user"}</Text>
              <Text style={st.chatMsg}>{item.message}</Text>
            </View>
          )}
          style={st.chatList}
          contentContainerStyle={{ paddingVertical: 8, paddingHorizontal: S.screenPadding }}
          onContentSizeChange={() => chatListRef.current?.scrollToEnd({ animated: false })}
          initialNumToRender={30}
          maxToRenderPerBatch={20}
          windowSize={10}
        />

        <View style={[st.bottomRow, { paddingBottom: insets.bottom + S.tabBarPaddingTop + S.tabBarPaddingBottom + 20 }]}>
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
          <Pressable style={[st.actionBtn, liked && st.actionBtnLiked]} onPress={handleLike}>
            <Ionicons name={liked ? "heart" : "heart-outline"} size={20} color={liked ? C.live : C.textPrimary} />
            {likeCount > 0 && <Text style={st.actionCount}>{likeCount}</Text>}
          </Pressable>
          <Pressable style={st.actionBtn} onPress={handleShare}>
            <Ionicons name="share-outline" size={18} color={C.textPrimary} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Pressable>
  );
}

const st = StyleSheet.create({
  root: { width: "100%", height: SCREEN_H, backgroundColor: "#000" },
  videoArea: { ...StyleSheet.absoluteFillObject, backgroundColor: "#000" },
  videoPlaceholder: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
  },
  topGrad: { position: "absolute", top: 0, left: 0, right: 0, height: 120 },
  bottomGrad: { position: "absolute", bottom: 0, left: 0, right: 0, height: 300 },
  waitingOverlay: {
    position: "absolute", left: 12, bottom: 12,
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "rgba(0,0,0,0.55)", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999,
  },
  waitingText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  endedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "center", alignItems: "center",
  },
  endedText: { color: C.textPrimary, fontSize: 18, fontWeight: "800" },

  topBar: {
    position: "absolute", left: S.screenPadding, right: S.screenPadding,
    flexDirection: "row", alignItems: "center", gap: 10, zIndex: 20,
  },
  topIcon: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center",
  },
  profilePill: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.5)", borderRadius: 999,
    paddingRight: 14, paddingVertical: 4, paddingLeft: 4, gap: 8,
  },
  pillAvatar: { width: 30, height: 30, borderRadius: 15 },
  pillAvatarFallback: { backgroundColor: C.muted, alignItems: "center", justifyContent: "center" },
  pillAvatarText: { color: C.textHero, fontSize: 12, fontWeight: "800" },
  pillName: { color: C.textHero, fontSize: 12, fontWeight: "800" },
  pillViewerRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 1 },
  liveDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: C.live },
  pillViewerText: { color: C.textSecondary, fontSize: 9, fontWeight: "600" },

  streamMeta: {
    position: "absolute", left: S.screenPadding, right: S.screenPadding,
    paddingHorizontal: S.screenPadding, paddingTop: 10, paddingBottom: 10,
    gap: 8, backgroundColor: "rgba(0,0,0,0.35)", borderRadius: 12, zIndex: 12,
  },
  streamTitle: { color: C.textPrimary, fontSize: 15, fontWeight: "700" },
  tagRow: { flexDirection: "row", gap: 6 },
  categoryChip: { backgroundColor: "rgba(44,128,255,0.15)", borderRadius: S.radiusBadge, paddingHorizontal: 10, paddingVertical: 3 },
  categoryText: { color: C.textAccent, fontSize: 10, fontWeight: "700" },
  tagChip: { backgroundColor: C.cardAlt, borderRadius: S.radiusBadge, paddingHorizontal: 10, paddingVertical: 3 },
  tagText: { color: C.textIcon, fontSize: 10, fontWeight: "700" },

  chatSection: { position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 12, maxHeight: "55%" },
  chatList: { maxHeight: 280 },
  chatBubble: {
    backgroundColor: "rgba(10,14,22,0.6)", borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 8, marginBottom: 6,
    alignSelf: "flex-start", maxWidth: "85%",
  },
  chatUser: { color: C.textAccent, fontSize: 11, fontWeight: "700", marginBottom: 2 },
  chatMsg: { color: C.textPrimary, fontSize: 13, fontWeight: "500", lineHeight: 17 },
  bottomRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: S.screenPadding, paddingTop: 8,
    borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  chatInput: {
    flex: 1, backgroundColor: "rgba(17,24,34,0.75)", borderRadius: 999,
    borderWidth: 1, borderColor: "rgba(21,34,58,0.6)",
    paddingHorizontal: 14, height: 40, color: C.textPrimary, fontSize: 13, fontWeight: "500",
  },
  actionBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: "rgba(17,24,34,0.75)", borderWidth: 1, borderColor: "rgba(21,34,58,0.6)",
    alignItems: "center", justifyContent: "center",
  },
  actionBtnLiked: { borderColor: "rgba(234,61,94,0.4)", backgroundColor: "rgba(234,61,94,0.1)" },
  actionCount: { color: C.textSecondary, fontSize: 8, fontWeight: "700", marginTop: -2 },

  // Inactive thumbnail state
  inactiveInfo: {
    position: "absolute", bottom: 80, left: S.screenPadding, right: S.screenPadding,
    gap: 6,
  },
  liveBadge: {
    flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start",
    backgroundColor: "rgba(234,61,94,0.9)", borderRadius: 4,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  liveBadgeText: { color: "#fff", fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  inactiveTitle: { color: C.textPrimary, fontSize: 16, fontWeight: "700" },
  inactiveSub: { color: C.textSecondary, fontSize: 12, fontWeight: "600" },

  errorCenter: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12 },
  errorTitle: { color: C.textPrimary, fontSize: 16, fontWeight: "700" },

  // Alert toasts
  alertStack: {
    position: "absolute", top: 120, right: S.screenPadding,
    gap: 6, zIndex: 25, alignItems: "flex-end",
  },
  alertToast: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "rgba(0,0,0,0.75)", borderRadius: 999,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  alertText: { color: C.textPrimary, fontSize: 11, fontWeight: "700" },

  // Pinned product card
  pinnedCard: {
    position: "absolute", left: S.screenPadding, right: S.screenPadding,
    bottom: 160, zIndex: 20,
    flexDirection: "row", alignItems: "stretch",
    backgroundColor: "rgba(10,14,22,0.88)", borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.08)",
  },
  pinnedThumb: {
    width: 72, height: undefined,
    aspectRatio: undefined,
    minHeight: 72,
  },
  pinnedThumbFallback: {
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center", justifyContent: "center",
  },
  pinnedInfo: {
    flex: 1, paddingVertical: 8, paddingHorizontal: 10, gap: 2,
    justifyContent: "center",
  },
  pinnedTopRow: {
    flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 1,
  },
  pinnedBadge: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: C.accent, borderRadius: 4,
    paddingHorizontal: 5, paddingVertical: 2,
  },
  pinnedBadgeFlash: { backgroundColor: C.live },
  pinnedBadgeText: {
    color: "#fff", fontSize: 8, fontWeight: "800", letterSpacing: 0.5,
  },
  pinnedName: {
    color: "#fff", fontSize: 14, fontWeight: "700",
  },
  pinnedCategory: {
    color: "rgba(255,255,255,0.45)", fontSize: 10, fontWeight: "600",
  },
  pinnedPriceRow: {
    flexDirection: "row", alignItems: "baseline", gap: 6, marginTop: 1,
  },
  pinnedPriceBuy: {
    color: C.textAccent, fontSize: 15, fontWeight: "800",
  },
  pinnedPriceBid: {
    color: "#FFD166", fontSize: 15, fontWeight: "800",
  },
  pinnedBidCount: {
    color: "rgba(255,255,255,0.5)", fontSize: 11, fontWeight: "600",
  },
  pinnedBidderRow: {
    flexDirection: "row", alignItems: "center", gap: 4, marginTop: 1,
  },
  pinnedBidderName: {
    color: "#FFD700", fontSize: 10, fontWeight: "700", flexShrink: 1,
  },
  pinnedReserve: { color: C.live, fontSize: 9, fontWeight: "700", marginLeft: 4 },
  pinnedReserveMet: { color: C.success },
  pinnedCta: {
    backgroundColor: C.accent, width: 52,
    alignItems: "center", justifyContent: "center", gap: 3,
  },
  pinnedCtaFlash: { backgroundColor: C.live },
  pinnedCtaText: { color: "#fff", fontSize: 11, fontWeight: "800" },

  // Bid overlay
  bidOverlay: {
    position: "absolute", left: S.screenPadding, right: S.screenPadding,
    bottom: 220, zIndex: 22,
    backgroundColor: "rgba(10,14,22,0.92)", borderRadius: 16,
    padding: 14, gap: 6,
    borderWidth: 1, borderColor: "rgba(44,128,255,0.15)",
  },
  bidHeader: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    marginBottom: 4,
  },
  bidTitle: { color: C.textPrimary, fontSize: 14, fontWeight: "800" },
  bidCurrentRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  bidProductRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 10,
    padding: 8, marginBottom: 2,
  },
  bidProductImg: { width: 44, height: 44, borderRadius: 8 },
  bidProductImgFallback: {
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center", justifyContent: "center",
  },
  bidProductInfo: { flex: 1, gap: 1 },
  bidProductName: { color: "#fff", fontSize: 13, fontWeight: "700" },
  bidProductStart: { color: C.textSecondary, fontSize: 10, fontWeight: "600" },
  bidProductReserve: { color: C.live, fontSize: 9, fontWeight: "700", marginTop: 1 },
  bidProductReserveMet: { color: C.success },
  bidCurrentLabel: { color: C.textSecondary, fontSize: 11, fontWeight: "600" },
  bidCurrentValue: { color: C.textPrimary, fontSize: 18, fontWeight: "800" },
  bidCountLabel: { color: C.textSecondary, fontSize: 10, fontWeight: "600", marginTop: 1 },
  bidLeaderRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 3 },
  bidLeaderName: { color: "#FFD700", fontSize: 12, fontWeight: "700", maxWidth: 140 },
  bidFeed: {
    backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 6, gap: 4,
  },
  bidFeedItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  bidFeedName: { color: C.textSecondary, fontSize: 11, fontWeight: "600", flex: 1 },
  bidFeedAmount: { color: "#FFD700", fontSize: 11, fontWeight: "800" },
  bidInputRow: { flexDirection: "row", gap: 8 },
  bidInput: {
    flex: 1, backgroundColor: "rgba(17,24,34,0.75)", borderRadius: 10,
    borderWidth: 1, borderColor: "rgba(21,34,58,0.6)",
    paddingHorizontal: 12, height: 40, color: C.textPrimary, fontSize: 14, fontWeight: "600",
  },
  bidSubmitBtn: {
    backgroundColor: C.accent, borderRadius: 10,
    paddingHorizontal: 20, height: 40,
    alignItems: "center", justifyContent: "center",
  },
  bidSubmitText: { color: "#fff", fontSize: 13, fontWeight: "800" },
  quickBidBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, backgroundColor: "rgba(255,215,0,0.12)", borderRadius: 10,
    paddingVertical: 10, borderWidth: 1, borderColor: "rgba(255,215,0,0.25)",
  },
  quickBidText: { color: "#FFD700", fontSize: 12, fontWeight: "800" },

  // Winner overlay
  winOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.75)",
    justifyContent: "center", alignItems: "center",
    zIndex: 50,
  },
  winCard: {
    backgroundColor: "rgba(15,20,30,0.95)", borderRadius: 20,
    padding: 28, alignItems: "center", gap: 10,
    borderWidth: 1, borderColor: "rgba(255,215,0,0.3)",
    width: "80%", maxWidth: 320,
  },
  winTitle: { color: "#FFD700", fontSize: 22, fontWeight: "800" },
  winItem: { color: C.textPrimary, fontSize: 15, fontWeight: "700", textAlign: "center" },
  winAmount: { color: C.textAccent, fontSize: 20, fontWeight: "800" },
  winPayBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, backgroundColor: C.success, borderRadius: 12,
    paddingVertical: 12, paddingHorizontal: 24, marginTop: 6, width: "100%",
  },
  winPayBtnText: { color: "#fff", fontSize: 15, fontWeight: "800" },
  winDismiss: { marginTop: 4, paddingVertical: 6 },
  winDismissText: { color: C.textSecondary, fontSize: 13, fontWeight: "600" },
});
