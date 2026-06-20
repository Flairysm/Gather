// Lightweight global pub/sub for cross-screen refreshes.
//
// The navigation stack keeps screens mounted underneath overlays, so a screen
// (e.g. VendorHub) needs a way to know when data it owns changed on another
// screen (e.g. EditListing saved). Screens subscribe to a string key and
// re-fetch when it fires.

type Listener = () => void;

const listeners = new Map<string, Set<Listener>>();

/** Subscribe to an app event key. Returns an unsubscribe fn. */
export function onAppEvent(key: string, cb: Listener): () => void {
  let set = listeners.get(key);
  if (!set) {
    set = new Set();
    listeners.set(key, set);
  }
  set.add(cb);
  return () => {
    set?.delete(cb);
  };
}

/** Fire all listeners registered for a key. */
export function emitAppEvent(key: string): void {
  listeners.get(key)?.forEach((cb) => {
    try {
      cb();
    } catch {
      /* listener errors are non-fatal */
    }
  });
}

export const APP_EVENTS = {
  listingsChanged: "listings:changed",
} as const;
