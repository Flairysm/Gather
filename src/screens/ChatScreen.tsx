import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
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
  findOrCreateConversation,
  loadMessages,
  sendTextMessage,
  sendOfferMessage,
  updateOfferStatus,
  subscribeToMessages,
  markConversationRead,
  type Message,
  type OfferMessage,
  type OfferStatus,
} from "../data/messages";
import { useAppNavigation } from "../navigation/NavigationContext";
import { useCart } from "../data/cart";
import type { Listing } from "../data/market";
import { supabase } from "../lib/supabase";

type Props = {
  conversationId?: string;
  sellerId?: string;
  listingId?: string;
  topic?: string;
  openOffer?: boolean;
  onBack: () => void;
};

type ListingContext = {
  id: string;
  seller_id: string;
  card_name: string;
  price: number;
  images: string[];
  edition: string | null;
  grade: string | null;
  quantity?: number;
};

function normalizeImages(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === "string" && !!v);
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.filter(
          (v): v is string => typeof v === "string" && !!v,
        );
      }
    } catch {
      // no-op
    }
  }
  return [];
}

const STATUS_CONFIG: Record<
  OfferStatus,
  { label: string; icon: string; bg: string; border: string; color: string }
> = {
  pending: {
    label: "Pending",
    icon: "time-outline",
    bg: "rgba(44,128,255,0.08)",
    border: "rgba(44,128,255,0.25)",
    color: C.accent,
  },
  accepted: {
    label: "Accepted",
    icon: "checkmark-circle-outline",
    bg: "rgba(34,197,94,0.08)",
    border: "rgba(34,197,94,0.25)",
    color: C.success,
  },
  declined: {
    label: "Declined",
    icon: "close-circle-outline",
    bg: "rgba(239,68,68,0.08)",
    border: "rgba(239,68,68,0.25)",
    color: C.danger,
  },
  countered: {
    label: "Countered",
    icon: "swap-horizontal-outline",
    bg: "rgba(245,158,11,0.08)",
    border: "rgba(245,158,11,0.25)",
    color: "#F59E0B",
  },
};

function OfferBubble({
  msg,
  listing,
  isBuyer,
  inCart,
  onTapItem,
  onAccept,
  onDecline,
  onCounter,
  onAddToCart,
}: {
  msg: OfferMessage;
  listing: ListingContext | null;
  isBuyer: boolean;
  inCart?: boolean;
  onTapItem?: () => void;
  onAccept?: () => void;
  onDecline?: () => void;
  onCounter?: () => void;
  onAddToCart?: () => void;
}) {
  const cfg = STATUS_CONFIG[msg.status];
  const showActions = !msg.isMe && msg.status === "pending";
  const showAddToCart = msg.status === "accepted" && isBuyer && !!onAddToCart;
  const imageUrl = listing?.images?.[0];

  return (
    <View style={[st.offerCard, msg.isMe && st.offerCardMe]}>
      {/* Item preview row */}
      <Pressable style={st.offerItemRow} onPress={onTapItem} disabled={!onTapItem}>
        <View style={st.offerItemThumb}>
          {imageUrl ? (
            <Image source={{ uri: imageUrl }} style={st.offerItemThumbImg} />
          ) : (
            <Ionicons name="image-outline" size={16} color={C.textMuted} />
          )}
        </View>
        <View style={st.offerItemInfo}>
          <Text style={st.offerItemName} numberOfLines={1}>
            {msg.cardName}
          </Text>
          {listing && (
            <Text style={st.offerItemPrice}>
              Asking: RM
              {Number(listing.price).toLocaleString("en-MY", {
                maximumFractionDigits: 0,
              })}
            </Text>
          )}
        </View>
        {onTapItem && (
          <Feather name="chevron-right" size={14} color={C.textMuted} />
        )}
      </Pressable>

      <View style={st.offerDivider} />

      {/* Offer details */}
      <View style={st.offerHeader}>
        <Ionicons name="pricetag" size={13} color={C.textAccent} />
        <Text style={st.offerLabel}>
          {msg.isMe ? "Your Offer" : "Their Offer"}
        </Text>
      </View>

      <Text style={st.offerAmount}>{msg.amount}</Text>

      <View
        style={[
          st.statusChip,
          { backgroundColor: cfg.bg, borderColor: cfg.border },
        ]}
      >
        <Ionicons name={cfg.icon as any} size={12} color={cfg.color} />
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

      {showAddToCart && (
        <Pressable
          style={[st.addToCartBtn, inCart && st.addToCartBtnDone]}
          onPress={inCart ? undefined : onAddToCart}
          disabled={inCart}
        >
          <Ionicons
            name={inCart ? "checkmark-circle" : "cart"}
            size={16}
            color={inCart ? C.success : C.textHero}
          />
          <Text style={[st.addToCartText, inCart && st.addToCartTextDone]}>
            {inCart ? "Added to Cart" : `Add to Cart · ${msg.amount}`}
          </Text>
        </Pressable>
      )}

      <Text style={st.offerTime}>{msg.timestamp}</Text>
    </View>
  );
}

export default function ChatScreen({
  conversationId: initialConvId,
  sellerId,
  listingId: listingIdProp,
  topic,
  openOffer,
  onBack,
}: Props) {
  const { push } = useAppNavigation();
  const { addItem, isInCart } = useCart();
  const [myId, setMyId] = useState<string | null>(null);
  const [convId, setConvId] = useState<string | null>(initialConvId ?? null);
  const [resolvedListingId, setResolvedListingId] = useState<string | null>(
    listingIdProp ?? null,
  );
  const [listing, setListing] = useState<ListingContext | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [otherUserName, setOtherUserName] = useState("...");
  const [otherUserOnline] = useState(false);
  const [convTopic, setConvTopic] = useState<string | null>(topic ?? null);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [showOfferInput, setShowOfferInput] = useState(false);
  const openOfferRequested = useRef(openOffer ?? false);
  const [offerAmount, setOfferAmount] = useState("");
  const [counteringInfo, setCounteringInfo] = useState<{
    msgId: string;
    originalAmount: string;
  } | null>(null);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const isListingSeller = !!(myId && listing?.seller_id && myId === listing.seller_id);

  const hasPendingOffer = useMemo(() => {
    return messages.some(
      (m) => m.kind === "offer" && (m as OfferMessage).status === "pending",
    );
  }, [messages]);

  const listingSoldOut = listing ? (listing.quantity ?? 1) <= 0 : false;
  const canMakeOffer = !isListingSeller && !hasPendingOffer && !listingSoldOut;

  function scrollDown() {
    setTimeout(
      () => scrollRef.current?.scrollToEnd({ animated: true }),
      80,
    );
  }

  function navigateToListing() {
    const lid = resolvedListingId ?? listing?.id;
    if (lid) {
      push({ type: "LISTING_DETAIL", listingId: lid });
    }
  }

  const initChat = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }
    setMyId(user.id);

    let resolvedConvId = initialConvId ?? null;

    if (!resolvedConvId && sellerId) {
      resolvedConvId = await findOrCreateConversation(
        user.id,
        sellerId,
        listingIdProp,
        topic,
      );
      setConvId(resolvedConvId);
    }

    if (!resolvedConvId) {
      setLoading(false);
      return;
    }

    const { data: convData } = await supabase
      .from("conversations")
      .select("participant_ids, topic, listing_id")
      .eq("id", resolvedConvId)
      .maybeSingle();

    if (convData) {
      setConvTopic(convData.topic);
      const lid = convData.listing_id ?? listingIdProp;
      if (lid) {
        setResolvedListingId(lid);
        const { data: listingData } = await supabase
          .from("listings")
          .select("id, seller_id, card_name, price, images, edition, grade, quantity")
          .eq("id", lid)
          .maybeSingle();
        if (listingData) {
          setListing({
            ...(listingData as ListingContext),
            images: normalizeImages((listingData as any).images),
          });
        }
      } else if (convData.topic) {
        // Fallback for older conversations that were created without listing_id.
        const { data: fallbackListing } = await supabase
          .from("listings")
          .select("id, seller_id, card_name, price, images, edition, grade, quantity")
          .eq("card_name", convData.topic)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (fallbackListing) {
          setResolvedListingId(fallbackListing.id);
          setListing({
            ...(fallbackListing as ListingContext),
            images: normalizeImages((fallbackListing as any).images),
          });
        }
      }

      const otherId = (convData.participant_ids as string[]).find(
        (pid: string) => pid !== user.id,
      );
      if (otherId) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("username, display_name")
          .eq("id", otherId)
          .maybeSingle();
        if (profile) {
          setOtherUserName(
            profile.display_name ?? profile.username ?? "User",
          );
        }
      }
    }

    const msgs = await loadMessages(resolvedConvId, user.id);
    setMessages(msgs);
    await markConversationRead(resolvedConvId, user.id).catch(() => {});
    setLoading(false);
    scrollDown();
  }, [initialConvId, sellerId, listingIdProp, topic]);

  useEffect(() => {
    initChat().catch(() => setLoading(false));
  }, [initChat]);

  useEffect(() => {
    if (!loading && openOfferRequested.current && canMakeOffer) {
      openOfferRequested.current = false;
      setShowOfferInput(true);
    } else if (!loading && openOfferRequested.current && !canMakeOffer) {
      openOfferRequested.current = false;
    }
  }, [loading, canMakeOffer]);

  useEffect(() => {
    if (!convId || !myId) return;

    const channel = subscribeToMessages(
      convId,
      myId,
      (newMsg) => {
        setMessages((prev) => {
          if (prev.some((m) => m.id === newMsg.id)) return prev;
          return [...prev, newMsg];
        });
        scrollDown();
        if (!newMsg.isMe) {
          markConversationRead(convId, myId).catch(() => {});
        }
      },
      (updatedMsg) => {
        setMessages((prev) =>
          prev.map((m) => (m.id === updatedMsg.id ? updatedMsg : m)),
        );
      },
    );

    return () => {
      supabase.removeChannel(channel);
    };
  }, [convId, myId]);

  async function handleSendMessage() {
    const text = draft.trim();
    if (!text || !convId || !myId || sending) return;
    setSending(true);
    setDraft("");
    try {
      await sendTextMessage(convId, myId, text);
      scrollDown();
    } catch {
      setDraft(text);
    } finally {
      setSending(false);
    }
  }

  async function handleSendOffer() {
    if (hasPendingOffer && !counteringInfo) return;
    const raw = offerAmount.trim().replace(/(RM|\$|,)/gi, "");
    const amount = parseFloat(raw);
    if (!amount || !convId || !myId || sending) return;
    setSending(true);
    setOfferAmount("");
    setShowOfferInput(false);
    const savedCountering = counteringInfo;
    setCounteringInfo(null);
    try {
      await sendOfferMessage(
        convId,
        myId,
        amount,
        convTopic ?? listing?.card_name ?? "Card",
      );
      scrollDown();
    } catch {
      setOfferAmount(raw);
      setShowOfferInput(true);
      setCounteringInfo(savedCountering);
    } finally {
      setSending(false);
    }
  }

  async function handleOfferAction(
    msgId: string,
    action: "accepted" | "declined",
  ) {
    try {
      await updateOfferStatus(msgId, action);
    } catch {
      // silent
    }
  }

  async function handleCounter(msgId: string) {
    try {
      const offer = messages.find(
        (m) => m.id === msgId && m.kind === "offer",
      ) as OfferMessage | undefined;
      await updateOfferStatus(msgId, "countered");
      setCounteringInfo({
        msgId,
        originalAmount: offer?.amount ?? "",
      });
      setOfferAmount("");
      setShowOfferInput(true);
    } catch {
      // silent
    }
  }

  function handleAddOfferToCart(offerMsg: OfferMessage) {
    if (!listing) return;
    const agreedPrice = parseFloat(
      offerMsg.amount.replace(/(RM|\$|,)/gi, ""),
    );
    if (!agreedPrice || isNaN(agreedPrice)) return;

    const cartListing: Listing = {
      id: listing.id,
      seller_id: listing.seller_id,
      card_name: listing.card_name,
      edition: listing.edition,
      grade: listing.grade,
      condition: null,
      price: agreedPrice,
      quantity: 1,
      category: "",
      description: null,
      images: listing.images,
      views: 0,
      status: "active",
      created_at: new Date().toISOString(),
    };
    addItem(cartListing, 1);
  }

  if (loading) {
    return (
      <SafeAreaView style={st.safe}>
        <StatusBar style="light" />
        <View style={st.header}>
          <Pressable style={st.backBtn} onPress={onBack}>
            <Feather name="arrow-left" size={20} color={C.textPrimary} />
          </Pressable>
          <View style={st.headerCenter}>
            <Text style={st.headerName}>Loading...</Text>
          </View>
          <View style={{ width: 34 }} />
        </View>
        <View
          style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
        >
          <ActivityIndicator size="large" color={C.accent} />
        </View>
      </SafeAreaView>
    );
  }

  const listingImageUrl = listing?.images?.[0];

  return (
    <SafeAreaView style={st.safe}>
      <StatusBar style="light" />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {/* Header */}
        <View style={st.header}>
          <Pressable style={st.backBtn} onPress={onBack}>
            <Feather name="arrow-left" size={20} color={C.textPrimary} />
          </Pressable>

          <View style={st.headerCenter}>
            <View style={st.headerAvatar}>
              <Text style={st.headerAvatarText}>
                {otherUserName.charAt(0).toUpperCase()}
              </Text>
              {otherUserOnline && <View style={st.onlineDot} />}
            </View>
            <View>
              <Text style={st.headerName}>{otherUserName}</Text>
              <Text style={st.headerStatus}>
                {otherUserOnline ? "Online" : "Offline"}
              </Text>
            </View>
          </View>

          <Pressable style={st.iconBtn}>
            <Feather name="more-horizontal" size={17} color={C.textSearch} />
          </Pressable>
        </View>

        {/* Item context card */}
        {listing && (
          <Pressable style={st.itemContextBar} onPress={navigateToListing}>
            <View style={st.itemContextThumb}>
              {listingImageUrl ? (
                <Image
                  source={{ uri: listingImageUrl }}
                  style={st.itemContextThumbImg}
                />
              ) : (
                <Ionicons
                  name="image-outline"
                  size={16}
                  color={C.textMuted}
                />
              )}
            </View>
            <View style={st.itemContextInfo}>
              <Text style={st.itemContextName} numberOfLines={1}>
                {listing.card_name}
              </Text>
              <Text style={st.itemContextMeta}>
                RM{Number(listing.price).toLocaleString("en-MY", { maximumFractionDigits: 0 })}
                {listing.grade ? `  ·  ${listing.grade}` : ""}
              </Text>
            </View>
            <View style={st.itemContextViewBtn}>
              <Text style={st.itemContextViewText}>View</Text>
              <Feather name="chevron-right" size={12} color={C.textAccent} />
            </View>
          </Pressable>
        )}

        {/* Messages */}
        <ScrollView
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={st.messageList}
          onContentSizeChange={() =>
            scrollRef.current?.scrollToEnd({ animated: false })
          }
        >
          {messages.length === 0 && (
            <View style={st.emptyChat}>
              <View style={st.emptyChatIcon}>
                <Ionicons
                  name="chatbubbles-outline"
                  size={32}
                  color={C.accent}
                />
              </View>
              <Text style={st.emptyChatTitle}>Start negotiating</Text>
              <Text style={st.emptyChatText}>
                Send a message or make an offer to begin.
              </Text>
            </View>
          )}
          {messages.map((msg) => {
            if (msg.kind === "offer") {
              return (
                <View
                  key={msg.id}
                  style={[st.bubbleRow, msg.isMe && st.bubbleRowMe]}
                >
                  <OfferBubble
                    msg={msg}
                    listing={listing}
                    isBuyer={!isListingSeller}
                    inCart={listing ? isInCart(listing.id) : false}
                    onTapItem={
                      resolvedListingId ? navigateToListing : undefined
                    }
                    onAccept={() => handleOfferAction(msg.id, "accepted")}
                    onDecline={() => handleOfferAction(msg.id, "declined")}
                    onCounter={() => handleCounter(msg.id)}
                    onAddToCart={() => handleAddOfferToCart(msg)}
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
                      {otherUserName.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                )}
                <View
                  style={[
                    st.bubble,
                    msg.isMe ? st.bubbleMe : st.bubbleThem,
                  ]}
                >
                  <Text
                    style={[st.bubbleText, msg.isMe && st.bubbleTextMe]}
                  >
                    {msg.text}
                  </Text>
                  <Text
                    style={[st.bubbleTime, msg.isMe && st.bubbleTimeMe]}
                  >
                    {msg.timestamp}
                  </Text>
                </View>
              </View>
            );
          })}
        </ScrollView>

        {/* Offer input panel */}
        {showOfferInput && (canMakeOffer || counteringInfo) && (
          <View style={st.offerPanel}>
            {/* Item context in offer panel */}
            {listing && (
              <Pressable
                style={st.offerPanelItem}
                onPress={navigateToListing}
              >
                <View style={st.offerPanelItemThumb}>
                  {listingImageUrl ? (
                    <Image
                      source={{ uri: listingImageUrl }}
                      style={st.offerPanelItemThumbImg}
                    />
                  ) : (
                    <Ionicons
                      name="image-outline"
                      size={14}
                      color={C.textMuted}
                    />
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={st.offerPanelItemName} numberOfLines={1}>
                    {listing.card_name}
                  </Text>
                  <Text style={st.offerPanelItemPrice}>
                    Asking: RM
                    {Number(listing.price).toLocaleString("en-MY", {
                      maximumFractionDigits: 0,
                    })}
                  </Text>
                </View>
              </Pressable>
            )}

            <View style={st.offerPanelHeader}>
              <Text style={st.offerPanelTitle}>
                {counteringInfo ? "Counter Offer" : "Make an Offer"}
              </Text>
              <Pressable
                onPress={() => {
                  setShowOfferInput(false);
                  setCounteringInfo(null);
                }}
                hitSlop={12}
              >
                <Feather name="x" size={18} color={C.textMuted} />
              </Pressable>
            </View>

            {counteringInfo && (
              <View style={st.counterContext}>
                <Ionicons name="swap-horizontal" size={13} color="#F59E0B" />
                <Text style={st.counterContextText}>
                  Countering {counteringInfo.originalAmount}
                </Text>
              </View>
            )}

            <View style={st.offerPanelRow}>
              <Text style={st.dollarSign}>RM</Text>
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
                onPress={handleSendOffer}
                disabled={sending}
              >
                <Text
                  style={[
                    st.sendOfferText,
                    offerAmount.trim().length > 0 && st.sendOfferTextActive,
                  ]}
                >
                  {counteringInfo ? "Send Counter" : "Send Offer"}
                </Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* Pending offer notice */}
        {!isListingSeller && hasPendingOffer && (
          <View style={st.pendingOfferBanner}>
            <Ionicons name="time" size={14} color="#F59E0B" />
            <Text style={st.pendingOfferText}>
              You have a pending offer. Wait for the seller to respond before sending another.
            </Text>
          </View>
        )}

        {/* Input bar */}
        <View style={st.inputBar}>
          {!isListingSeller && (
            <Pressable
              style={[st.offerToggle, !canMakeOffer && { opacity: 0.35 }]}
              onPress={() => {
                if (!canMakeOffer) return;
                setCounteringInfo(null);
                setShowOfferInput((prev) => !prev);
              }}
              disabled={!canMakeOffer}
            >
              <Ionicons name="pricetag" size={18} color={canMakeOffer ? C.textAccent : C.textMuted} />
            </Pressable>
          )}
          <View style={st.inputWrap}>
            <TextInput
              style={st.input}
              value={draft}
              onChangeText={setDraft}
              placeholder="Type a message..."
              placeholderTextColor={C.textMuted}
              multiline
              onSubmitEditing={handleSendMessage}
            />
          </View>
          <Pressable
            style={[
              st.sendBtn,
              draft.trim().length > 0 && st.sendBtnActive,
            ]}
            onPress={handleSendMessage}
            disabled={sending}
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
    gap: S.md,
  },
  headerAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: C.muted,
    borderWidth: 1.5,
    borderColor: C.accent,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  headerAvatarText: {
    color: C.textHero,
    fontSize: 14,
    fontWeight: "800",
  },
  onlineDot: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: C.success,
    borderWidth: 2,
    borderColor: C.bg,
  },
  headerName: { color: C.textPrimary, fontSize: 15, fontWeight: "700" },
  headerStatus: { color: C.textSecondary, fontSize: 11, fontWeight: "500" },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: C.elevated,
    borderWidth: 1,
    borderColor: C.borderIcon,
    alignItems: "center",
    justifyContent: "center",
  },

  // ── Item context bar ──
  itemContextBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: C.elevated,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    paddingHorizontal: S.screenPadding,
    paddingVertical: 10,
  },
  itemContextThumb: {
    width: 42,
    height: 52,
    borderRadius: 8,
    backgroundColor: C.cardAlt,
    borderWidth: 1,
    borderColor: C.borderCard,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  itemContextThumbImg: {
    width: "100%",
    height: "100%",
    borderRadius: 7,
  },
  itemContextInfo: { flex: 1, gap: 2 },
  itemContextName: {
    color: C.textPrimary,
    fontSize: 13,
    fontWeight: "700",
  },
  itemContextMeta: {
    color: C.textAccent,
    fontSize: 12,
    fontWeight: "800",
  },
  itemContextViewBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    backgroundColor: C.accentGlow,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.borderStream,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  itemContextViewText: {
    color: C.textAccent,
    fontSize: 11,
    fontWeight: "700",
  },

  // ── Messages ──
  messageList: {
    paddingHorizontal: S.screenPadding,
    paddingVertical: S.lg,
    gap: 12,
  },
  emptyChat: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    gap: 10,
  },
  emptyChatIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: C.accentGlow,
    borderWidth: 1,
    borderColor: C.borderStream,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  emptyChatTitle: {
    color: C.textPrimary,
    fontSize: 16,
    fontWeight: "800",
  },
  emptyChatText: {
    color: C.textSecondary,
    fontSize: 13,
    fontWeight: "500",
    textAlign: "center",
  },
  bubbleRow: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  bubbleRowMe: { flexDirection: "row-reverse" },
  bubbleAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: C.muted,
    borderWidth: 1,
    borderColor: C.borderAvatar,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  bubbleAvatarText: {
    color: C.textHero,
    fontSize: 11,
    fontWeight: "800",
  },
  bubble: {
    maxWidth: "72%",
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 4,
  },
  bubbleThem: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderBottomLeftRadius: 4,
  },
  bubbleMe: { backgroundColor: C.accent, borderBottomRightRadius: 4 },
  bubbleText: { color: C.textPrimary, fontSize: 14, lineHeight: 20 },
  bubbleTextMe: { color: "#fff" },
  bubbleTime: {
    color: C.textMuted,
    fontSize: 10,
    fontWeight: "500",
    alignSelf: "flex-end",
  },
  bubbleTimeMe: { color: "rgba(255,255,255,0.6)" },

  // ── Offer bubble ──
  offerCard: {
    width: "82%",
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 18,
    overflow: "hidden",
    gap: 0,
  },
  offerCardMe: { backgroundColor: C.cardAlt, borderColor: C.borderCard },
  offerItemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    paddingBottom: 10,
  },
  offerItemThumb: {
    width: 40,
    height: 50,
    borderRadius: 6,
    backgroundColor: C.cardAlt,
    borderWidth: 1,
    borderColor: C.borderCard,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  offerItemThumbImg: {
    width: "100%",
    height: "100%",
    borderRadius: 5,
  },
  offerItemInfo: { flex: 1, gap: 2 },
  offerItemName: {
    color: C.textPrimary,
    fontSize: 12,
    fontWeight: "700",
  },
  offerItemPrice: {
    color: C.textSecondary,
    fontSize: 10,
    fontWeight: "600",
  },
  offerDivider: {
    height: 1,
    backgroundColor: C.border,
    marginHorizontal: 12,
  },
  offerHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingTop: 10,
  },
  offerLabel: {
    color: C.textSecondary,
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  offerAmount: {
    color: C.link,
    fontSize: 24,
    fontWeight: "900",
    paddingHorizontal: 12,
    paddingTop: 2,
  },
  statusChip: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: S.radiusBadge,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginHorizontal: 12,
    marginTop: 4,
  },
  statusText: { fontSize: 10, fontWeight: "800" },
  offerActions: {
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 12,
    marginTop: 8,
  },
  acceptBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    backgroundColor: C.success,
    borderRadius: 10,
    paddingVertical: 9,
  },
  acceptText: { color: C.textHero, fontSize: 12, fontWeight: "800" },
  counterBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    backgroundColor: C.accentGlow,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.borderStream,
    paddingVertical: 9,
  },
  counterText: { color: C.textAccent, fontSize: 12, fontWeight: "800" },
  declineBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    backgroundColor: "rgba(239,68,68,0.08)",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.2)",
    paddingVertical: 9,
  },
  declineText: { color: C.danger, fontSize: 12, fontWeight: "800" },
  addToCartBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: C.accent,
    borderRadius: 10,
    paddingVertical: 10,
    marginHorizontal: 12,
    marginTop: 8,
  },
  addToCartBtnDone: {
    backgroundColor: "rgba(34,197,94,0.1)",
    borderWidth: 1,
    borderColor: "rgba(34,197,94,0.25)",
  },
  addToCartText: { color: C.textHero, fontSize: 12, fontWeight: "800" },
  addToCartTextDone: { color: C.success },
  offerTime: {
    color: C.textMuted,
    fontSize: 10,
    fontWeight: "500",
    alignSelf: "flex-end",
    paddingHorizontal: 12,
    paddingBottom: 10,
    paddingTop: 4,
  },

  // ── Offer input panel ──
  offerPanel: {
    backgroundColor: C.elevated,
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingHorizontal: S.screenPadding,
    paddingVertical: S.md,
    gap: S.md,
  },
  offerPanelItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: C.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    padding: 8,
  },
  offerPanelItemThumb: {
    width: 36,
    height: 44,
    borderRadius: 6,
    backgroundColor: C.cardAlt,
    borderWidth: 1,
    borderColor: C.borderCard,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  offerPanelItemThumbImg: {
    width: "100%",
    height: "100%",
    borderRadius: 5,
  },
  offerPanelItemName: {
    color: C.textPrimary,
    fontSize: 12,
    fontWeight: "700",
  },
  offerPanelItemPrice: {
    color: C.textSecondary,
    fontSize: 10,
    fontWeight: "600",
  },
  counterContext: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(245,158,11,0.08)",
    borderWidth: 1,
    borderColor: "rgba(245,158,11,0.25)",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 4,
  },
  counterContextText: {
    color: "#F59E0B",
    fontSize: 12,
    fontWeight: "700",
  },
  offerPanelHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  offerPanelTitle: {
    color: C.textPrimary,
    fontSize: 14,
    fontWeight: "800",
  },
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
  sendOfferBtnActive: { backgroundColor: C.accent },
  sendOfferText: { color: C.textMuted, fontSize: 13, fontWeight: "800" },
  sendOfferTextActive: { color: C.textHero },

  // ── Input bar ──
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: S.screenPadding,
    paddingVertical: S.md,
    borderTopWidth: 1,
    borderTopColor: C.border,
    gap: 8,
    backgroundColor: C.bg,
  },
  pendingOfferBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: S.screenPadding,
    paddingVertical: 8,
    backgroundColor: "rgba(245,158,11,0.08)",
    borderTopWidth: 1,
    borderTopColor: "rgba(245,158,11,0.2)",
  },
  pendingOfferText: {
    flex: 1,
    color: "#F59E0B",
    fontSize: 11,
    fontWeight: "600",
    lineHeight: 15,
  },
  offerToggle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: C.accentGlow,
    borderWidth: 1,
    borderColor: C.borderStream,
    alignItems: "center",
    justifyContent: "center",
  },
  inputWrap: {
    flex: 1,
    backgroundColor: C.elevated,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 14,
    paddingVertical: 8,
    minHeight: 38,
    maxHeight: 100,
    justifyContent: "center",
  },
  input: { color: C.textPrimary, fontSize: 14, lineHeight: 20 },
  sendBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: C.elevated,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnActive: { backgroundColor: C.accent, borderColor: C.accent },
});
