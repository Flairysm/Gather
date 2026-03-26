import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
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
import CachedImage from "../components/CachedImage";
import { C, S } from "../theme";
import {
  loadConversations,
  hideConversationForUser,
  setConversationFavorite,
  subscribeToConversations,
  formatTimestamp,
  type Conversation,
} from "../data/messages";
import { useAppNavigation } from "../navigation/NavigationContext";
import { supabase } from "../lib/supabase";
import { useReconnect } from "../hooks/useReconnect";

type Props = { onBack: () => void };

const SWIPE_THRESHOLD = 50;
const ACTION_WIDTH = 160;

export default function MessagesScreen({ onBack }: Props) {
  const { push, stack } = useAppNavigation();
  const [convos, setConvos] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [userId, setUserId] = useState<string | null>(null);

  const fetchConversations = useCallback(async (uid: string) => {
    try {
      const data = await loadConversations(uid);
      setConvos(data);
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let channel: ReturnType<typeof subscribeToConversations> | null = null;

    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }
      setUserId(user.id);
      await fetchConversations(user.id);

      channel = subscribeToConversations(user.id, () => {
        fetchConversations(user.id);
      });
    })();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [fetchConversations]);

  const hasChatOverlay = stack.some((s) => s.type === "CHAT");
  const prevOverlay = useRef(hasChatOverlay);
  useEffect(() => {
    if (prevOverlay.current && !hasChatOverlay && userId) {
      fetchConversations(userId);
    }
    prevOverlay.current = hasChatOverlay;
  }, [hasChatOverlay, userId, fetchConversations]);

  useReconnect(() => {
    if (userId) fetchConversations(userId);
  });

  const filtered = search.trim()
    ? convos.filter(
        (c) =>
          (c.otherUser.username ?? "")
            .toLowerCase()
            .includes(search.toLowerCase()) ||
          (c.otherUser.displayName ?? "")
            .toLowerCase()
            .includes(search.toLowerCase()) ||
          (c.topic ?? "").toLowerCase().includes(search.toLowerCase()),
      )
    : convos;

  async function handleToggleFavorite(conv: Conversation) {
    if (!userId) return;
    try {
      await setConversationFavorite(userId, conv.id, !conv.isFavorite);
      setConvos((prev) =>
        prev.map((c) =>
          c.id === conv.id ? { ...c, isFavorite: !c.isFavorite } : c,
        ),
      );
    } catch {
      /* silent */
    }
  }

  function handleDelete(conv: Conversation) {
    if (!userId) return;
    Alert.alert("Delete chat?", "This chat will be removed from your list.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await hideConversationForUser(userId, conv.id);
            setConvos((prev) => prev.filter((c) => c.id !== conv.id));
          } catch {
            /* silent */
          }
        },
      },
    ]);
  }

  const unreadCount = convos.filter((c) => c.isUnread).length;

  return (
    <SafeAreaView style={st.safe}>
      <StatusBar style="light" />

      {/* Header */}
      <View style={st.header}>
        <Pressable style={st.backBtn} onPress={onBack}>
          <Feather name="arrow-left" size={20} color={C.textPrimary} />
        </Pressable>
        <View style={st.headerCenter}>
          <Text style={st.title}>Chats</Text>
          {unreadCount > 0 && (
            <View style={st.headerBadge}>
              <Text style={st.headerBadgeText}>{unreadCount}</Text>
            </View>
          )}
        </View>
        <View style={{ width: 36 }} />
      </View>

      {/* Search */}
      <View style={st.searchWrap}>
        <View style={st.searchBar}>
          <Feather name="search" size={15} color={C.textMuted} />
          <TextInput
            style={st.searchInput}
            placeholder="Search"
            placeholderTextColor={C.textMuted}
            value={search}
            onChangeText={setSearch}
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch("")} hitSlop={8}>
              <Feather name="x-circle" size={14} color={C.textMuted} />
            </Pressable>
          )}
        </View>
      </View>

      {loading ? (
        <View style={st.center}>
          <ActivityIndicator size="large" color={C.accent} />
        </View>
      ) : filtered.length === 0 ? (
        <View style={st.center}>
          <Ionicons
            name="chatbubbles-outline"
            size={48}
            color={C.textMuted}
          />
          <Text style={st.emptyTitle}>
            {search.trim() ? "No matches" : "No messages yet"}
          </Text>
          <Text style={st.emptySub}>
            {search.trim()
              ? "Try a different search term"
              : "Start a conversation from a listing"}
          </Text>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={st.list}
        >
          {filtered.map((conv) => (
            <SwipeableRow
              key={conv.id}
              conv={conv}
              onFavorite={() => handleToggleFavorite(conv)}
              onDelete={() => handleDelete(conv)}
              onPress={() => push({ type: "CHAT", conversationId: conv.id })}
            />
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

/* ── Swipeable conversation row (swipe LEFT to reveal actions on RIGHT) ── */

function SwipeableRow({
  conv,
  onFavorite,
  onDelete,
  onPress,
}: {
  conv: Conversation;
  onFavorite: () => void;
  onDelete: () => void;
  onPress: () => void;
}) {
  const translateX = useRef(new Animated.Value(0)).current;
  const isOpen = useRef(false);

  function snapTo(val: number) {
    isOpen.current = val !== 0;
    Animated.spring(translateX, {
      toValue: val,
      useNativeDriver: true,
      tension: 100,
      friction: 14,
    }).start();
  }

  const panRef = useRef({ startX: 0, moving: false });

  function onTouchStart(e: any) {
    panRef.current.startX = e.nativeEvent.pageX;
    panRef.current.moving = false;
  }

  function onTouchMove(e: any) {
    const dx = e.nativeEvent.pageX - panRef.current.startX;
    if (!panRef.current.moving && Math.abs(dx) > 8) {
      panRef.current.moving = true;
    }
    if (panRef.current.moving) {
      const base = isOpen.current ? -ACTION_WIDTH : 0;
      const clamped = Math.max(-ACTION_WIDTH, Math.min(0, base + dx));
      translateX.setValue(clamped);
    }
  }

  function onTouchEnd(e: any) {
    if (!panRef.current.moving) return;
    const dx = e.nativeEvent.pageX - panRef.current.startX;
    if (isOpen.current) {
      snapTo(dx > 30 ? 0 : -ACTION_WIDTH);
    } else {
      snapTo(dx < -SWIPE_THRESHOLD ? -ACTION_WIDTH : 0);
    }
  }

  function handlePress() {
    if (panRef.current.moving) return;
    if (isOpen.current) {
      snapTo(0);
      return;
    }
    onPress();
  }

  const displayName =
    conv.otherUser.displayName ?? conv.otherUser.username ?? "User";
  const initial = displayName.charAt(0).toUpperCase();
  const thumbUrl = conv.listingImage ?? conv.otherUser.avatarUrl;
  const isUnread = conv.isUnread;

  return (
    <View style={st.swipeContainer}>
      {/* Actions on the RIGHT, revealed when row slides left */}
      <View style={st.actionsRow}>
        <Pressable
          style={[st.actionBtn, st.favAction]}
          onPress={() => {
            onFavorite();
            snapTo(0);
          }}
        >
          <Ionicons
            name={conv.isFavorite ? "star" : "star-outline"}
            size={20}
            color="#fff"
          />
          <Text style={st.actionLabel}>
            {conv.isFavorite ? "Unfavorite" : "Favorite"}
          </Text>
        </Pressable>
        <Pressable
          style={[st.actionBtn, st.delAction]}
          onPress={() => {
            onDelete();
            snapTo(0);
          }}
        >
          <Ionicons name="trash-outline" size={20} color="#fff" />
          <Text style={st.actionLabel}>Delete</Text>
        </Pressable>
      </View>

      {/* Foreground row — slides left */}
      <Animated.View
        style={[st.rowOuter, { transform: [{ translateX }] }]}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <Pressable style={st.row} onPress={handlePress}>
          {/* Product / listing image as avatar */}
          <View style={st.avatarWrap}>
            {thumbUrl ? (
              <CachedImage
                source={{ uri: thumbUrl }}
                style={[st.avatarImg, isUnread && st.avatarImgUnread]}
              />
            ) : (
              <View style={[st.avatar, isUnread && st.avatarUnread]}>
                <Text style={st.avatarLetter}>{initial}</Text>
              </View>
            )}
            {conv.isFavorite && (
              <View style={st.favBadge}>
                <Ionicons name="star" size={8} color="#fff" />
              </View>
            )}
          </View>

          {/* Content */}
          <View style={st.content}>
            <View style={st.topRow}>
              <Text
                style={[st.name, isUnread && st.nameUnread]}
                numberOfLines={1}
              >
                {displayName}
                {conv.topic ? ` · ${conv.topic}` : ""}
              </Text>
              <Text style={[st.time, isUnread && st.timeUnread]}>
                {conv.lastMessageAt
                  ? formatTimestamp(conv.lastMessageAt)
                  : ""}
              </Text>
            </View>
            <View style={st.bottomRow}>
              <Text
                style={[st.preview, isUnread && st.previewUnread]}
                numberOfLines={1}
              >
                {conv.lastMessage ?? "No messages yet"}
              </Text>
              {isUnread && <View style={st.unreadDot} />}
            </View>
          </View>
        </Pressable>
      </Animated.View>
    </View>
  );
}

/* ── Styles ── */

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },

  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: S.screenPadding,
    paddingVertical: 10,
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
  headerCenter: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  title: {
    color: C.textPrimary,
    fontSize: 18,
    fontWeight: "900",
  },
  headerBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: C.accent,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  headerBadgeText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "800",
  },

  searchWrap: {
    paddingHorizontal: S.screenPadding,
    marginBottom: 6,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 14,
    gap: 8,
    height: 38,
  },
  searchInput: {
    flex: 1,
    color: C.textPrimary,
    fontSize: 14,
    fontWeight: "500",
  },

  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 40,
  },
  emptyTitle: { color: C.textPrimary, fontSize: 16, fontWeight: "800" },
  emptySub: {
    color: C.textSecondary,
    fontSize: 12,
    fontWeight: "500",
    textAlign: "center",
  },

  list: {
    paddingTop: 4,
    paddingBottom: 40,
  },

  /* ── Swipeable row ── */
  swipeContainer: {
    overflow: "hidden",
    backgroundColor: C.bg,
  },
  actionsRow: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: ACTION_WIDTH,
    flexDirection: "row",
    alignItems: "stretch",
  },
  actionBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  favAction: {
    backgroundColor: "#F59E0B",
  },
  delAction: {
    backgroundColor: "#EF4444",
  },
  actionLabel: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "700",
  },

  rowOuter: {
    backgroundColor: C.bg,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: S.screenPadding,
    paddingVertical: 12,
    gap: 12,
  },

  /* ── Avatar (product image) ── */
  avatarWrap: {
    position: "relative",
    width: 52,
    height: 52,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: C.muted,
    borderWidth: 2,
    borderColor: C.border,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarUnread: {
    borderColor: C.accent,
  },
  avatarImg: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    borderColor: C.border,
  },
  avatarImgUnread: {
    borderColor: C.accent,
  },
  avatarLetter: {
    color: C.textPrimary,
    fontSize: 18,
    fontWeight: "900",
  },
  favBadge: {
    position: "absolute",
    bottom: -1,
    right: -1,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#F59E0B",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: C.bg,
  },

  /* ── Content ── */
  content: {
    flex: 1,
    gap: 3,
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  name: {
    flex: 1,
    color: C.textSecondary,
    fontSize: 14,
    fontWeight: "500",
    marginRight: 8,
  },
  nameUnread: {
    color: C.textPrimary,
    fontWeight: "800",
  },
  time: {
    color: C.textMuted,
    fontSize: 11,
    fontWeight: "500",
  },
  timeUnread: {
    color: C.accent,
    fontWeight: "700",
  },
  bottomRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  preview: {
    flex: 1,
    color: C.textMuted,
    fontSize: 13,
    fontWeight: "400",
  },
  previewUnread: {
    color: C.textSecondary,
    fontWeight: "600",
  },
  unreadDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: C.accent,
  },
});
