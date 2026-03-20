import { useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
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
import {
  conversations,
  mockMessages,
  type Message,
  type OfferMessage,
  type OfferStatus,
} from "../data/messages";
import { useAppNavigation } from "../navigation/NavigationContext";

type Props = {
  conversationId: string;
  openOffer?: boolean;
  onBack: () => void;
};

const STATUS_CONFIG: Record<
  OfferStatus,
  { label: string; bg: string; border: string; color: string }
> = {
  pending: { label: "Pending", bg: "rgba(44,128,255,0.1)", border: "rgba(44,128,255,0.3)", color: C.accent },
  accepted: { label: "Accepted", bg: "rgba(34,197,94,0.1)", border: "rgba(34,197,94,0.3)", color: C.success },
  declined: { label: "Declined", bg: "rgba(239,68,68,0.1)", border: "rgba(239,68,68,0.3)", color: C.danger },
  countered: { label: "Countered", bg: "rgba(234,61,94,0.1)", border: "rgba(234,61,94,0.3)", color: "#F59E0B" },
};

function OfferBubble({
  msg,
  onAccept,
  onDecline,
  onCounter,
}: {
  msg: OfferMessage;
  onAccept?: () => void;
  onDecline?: () => void;
  onCounter?: () => void;
}) {
  const cfg = STATUS_CONFIG[msg.status];
  const showActions = !msg.isMe && msg.status === "pending";

  return (
    <View style={[st.offerCard, msg.isMe && st.offerCardMe]}>
      <View style={st.offerHeader}>
        <Ionicons name="pricetag" size={14} color={C.textAccent} />
        <Text style={st.offerLabel}>
          {msg.isMe ? "Your Offer" : "Their Offer"}
        </Text>
      </View>

      <Text style={st.offerCardName}>{msg.cardName}</Text>
      <Text style={st.offerAmount}>{msg.amount}</Text>

      <View style={[st.statusChip, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
        <Text style={[st.statusText, { color: cfg.color }]}>{cfg.label}</Text>
      </View>

      {showActions && (
        <View style={st.offerActions}>
          <Pressable style={st.acceptBtn} onPress={onAccept}>
            <Ionicons name="checkmark" size={16} color={C.textHero} />
            <Text style={st.acceptText}>Accept</Text>
          </Pressable>
          <Pressable style={st.counterBtn} onPress={onCounter}>
            <Ionicons name="swap-horizontal" size={16} color={C.textAccent} />
            <Text style={st.counterText}>Counter</Text>
          </Pressable>
          <Pressable style={st.declineBtn} onPress={onDecline}>
            <Ionicons name="close" size={16} color={C.danger} />
            <Text style={st.declineText}>Decline</Text>
          </Pressable>
        </View>
      )}

      <Text style={st.offerTime}>{msg.timestamp}</Text>
    </View>
  );
}

export default function ChatScreen({ conversationId, openOffer, onBack }: Props) {
  const { pop } = useAppNavigation();
  const conv = conversations.find((c) => c.id === conversationId);
  const [messages, setMessages] = useState<Message[]>(
    mockMessages[conversationId] ?? [],
  );
  const [draft, setDraft] = useState("");
  const [showOfferInput, setShowOfferInput] = useState(openOffer ?? false);
  const [offerAmount, setOfferAmount] = useState("");
  const scrollRef = useRef<ScrollView>(null);

  function scrollDown() {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
  }

  function sendMessage() {
    const text = draft.trim();
    if (!text) return;
    setMessages((prev) => [
      ...prev,
      {
        id: `m${Date.now()}`,
        senderId: "me",
        text,
        timestamp: "Now",
        isMe: true,
        kind: "text",
      },
    ]);
    setDraft("");
    scrollDown();
  }

  function sendOffer() {
    const amount = offerAmount.trim();
    if (!amount) return;
    const formatted = amount.startsWith("$") ? amount : `$${amount}`;
    setMessages((prev) => [
      ...prev,
      {
        id: `m${Date.now()}`,
        senderId: "me",
        timestamp: "Now",
        isMe: true,
        kind: "offer",
        amount: formatted,
        cardName: conv?.topic ?? "Card",
        status: "pending",
      },
    ]);
    setOfferAmount("");
    setShowOfferInput(false);
    scrollDown();
  }

  function handleOfferAction(msgId: string, action: "accepted" | "declined") {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === msgId && m.kind === "offer" ? { ...m, status: action } : m,
      ),
    );
  }

  function handleCounter(msgId: string) {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === msgId && m.kind === "offer"
          ? { ...m, status: "countered" as OfferStatus }
          : m,
      ),
    );
    setShowOfferInput(true);
  }

  if (!conv) return null;

  return (
    <SafeAreaView style={st.safe}>
      <StatusBar style="light" />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {/* ── Header ── */}
        <View style={st.header}>
          <Pressable style={st.backBtn} onPress={onBack}>
            <Feather name="arrow-left" size={20} color={C.textPrimary} />
          </Pressable>

          <View style={st.headerCenter}>
            <View style={st.headerAvatar}>
              <Text style={st.headerAvatarText}>
                {conv.user.charAt(0).toUpperCase()}
              </Text>
              {conv.online && <View style={st.onlineDot} />}
            </View>
            <View>
              <Text style={st.headerName}>{conv.user}</Text>
              <Text style={st.headerStatus}>
                {conv.online ? "Online" : "Offline"}
              </Text>
            </View>
          </View>

          <Pressable style={st.iconBtn}>
            <Feather name="more-horizontal" size={17} color={C.textSearch} />
          </Pressable>
        </View>

        {/* ── Topic bar ── */}
        {conv.topic && (
          <View style={st.topicBar}>
            <Ionicons name="pricetag-outline" size={12} color={C.textAccent} />
            <Text style={st.topicText}>{conv.topic}</Text>
            <Pressable style={st.topicBtn}>
              <Text style={st.topicBtnText}>View</Text>
            </Pressable>
          </View>
        )}

        {/* ── Messages ── */}
        <ScrollView
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={st.messageList}
          onContentSizeChange={() =>
            scrollRef.current?.scrollToEnd({ animated: false })
          }
        >
          {messages.map((msg) => {
            if (msg.kind === "offer") {
              return (
                <View
                  key={msg.id}
                  style={[st.bubbleRow, msg.isMe && st.bubbleRowMe]}
                >
                  <OfferBubble
                    msg={msg}
                    onAccept={() => handleOfferAction(msg.id, "accepted")}
                    onDecline={() => handleOfferAction(msg.id, "declined")}
                    onCounter={() => handleCounter(msg.id)}
                  />
                </View>
              );
            }

            return (
              <View
                key={msg.id}
                style={[st.bubbleRow, msg.isMe && st.bubbleRowMe]}
              >
                {!msg.isMe && (
                  <View style={st.bubbleAvatar}>
                    <Text style={st.bubbleAvatarText}>
                      {conv.user.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                )}
                <View
                  style={[st.bubble, msg.isMe ? st.bubbleMe : st.bubbleThem]}
                >
                  <Text style={[st.bubbleText, msg.isMe && st.bubbleTextMe]}>
                    {msg.text}
                  </Text>
                  <Text style={[st.bubbleTime, msg.isMe && st.bubbleTimeMe]}>
                    {msg.timestamp}
                  </Text>
                </View>
              </View>
            );
          })}
        </ScrollView>

        {/* ── Offer input panel ── */}
        {showOfferInput && (
          <View style={st.offerPanel}>
            <View style={st.offerPanelHeader}>
              <Text style={st.offerPanelTitle}>Make an Offer</Text>
              <Pressable onPress={() => setShowOfferInput(false)}>
                <Feather name="x" size={18} color={C.textMuted} />
              </Pressable>
            </View>
            <View style={st.offerPanelRow}>
              <Text style={st.dollarSign}>$</Text>
              <TextInput
                style={st.offerInput}
                value={offerAmount}
                onChangeText={setOfferAmount}
                placeholder="0.00"
                placeholderTextColor={C.textMuted}
                keyboardType="numeric"
                autoFocus
              />
              <Pressable
                style={[
                  st.sendOfferBtn,
                  offerAmount.trim().length > 0 && st.sendOfferBtnActive,
                ]}
                onPress={sendOffer}
              >
                <Text
                  style={[
                    st.sendOfferText,
                    offerAmount.trim().length > 0 && st.sendOfferTextActive,
                  ]}
                >
                  Send Offer
                </Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* ── Input bar ── */}
        <View style={st.inputBar}>
          <Pressable
            style={st.offerToggle}
            onPress={() => setShowOfferInput((prev) => !prev)}
          >
            <Ionicons name="pricetag" size={18} color={C.textAccent} />
          </Pressable>
          <View style={st.inputWrap}>
            <TextInput
              style={st.input}
              value={draft}
              onChangeText={setDraft}
              placeholder="Type a message..."
              placeholderTextColor={C.textMuted}
              multiline
              onSubmitEditing={sendMessage}
            />
          </View>
          <Pressable
            style={[st.sendBtn, draft.trim().length > 0 && st.sendBtnActive]}
            onPress={sendMessage}
          >
            <Feather
              name="send"
              size={18}
              color={draft.trim().length > 0 ? C.textHero : C.textMuted}
            />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },

  // ── Header ──
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: S.screenPadding,
    paddingVertical: S.md,
    gap: S.md,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: C.elevated, borderWidth: 1, borderColor: C.border,
    alignItems: "center", justifyContent: "center",
  },
  headerCenter: { flex: 1, flexDirection: "row", alignItems: "center", gap: S.md },
  headerAvatar: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: C.muted, borderWidth: 1.5, borderColor: C.accent,
    alignItems: "center", justifyContent: "center", position: "relative",
  },
  headerAvatarText: { color: C.textHero, fontSize: 14, fontWeight: "800" },
  onlineDot: {
    position: "absolute", bottom: 0, right: 0,
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: C.success, borderWidth: 2, borderColor: C.bg,
  },
  headerName: { color: C.textPrimary, fontSize: 15, fontWeight: "700" },
  headerStatus: { color: C.textSecondary, fontSize: 11, fontWeight: "500" },
  iconBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: C.elevated, borderWidth: 1, borderColor: C.borderIcon,
    alignItems: "center", justifyContent: "center",
  },

  // ── Topic ──
  topicBar: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: C.elevated, borderBottomWidth: 1, borderBottomColor: C.border,
    paddingHorizontal: S.screenPadding, paddingVertical: 9,
  },
  topicText: { flex: 1, color: C.textAccent, fontSize: 12, fontWeight: "600" },
  topicBtn: {
    backgroundColor: C.accentGlow, borderRadius: S.radiusBadge,
    borderWidth: 1, borderColor: C.borderStream,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  topicBtnText: { color: C.textAccent, fontSize: 11, fontWeight: "700" },

  // ── Messages ──
  messageList: { paddingHorizontal: S.screenPadding, paddingVertical: S.lg, gap: 10 },
  bubbleRow: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  bubbleRowMe: { flexDirection: "row-reverse" },
  bubbleAvatar: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: C.muted, borderWidth: 1, borderColor: C.borderAvatar,
    alignItems: "center", justifyContent: "center", marginBottom: 2,
  },
  bubbleAvatarText: { color: C.textHero, fontSize: 11, fontWeight: "800" },
  bubble: { maxWidth: "72%", borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10, gap: 4 },
  bubbleThem: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderBottomLeftRadius: 4 },
  bubbleMe: { backgroundColor: C.accent, borderBottomRightRadius: 4 },
  bubbleText: { color: C.textPrimary, fontSize: 14, lineHeight: 20 },
  bubbleTextMe: { color: "#fff" },
  bubbleTime: { color: C.textMuted, fontSize: 10, fontWeight: "500", alignSelf: "flex-end" },
  bubbleTimeMe: { color: "rgba(255,255,255,0.6)" },

  // ── Offer bubble ──
  offerCard: {
    width: "78%",
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 18,
    padding: 14,
    gap: 6,
  },
  offerCardMe: {
    backgroundColor: C.cardAlt,
    borderColor: C.borderCard,
  },
  offerHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  offerLabel: { color: C.textSecondary, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  offerCardName: { color: C.textPrimary, fontSize: 12, fontWeight: "600" },
  offerAmount: { color: C.link, fontSize: 22, fontWeight: "900" },
  statusChip: {
    alignSelf: "flex-start",
    borderRadius: S.radiusBadge,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  statusText: { fontSize: 10, fontWeight: "800" },
  offerActions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 6,
  },
  acceptBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    backgroundColor: C.success,
    borderRadius: S.radiusSmall,
    paddingVertical: 8,
  },
  acceptText: { color: C.textHero, fontSize: 12, fontWeight: "800" },
  counterBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    backgroundColor: C.accentGlow,
    borderRadius: S.radiusSmall,
    borderWidth: 1,
    borderColor: C.borderStream,
    paddingVertical: 8,
  },
  counterText: { color: C.textAccent, fontSize: 12, fontWeight: "800" },
  declineBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    backgroundColor: "rgba(239,68,68,0.1)",
    borderRadius: S.radiusSmall,
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.25)",
    paddingVertical: 8,
  },
  declineText: { color: C.danger, fontSize: 12, fontWeight: "800" },
  offerTime: { color: C.textMuted, fontSize: 10, fontWeight: "500", alignSelf: "flex-end" },

  // ── Offer input panel ──
  offerPanel: {
    backgroundColor: C.elevated,
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingHorizontal: S.screenPadding,
    paddingVertical: S.md,
    gap: S.md,
  },
  offerPanelHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  offerPanelTitle: { color: C.textPrimary, fontSize: 14, fontWeight: "800" },
  offerPanelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: S.md,
  },
  dollarSign: { color: C.textAccent, fontSize: 22, fontWeight: "900" },
  offerInput: {
    flex: 1,
    backgroundColor: C.surface,
    borderRadius: S.radiusSmall,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 14,
    height: 42,
    color: C.textPrimary,
    fontSize: 18,
    fontWeight: "700",
  },
  sendOfferBtn: {
    borderRadius: S.radiusSmall,
    backgroundColor: C.muted,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  sendOfferBtnActive: {
    backgroundColor: C.accent,
  },
  sendOfferText: {
    color: C.textMuted,
    fontSize: 13,
    fontWeight: "800",
  },
  sendOfferTextActive: {
    color: C.textHero,
  },

  // ── Input bar ──
  inputBar: {
    flexDirection: "row", alignItems: "flex-end",
    paddingHorizontal: S.screenPadding, paddingVertical: S.md,
    borderTopWidth: 1, borderTopColor: C.border,
    gap: 8, backgroundColor: C.bg,
  },
  offerToggle: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: C.accentGlow, borderWidth: 1, borderColor: C.borderStream,
    alignItems: "center", justifyContent: "center",
  },
  inputWrap: {
    flex: 1, backgroundColor: C.elevated,
    borderRadius: 20, borderWidth: 1, borderColor: C.border,
    paddingHorizontal: 14, paddingVertical: 8,
    minHeight: 38, maxHeight: 100, justifyContent: "center",
  },
  input: { color: C.textPrimary, fontSize: 14, lineHeight: 20 },
  sendBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: C.elevated, borderWidth: 1, borderColor: C.border,
    alignItems: "center", justifyContent: "center",
  },
  sendBtnActive: { backgroundColor: C.accent, borderColor: C.accent },
});
