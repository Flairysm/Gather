import { Alert } from "react-native";
import NetInfo from "@react-native-community/netinfo";

/**
 * Returns true if the device is online, false (with user alert) if offline.
 */
export async function requireNetwork(): Promise<boolean> {
  const info = await NetInfo.fetch();
  if (!info.isConnected) {
    Alert.alert(
      "No Connection",
      "You appear to be offline. Please check your connection and try again.",
    );
    return false;
  }
  return true;
}
