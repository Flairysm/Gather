import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { C } from "../theme";

type Props = {
  count: number;
  limit: number;
  label?: string;
};

/**
 * Renders a subtle notice when the data count equals the query limit,
 * indicating there may be more items not shown.
 */
export default function TruncationNotice({ count, limit, label = "items" }: Props) {
  if (count < limit) return null;
  return (
    <View style={st.wrap}>
      <Ionicons name="information-circle-outline" size={14} color={C.textMuted} />
      <Text style={st.text}>
        Showing {limit}+ {label}. Pull to refresh for latest.
      </Text>
    </View>
  );
}

const st = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  text: {
    color: C.textMuted,
    fontSize: 11,
    fontWeight: "600",
  },
});
