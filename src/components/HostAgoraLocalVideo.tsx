import { StyleSheet } from "react-native";
import { AGORA_DISABLED } from "../lib/agoraFlag";

/** Host publisher surface; only loads react-native-agora when available. */
export default function HostAgoraLocalVideo({ localUid }: { localUid: number }) {
  if (AGORA_DISABLED || !localUid) return null;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const {
      RtcSurfaceView,
      RenderModeType,
      VideoSourceType,
    } = require("react-native-agora");

    return (
      <RtcSurfaceView
        style={StyleSheet.absoluteFill}
        canvas={{
          uid: localUid,
          renderMode: RenderModeType.RenderModeHidden,
          sourceType: VideoSourceType.VideoSourceCamera,
        }}
      />
    );
  } catch {
    return null;
  }
}
