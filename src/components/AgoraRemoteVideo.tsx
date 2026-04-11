import { StyleSheet } from "react-native";
import { AGORA_DISABLED } from "../lib/agoraFlag";

/**
 * Renders Agora remote video only when the native module is available.
 * When Agora is disabled (e.g. Expo Go), returns null so nothing links react-native-agora.
 */
export default function AgoraRemoteVideo({ remoteUid }: { remoteUid: number }) {
  if (AGORA_DISABLED) return null;

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
          uid: remoteUid,
          renderMode: RenderModeType.RenderModeHidden,
          sourceType: VideoSourceType.VideoSourceRemote,
        }}
      />
    );
  } catch {
    return null;
  }
}
