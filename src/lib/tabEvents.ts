// Lightweight pub/sub so the tab bar can notify the active screen when its
// own tab is tapped again (e.g. Instagram-style scroll-to-top / refresh).

type Listener = () => void;

const listeners = new Map<string, Set<Listener>>();

/** Subscribe to "tab tapped while already active". Returns an unsubscribe fn. */
export function onTabReselect(tabId: string, cb: Listener): () => void {
  let set = listeners.get(tabId);
  if (!set) {
    set = new Set();
    listeners.set(tabId, set);
  }
  set.add(cb);
  return () => {
    set?.delete(cb);
  };
}

/** Fire all listeners registered for a tab. */
export function emitTabReselect(tabId: string): void {
  listeners.get(tabId)?.forEach((cb) => {
    try {
      cb();
    } catch {
      /* listener errors are non-fatal */
    }
  });
}
