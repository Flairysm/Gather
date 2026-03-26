import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
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
  subscribeToConversations,
  formatTimestamp,
  type Conversation,
} from "../data/messages";
import { useAppNavigation } from "../navigation/NavigationContext";
import { supabase } from "../lib/supabase";
import { useReconnect } from "../hooks/useReconnect";

type Props = { onBack: () => void };

export default function MessagesScreen({ onBack }: Props) {
  const { push } = useAppNavigation();
  const [convos, setConvos] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [userId, setUserId] = useState<string | null>(null);

  const fetchConversations = useCallback(async (uid: string) => {
    try {
      const data = await loadConversations(uid);
      setConvos(data);
    } catch {
      // silent
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

  return (
    <SafeAreaView style={st.safe}>
      <StatusBar style="light" />

      {/* Header */}
      <View style={st.header}>
        <Pressable style={st.backBtn} onPress={onBack}>
          <Feather name="arrow-left" size={20} color={C.textPrimary} />
        </Pressable>
        <Text style={st.title}>Messages</Text>
        <View style={{ width: 36 }} />
      </View>

      {/* Search */}
      <View style={st.searchWrap}>
        <View style={st.searchBar}>
          <Feather name="search" size={16} color={C.textMuted} />
          <TextInput
            style={st.searchInput}
            placeholder="Search messages"
            placeholderTextColor={C.textMuted}
            value={search}
            onChangeText={setSearch}
          />
        </View>
      </View>

      {loading ? (
        <View style={st.center}>
          <ActivityIndicator size="large" color={C.accent} />
        </View>
      ) : filtered.length === 0 ? (
        <View style={st.center}>
          <Ionicons name="chatbubbles-outline" size={48} color={C.textMuted} />
          <Text style={st.emptyText}>
            {search.trim() ? "No matching conversations" : "No messages yet"}
          </Text>
          <Text style={st.emptySubtext}>
            {search.trim()
              ? "Try a different search term"
              : "Start a conversation from a listing"}
          </Text>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false}>
          {filtered.map((conv) => {
            const displayName =
              conv.otherUser.displayName ??
              conv.otherUser.username ??
              "User";

            return (
              <Pressable
                key={conv.id}
                style={st.row}
                onPress={() =>
                  push({ type: "CHAT", conversationId: conv.id })
                }
              >
                <View style={st.avatarWrap}>
                  {conv.listingImage ? (
                    <CachedImage
                      source={{ uri: conv.listingImage }}
                      style={st.avatarImg}
                    />
                  ) : (
                    <View style={st.avatar}>
                      <Text style={st.avatarText}>
                        {displayName.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                  )}
                </View>

                <View style={st.rowContent}>
                  <View style={st.rowTop}>
                    <Text style={st.userName} numberOfLines={1}>
                      {displayName}
                    </Text>
                    {conv.lastMessageAt && (
                      <Text style={st.timestamp}>
                        {formatTimestamp(conv.lastMessageAt)}
                      </Text>
                    )}
                  </View>
                  {conv.topic && (
                    <View style={st.topicRow}>
                      <Ionicons
                        name="pricetag-outline"
                        size={10}
                        color={C.textAccent}
                      />
                      <Text style={st.topicText}>{conv.topic}</Text>
                    </View>
                  )}
                  {conv.lastMessage && (
                    <Text style={st.lastMessage} numberOfLines={1}>
                      {conv.lastMessage}
                    </Text>
                  )}
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: S.screenPadding,
    paddingVertical: S.md,
    gap: S.md,
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
  title: {
    flex: 1,
    color: C.textPrimary,
    fontSize: 20,
    fontWeight: "800",
  },
  searchWrap: {
    paddingHorizontal: S.screenPadding,
    marginBottom: S.lg,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.elevated,
    borderRadius: S.radiusSmall,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: S.md,
    gap: S.sm,
    height: 40,
  },
  searchInput: {
    flex: 1,
    color: C.textPrimary,
    fontSize: 14,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: S.screenPadding,
  },
  emptyText: {
    color: C.textPrimary,
    fontSize: 16,
    fontWeight: "700",
  },
  emptySubtext: {
    color: C.textSecondary,
    fontSize: 13,
    fontWeight: "500",
    textAlign: "center",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: S.screenPadding,
    paddingVertical: 13,
    gap: S.md,
  },
  avatarWrap: {
    position: "relative",
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: C.muted,
    borderWidth: 1.5,
    borderColor: C.borderAvatar,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarImg: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 1.5,
    borderColor: C.borderAvatar,
  },
  avatarText: {
    color: C.textHero,
    fontSize: 16,
    fontWeight: "800",
  },
  rowContent: {
    flex: 1,
  },
  rowTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 3,
  },
  userName: {
    color: C.textPrimary,
    fontSize: 14,
    fontWeight: "700",
    flex: 1,
    marginRight: 8,
  },
  timestamp: {
    color: C.textMuted,
    fontSize: 11,
    fontWeight: "500",
  },
  topicRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 3,
  },
  topicText: {
    color: C.textAccent,
    fontSize: 10,
    fontWeight: "700",
  },
  lastMessage: {
    color: C.textSecondary,
    fontSize: 12,
    fontWeight: "400",
  },
});
