import { supabase } from "./supabase";
import { AGORA_DISABLED } from "./agoraFlag";

/** Opaque handle; real type comes from react-native-agora when loaded. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type IRtcEngine = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type IRtcEngineEventHandler = any;

export interface AgoraTokenResult {
  token: string;
  uid: number;
  appId: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function loadAgoraNative(): any {
  if (AGORA_DISABLED) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("react-native-agora");
  } catch {
    return null;
  }
}

export async function fetchAgoraToken(
  channelName: string,
  role: "publisher" | "subscriber",
): Promise<AgoraTokenResult> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Not authenticated");

  const { data, error } = await supabase.functions.invoke("agora-token", {
    body: { channelName, role },
  });

  if (error) {
    const message =
      (typeof error.message === "string" && error.message) ||
      "Token request failed";
    throw new Error(message);
  }

  if (!data?.token || !data?.uid || !data?.appId) {
    throw new Error("Invalid token response from server");
  }

  return data as AgoraTokenResult;
}

export function createHostEngine(
  appId: string,
  channelName: string,
  token: string,
  uid: number,
  eventHandler: IRtcEngineEventHandler,
): IRtcEngine {
  const agora = loadAgoraNative();
  if (!agora) throw new Error("Agora native module not available");

  const {
    createAgoraRtcEngine,
    ChannelProfileType,
    ClientRoleType,
  } = agora;

  const engine = createAgoraRtcEngine();
  engine.initialize({ appId });
  engine.registerEventHandler(eventHandler);
  engine.enableVideo();
  engine.setChannelProfile(ChannelProfileType.ChannelProfileLiveBroadcasting);
  engine.setClientRole(ClientRoleType.ClientRoleBroadcaster);
  engine.startPreview();

  const joinRc = engine.joinChannel(token, channelName, uid, {
    clientRoleType: ClientRoleType.ClientRoleBroadcaster,
    publishCameraTrack: true,
    publishMicrophoneTrack: true,
    autoSubscribeAudio: true,
    autoSubscribeVideo: true,
  });
  if (joinRc < 0) {
    throw new Error(`Failed to join host channel (${joinRc})`);
  }
  return engine;
}

export function createAudienceEngine(
  appId: string,
  channelName: string,
  token: string,
  uid: number,
  eventHandler: IRtcEngineEventHandler,
): IRtcEngine {
  const agora = loadAgoraNative();
  if (!agora) throw new Error("Agora native module not available");

  const {
    createAgoraRtcEngine,
    ChannelProfileType,
    ClientRoleType,
  } = agora;

  const engine = createAgoraRtcEngine();
  engine.initialize({ appId });
  engine.registerEventHandler(eventHandler);
  engine.enableVideo();
  engine.setChannelProfile(ChannelProfileType.ChannelProfileLiveBroadcasting);
  engine.setClientRole(ClientRoleType.ClientRoleAudience);

  const joinRc = engine.joinChannel(token, channelName, uid, {
    clientRoleType: ClientRoleType.ClientRoleAudience,
    publishCameraTrack: false,
    publishMicrophoneTrack: false,
    autoSubscribeAudio: true,
    autoSubscribeVideo: true,
  });
  if (joinRc < 0) {
    throw new Error(`Failed to join audience channel (${joinRc})`);
  }
  return engine;
}

export function destroyEngine(
  engine: IRtcEngine | null,
  eventHandler?: IRtcEngineEventHandler,
) {
  if (!engine) return;
  try {
    if (eventHandler) engine.unregisterEventHandler(eventHandler);
    engine.leaveChannel();
  } catch {}
  try {
    engine.release();
  } catch {}
}
