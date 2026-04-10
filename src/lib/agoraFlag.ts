import Constants from "expo-constants";

export const AGORA_DISABLED =
  process.env.EXPO_PUBLIC_DISABLE_AGORA === "true" ||
  Constants.appOwnership === "expo";
