import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { C, S } from "../theme";
import ScreenHeader from "../components/ScreenHeader";
import EmptyState from "../components/EmptyState";
import { useAppNavigation } from "../navigation/NavigationContext";
import { fetchSellerVouches, type SellerVouches, type Voucher } from "../data/vouches";

type Props = {
  sellerId: string;
  storeName?: string;
  onBack: () => void;
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days < 1) return "Today";
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

export default function SellerVouchesScreen({ sellerId, storeName, onBack }: Props) {
  const { push } = useAppNavigation();
  const [data, setData] = useState<SellerVouches | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await fetchSellerVouches(sellerId);
    setData(result);
    setLoading(false);
  }, [sellerId]);

  useEffect(() => {
    load();
  }, [load]);

  const renderItem = ({ item }: { item: Voucher }) => {
    const name = item.display_name || item.username || "Buyer";
    return (
      <Pressable
        style={st.card}
        onPress={() => push({ type: "USER_PROFILE", userId: item.id })}
      >
        {item.avatar_url ? (
          <Image source={{ uri: item.avatar_url }} style={st.avatar} />
        ) : (
          <View style={[st.avatar, st.avatarEmpty]}>
            <Ionicons name="person" size={16} color={C.textMuted} />
          </View>
        )}
        <View style={st.body}>
          <View style={st.nameRow}>
            <Text style={st.name}>{name}</Text>
            {item.is_followed && (
              <View style={st.followTag}>
                <Text style={st.followTagText}>Following</Text>
              </View>
            )}
            <Text style={st.time}>{timeAgo(item.created_at)}</Text>
          </View>
          {item.note ? (
            <Text style={st.note}>{item.note}</Text>
          ) : (
            <Text style={st.noteMuted}>Vouched for this seller</Text>
          )}
        </View>
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={st.safe}>
      <StatusBar style="light" />
      <ScreenHeader
        title={storeName ? `Vouches · ${storeName}` : "Vouches"}
        onBack={onBack}
      />
      {loading ? (
        <View style={st.center}>
          <ActivityIndicator size="large" color={C.accent} />
        </View>
      ) : (
        <FlatList
          data={data?.sample ?? []}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          ListHeaderComponent={
            (data?.total ?? 0) > 0 ? (
              <View style={st.summary}>
                <Ionicons name="ribbon" size={16} color={C.accent} />
                <Text style={st.summaryText}>
                  {data!.total} {data!.total === 1 ? "person vouches" : "people vouch"} for this seller
                </Text>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <EmptyState
              icon="ribbon-outline"
              title="No vouches yet"
              message="When buyers who've completed an order vouch for this seller, they'll show up here."
            />
          }
          contentContainerStyle={st.list}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: { padding: S.screenPadding, gap: 10 },
  summary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 6,
    marginBottom: 4,
  },
  summaryText: { color: C.textSecondary, fontSize: 13, fontWeight: "700" },
  card: {
    flexDirection: "row",
    gap: 12,
    padding: 14,
    borderRadius: 14,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
  },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.elevated },
  avatarEmpty: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: C.border,
  },
  body: { flex: 1, gap: 4 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  name: { color: C.textPrimary, fontSize: 14, fontWeight: "800" },
  followTag: {
    backgroundColor: C.elevated,
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 1,
  },
  followTagText: { color: C.textSecondary, fontSize: 9, fontWeight: "800" },
  time: { color: C.textMuted, fontSize: 11, fontWeight: "600", marginLeft: "auto" },
  note: { color: C.textSecondary, fontSize: 13, fontWeight: "500", lineHeight: 19 },
  noteMuted: { color: C.textMuted, fontSize: 12, fontWeight: "500", fontStyle: "italic" },
});
