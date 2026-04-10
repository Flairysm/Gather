// Stub for react-native-agora so the app can run in Expo Go.
// All native calls are no-ops; the UI gate in TabNavigator prevents
// these code paths from actually executing.

const { View } = require("react-native");

const noop = () => {};
const noopEngine = {
  initialize: noop,
  registerEventHandler: noop,
  unregisterEventHandler: noop,
  enableVideo: noop,
  setChannelProfile: noop,
  setClientRole: noop,
  startPreview: noop,
  joinChannel: () => 0,
  leaveChannel: noop,
  release: noop,
  switchCamera: noop,
  setCameraTorchOn: noop,
  muteLocalAudioStream: noop,
};

module.exports = {
  createAgoraRtcEngine: () => noopEngine,
  RtcSurfaceView: View,
  ChannelProfileType: { ChannelProfileLiveBroadcasting: 1 },
  ClientRoleType: { ClientRoleBroadcaster: 1, ClientRoleAudience: 2 },
  RenderModeType: { RenderModeHidden: 1 },
  VideoSourceType: { VideoSourceCamera: 0, VideoSourceRemote: 1 },
};
