import { useCallback, useRef, useState } from "react";
import { Alert } from "react-native";
import NetInfo from "@react-native-community/netinfo";

type ActionState = "idle" | "loading" | "error";

/**
 * Wraps an async action with network check, loading state, and retry.
 * Returns [execute, state, retry] where retry re-runs the last failed action.
 */
export function useNetworkAction<T extends (...args: any[]) => Promise<void>>(
  action: T,
  opts?: { silentRetry?: boolean },
): [T, ActionState, () => void] {
  const [state, setState] = useState<ActionState>("idle");
  const lastArgs = useRef<any[]>([]);

  const execute = useCallback(
    async (...args: any[]) => {
      lastArgs.current = args;
      const info = await NetInfo.fetch();
      if (!info.isConnected) {
        setState("error");
        Alert.alert(
          "No Connection",
          "You appear to be offline. Check your connection and try again.",
          [{ text: "OK" }],
        );
        return;
      }
      setState("loading");
      try {
        await action(...args);
        setState("idle");
      } catch (err: any) {
        setState("error");
        if (!opts?.silentRetry) {
          Alert.alert("Action Failed", err?.message ?? "Something went wrong. Tap retry to try again.");
        }
      }
    },
    [action, opts?.silentRetry],
  ) as unknown as T;

  const retry = useCallback(() => {
    execute(...lastArgs.current);
  }, [execute]);

  return [execute, state, retry];
}
