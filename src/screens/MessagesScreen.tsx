import {
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
import { C, S } from "../theme";
import { conversations, type Conversation } from "../data/messages";
import { useAppNavigation } from "../navigation/NavigationContext";

type Props = { onBack: () => void };

export default function MessagesScreen({ onBack }: Props) {
  const { push } = useAppNavigation();

  return (
    <SafeAreaView style={st.safe}>
      <StatusBar style="light" />

      {/* ── Header ── */}
      <View style={st.header}>
        <Pressable style={st.backBtn} onPress={onBack}>
          <Feather name="arrow-left" size={20} color={C.textPrimary} />
        </Pressable>
        <Text style={st.title}>Messages</Text>
        <Pressable style={st.iconBtn}>
          <Feather name="edit" size={18} color={C.textSearch} />
        </Pressable>
      </View>

      {/* ── Search ── */}
      <View style={st.searchWrap}>
        <View style={st.searchBar}>
          <Feather name="search" size={16} color={C.textMuted} />
          <TextInput
            style={st.searchInput}
            placeholder="Search messages"
            placeholderTextColor={C.textMuted}
          />
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {conversations.map((conv: Conversation) => (
          <Pressable
            key={conv.id}
            style={st.row}
            onPress={() => push({ type: "CHAT", conversationId: conv.id })}
          >
            <View style={st.avatarWrap}>
              <View style={st.avatar}>
                <Text style={st.avatarText}>
                  {conv.user.charAt(0).toUpperCase()}
                </Text>
              </View>
              {conv.online && <View style={st.onlineDot} />}
            </View>

            <View style={st.rowContent}>
              <View style={st.rowTop}>
                <Text style={[st.userName, conv.unread > 0 && st.userNameUnread]}>
                  {conv.user}
                </Text>
                <Text style={st.timestamp}>{conv.timestamp}</Text>
              </View>
              {conv.topic && (
                <View style={st.topicRow}>
                  <Ionicons name="pricetag-outline" size={10} color={C.textAccent} />
                  <Text style={st.topicText}>{conv.topic}</Text>
                </View>
              )}
              <Text
                style={[st.lastMessage, conv.unread > 0 && st.lastMessageUnread]}
                numberOfLines={1}
              >
                {conv.lastMessage}
              </Text>
            </View>

            {conv.unread > 0 && (
              <View style={st.unreadBadge}>
                <Text style={st.unreadText}>{conv.unread}</Text>
              </View>
            )}
          </Pressable>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: C.bg,
  },
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
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: C.elevated,
    borderWidth: 1,
    borderColor: C.borderIcon,
    alignItems: "center",
    justifyContent: "center",
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

  // ── Conversation row ──
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
  avatarText: {
    color: C.textHero,
    fontSize: 16,
    fontWeight: "800",
  },
  onlineDot: {
    position: "absolute",
    bottom: 1,
    right: 1,
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: C.success,
    borderWidth: 2,
    borderColor: C.bg,
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
    fontWeight: "500",
  },
  userNameUnread: {
    fontWeight: "800",
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
  lastMessageUnread: {
    color: C.textPrimary,
    fontWeight: "600",
  },
  unreadBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: C.accent,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  unreadText: {
    color: C.textHero,
    fontSize: 10,
    fontWeight: "800",
  },
});
