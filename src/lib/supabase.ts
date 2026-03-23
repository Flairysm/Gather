import { createClient } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabasePublishableKey =
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabasePublishableKey) {
  console.warn(
    "Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY. Auth will not work until these are set.",
  );
}

const memoryStore = new Map<string, string>();
const CHUNK_SIZE = 1800;

function chunkKey(key: string, index: number) {
  return `${key}__chunk_${index}`;
}

function countKey(key: string) {
  return `${key}__count`;
}

const safeStorage = {
  getItem: async (key: string) => {
    try {
      const countRaw = await SecureStore.getItemAsync(countKey(key));
      if (countRaw) {
        const count = Number.parseInt(countRaw, 10);
        if (!Number.isNaN(count) && count > 0) {
          const chunks = await Promise.all(
            Array.from({ length: count }, (_, i) =>
              SecureStore.getItemAsync(chunkKey(key, i)),
            ),
          );
          if (chunks.every((c) => typeof c === "string")) {
            return chunks.join("");
          }
        }
      }

      const value = await SecureStore.getItemAsync(key);
      return value ?? memoryStore.get(key) ?? null;
    } catch {
      return memoryStore.get(key) ?? null;
    }
  },
  setItem: async (key: string, value: string) => {
    try {
      if (value.length <= CHUNK_SIZE) {
        await SecureStore.setItemAsync(key, value);
        await SecureStore.deleteItemAsync(countKey(key));
      } else {
        const chunks: string[] = [];
        for (let i = 0; i < value.length; i += CHUNK_SIZE) {
          chunks.push(value.slice(i, i + CHUNK_SIZE));
        }

        await Promise.all(
          chunks.map((chunk, index) =>
            SecureStore.setItemAsync(chunkKey(key, index), chunk),
          ),
        );
        await SecureStore.setItemAsync(countKey(key), String(chunks.length));
        await SecureStore.deleteItemAsync(key);
      }
      memoryStore.set(key, value);
    } catch {
      memoryStore.set(key, value);
    }
  },
  removeItem: async (key: string) => {
    try {
      const countRaw = await SecureStore.getItemAsync(countKey(key));
      if (countRaw) {
        const count = Number.parseInt(countRaw, 10);
        if (!Number.isNaN(count) && count > 0) {
          await Promise.all(
            Array.from({ length: count }, (_, i) =>
              SecureStore.deleteItemAsync(chunkKey(key, i)),
            ),
          );
        }
        await SecureStore.deleteItemAsync(countKey(key));
      }
      await SecureStore.deleteItemAsync(key);
      memoryStore.delete(key);
    } catch {
      memoryStore.delete(key);
    }
  },
};

export const supabase = createClient(
  supabaseUrl ?? "https://example.supabase.co",
  supabasePublishableKey ?? "public-anon-key-placeholder",
  {
    auth: {
      storage: safeStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  },
);
