import { View, StyleSheet } from "react-native";
import { StatusBar } from "expo-status-bar";

import InlineLiveViewer from "../components/InlineLiveViewer";

type Props = { streamId: string; onBack: () => void };

export default function LiveViewerScreen({ streamId, onBack }: Props) {
  return (
    <View style={st.root}>
      <StatusBar style="light" />
      <InlineLiveViewer streamId={streamId} isActive onBack={onBack} />
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
});
