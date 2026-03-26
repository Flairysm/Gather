import { useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";

/**
 * Fires `onReconnect` when the app returns to foreground (background → active).
 * Useful for re-fetching stale data after the user switches away and back.
 */
export function useReconnect(onReconnect: () => void) {
  const appState = useRef<AppStateStatus>(AppState.currentState);
  const cb = useRef(onReconnect);
  cb.current = onReconnect;

  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (appState.current.match(/inactive|background/) && next === "active") {
        cb.current();
      }
      appState.current = next;
    });
    return () => sub.remove();
  }, []);
}
