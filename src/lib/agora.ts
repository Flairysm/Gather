import {
  ChannelProfileType,
  ClientRoleType,
  createAgoraRtcEngine,
  type IRtcEngine,
  type IRtcEngineEventHandler,
} from "react-native-agora";
import { supabase } from "./supabase";

export interface AgoraTokenResult {
  token: string;
  uid: number;
  appId: string;
}

export async function fetchAgoraToken(
  channelName: string,
  role: "publisher" | "subscriber",
): Promise<AgoraTokenResult> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Not authenticated");

  // Use Supabase client invoke so auth headers/session handling are consistent.
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

