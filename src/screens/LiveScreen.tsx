import { useRef, useState } from "react";
import {
  Animated,
  FlatList,
  Pressable,
  Text,
  TextInput,
  View,
  Dimensions,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather, Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";

import { C, S } from "../theme";
import { live as l } from "../styles/live.styles";
import { liveStreams, type LiveStream } from "../data/live";

const { height: SCREEN_H } = Dimensions.get("window");
const AnimatedFlatList = Animated.createAnimatedComponent(FlatList<LiveStream>);

type ChatMsg = { user: string; text: string };

const MOCK_CHATS: ChatMsg[] = [
  { user: "slab_hunter", text: "That centering is insane 🔥" },
  { user: "poke_fan99", text: "PSA 10 for sure" },
  { user: "grail_seeker", text: "What's the pop count on that?" },
  { user: "rip_master", text: "💎💎💎" },
];

function StreamPage({
  stream,
  index,
  scrollY,
  insetTop,
  insetBottom,
}: {
  stream: LiveStream;
  index: number;
  scrollY: Animated.Value;
  insetTop: number;
  insetBottom: number;
}) {
  const pageOffset = index * SCREEN_H;

  const contentOpacity = scrollY.interpolate({
    inputRange: [pageOffset - SCREEN_H, pageOffset, pageOffset + SCREEN_H],
    outputRange: [0, 1, 0],
    extrapolate: "clamp",
  });

  const contentTranslate = scrollY.interpolate({
    inputRange: [pageOffset - SCREEN_H, pageOffset, pageOffset + SCREEN_H],
    outputRange: [20, 0, -20],
    extrapolate: "clamp",
  });

  const topBarTop = insetTop + 52;
  const tagTop = topBarTop + 48;
  const bottomBarBottom = Math.max(insetBottom, 14) + S.scrollPaddingBottom - 54;
  const chatBottom = bottomBarBottom + 54;

  return (
    <View style={[l.page, { backgroundColor: stream.bgColor }]}>
      {/* Video placeholder */}
      <View style={l.streamPlaceholder}>
        <View style={l.streamPlaceholderIcon}>
          <Feather name="play" size={32} color={C.accent} />
        </View>
      </View>

      {/* Gradients */}
      <LinearGradient
        colors={["rgba(0,0,0,0.6)", "transparent"]}
        style={l.topGradient}
        pointerEvents="none"
      />
      <LinearGradient
        colors={["transparent", "rgba(0,0,0,0.75)"]}
        style={l.bottomGradient}
        pointerEvents="none"
      />

      {/* ── Top: Profile pill + actions ── */}
      <Animated.View
        style={[
          l.topBar,
          { top: topBarTop, opacity: contentOpacity, transform: [{ translateY: contentTranslate }] },
        ]}
      >
        <View style={l.profilePill}>
          <View style={l.avatar}>
            <Text style={l.avatarText}>
              {stream.streamer.charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={l.profileInfo}>
            <Text style={l.streamerName}>@{stream.streamer}</Text>
            <View style={l.viewerRow}>
              <View style={l.liveDot} />
              <Text style={l.viewerText}>{stream.viewers} watching</Text>
            </View>
          </View>
          <Pressable style={l.followBtn}>
            <Text style={l.followBtnText}>Follow</Text>
          </Pressable>
        </View>

        <View style={l.topRight}>
          <Pressable style={l.topIconBtn}>
            <Ionicons name="people-outline" size={18} color={C.textPrimary} />
          </Pressable>
          <Pressable style={l.topIconBtn}>
            <Feather name="more-horizontal" size={18} color={C.textPrimary} />
          </Pressable>
          <Pressable style={l.topIconBtn}>
            <Feather name="x" size={18} color={C.textPrimary} />
          </Pressable>
        </View>
      </Animated.View>

      {/* ── Tags below profile ── */}
      <Animated.View
        style={[
          l.tagRow,
          { top: tagTop, opacity: contentOpacity, transform: [{ translateY: contentTranslate }] },
        ]}
      >
        <View style={l.categoryChip}>
          <Text style={l.categoryText}>{stream.category}</Text>
        </View>
        {stream.tags.map((tag) => (
          <View key={tag} style={l.tag}>
            <Text style={l.tagText}>{tag}</Text>
          </View>
        ))}
      </Animated.View>

      {/* ── Chat messages ── */}
      <Animated.View
        style={[
          l.chatArea,
          { bottom: chatBottom, opacity: contentOpacity, transform: [{ translateY: contentTranslate }] },
        ]}
      >
        {MOCK_CHATS.map((msg, i) => (
          <View key={i} style={l.chatBubble}>
            <Text style={l.chatUser}>{msg.user}</Text>
            <Text style={l.chatText}>{msg.text}</Text>
          </View>
        ))}
      </Animated.View>

      {/* ── Bottom bar: chat input + action buttons ── */}
      <Animated.View
        style={[
          l.bottomBar,
          { bottom: bottomBarBottom, opacity: contentOpacity, transform: [{ translateY: contentTranslate }] },
        ]}
      >
        <Pressable style={l.chatInput}>
          <Ionicons name="chatbubble-outline" size={16} color={C.textMuted} />
          <Text style={l.chatInputText}>Say something...</Text>
        </Pressable>
        <Pressable style={l.actionBtn}>
          <Ionicons name="heart-outline" size={20} color={C.textPrimary} />
        </Pressable>
        <Pressable style={l.actionBtn}>
          <Ionicons name="share-outline" size={18} color={C.textPrimary} />
        </Pressable>
        <Pressable style={l.giftBtn}>
          <Feather name="gift" size={18} color={C.live} />
        </Pressable>
      </Animated.View>
    </View>
  );
}

export default function LiveScreen() {
  const insets = useSafeAreaInsets();
  const [searchVisible, setSearchVisible] = useState(false);
  const scrollY = useRef(new Animated.Value(0)).current;

  const onScroll = Animated.event(
    [{ nativeEvent: { contentOffset: { y: scrollY } } }],
    { useNativeDriver: true },
  );

  return (
    <View style={l.root}>
      <StatusBar style="light" />

      <AnimatedFlatList
        data={liveStreams}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => (
          <StreamPage
            stream={item}
            index={index}
            scrollY={scrollY}
            insetTop={insets.top}
            insetBottom={insets.bottom}
          />
        )}
        pagingEnabled
        showsVerticalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        getItemLayout={(_: any, index: number) => ({
          length: SCREEN_H,
          offset: SCREEN_H * index,
          index,
        })}
      />

      {/* Search overlay at top */}
      <View style={[l.searchOverlay, { paddingTop: insets.top + 8 }]}>
        <View style={l.searchRow}>
          {searchVisible ? (
            <>
              <View style={l.searchBar}>
                <Feather name="search" size={16} color={C.textMuted} />
                <TextInput
                  style={l.searchInput}
                  placeholder="Search live streams"
                  placeholderTextColor={C.textMuted}
                  autoFocus
                />
              </View>
              <Pressable onPress={() => setSearchVisible(false)}>
                <Text style={{ color: C.textPrimary, fontSize: 14, fontWeight: "600" }}>
                  Cancel
                </Text>
              </Pressable>
            </>
          ) : (
            <>
              <Pressable style={l.searchBar} onPress={() => setSearchVisible(true)}>
                <Feather name="search" size={16} color={C.textMuted} />
                <Text style={{ color: C.textMuted, fontSize: 14, fontWeight: "500" }}>
                  Search live streams
                </Text>
              </Pressable>
              <Pressable style={l.goLiveBtn}>
                <Ionicons name="radio" size={14} color={C.textHero} />
                <Text style={l.goLiveText}>GO LIVE</Text>
              </Pressable>
            </>
          )}
        </View>
      </View>
    </View>
  );
}
