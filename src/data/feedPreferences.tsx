import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { ALL_CATEGORIES } from "./categories";

type FeedPrefsContextValue = {
  selectedCategories: string[];
  setSelectedCategories: (cats: string[]) => void;
  toggleCategory: (key: string) => void;
  loading: boolean;
};

const allKeys = ALL_CATEGORIES.map((c) => c.key);

const FeedPrefsContext = createContext<FeedPrefsContextValue>({
  selectedCategories: allKeys,
  setSelectedCategories: () => {},
  toggleCategory: () => {},
  loading: true,
});

export function useFeedPreferences() {
  return useContext(FeedPrefsContext);
}

export function FeedPrefsProvider({ children }: { children: React.ReactNode }) {
  const [selected, setSelected] = useState<string[]>(allKeys);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data } = await supabase
          .from("profiles")
          .select("feed_categories")
          .eq("id", user.id)
          .maybeSingle();
        if (data?.feed_categories && Array.isArray(data.feed_categories)) {
          setSelected(data.feed_categories as string[]);
        }
      } catch {
        /* keep defaults */
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const persist = useCallback(async (cats: string[]) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { error } = await supabase
        .from("profiles")
        .update({ feed_categories: cats })
        .eq("id", user.id);
      if (error) console.warn("Feed preferences save failed:", error.message);
    } catch (e) {
      console.warn("Feed preferences save error:", e);
    }
  }, []);

  const setSelectedCategories = useCallback(
    (cats: string[]) => {
      setSelected(cats);
      persist(cats);
    },
    [persist],
  );

  const toggleCategory = useCallback(
    (key: string) => {
      setSelected((prev) => {
        const next = prev.includes(key)
          ? prev.filter((k) => k !== key)
          : [...prev, key];
        const result = next.length === 0 ? allKeys : next;
        persist(result);
        return result;
      });
    },
    [persist],
  );

  return (
    <FeedPrefsContext.Provider
      value={{ selectedCategories: selected, setSelectedCategories, toggleCategory, loading }}
    >
      {children}
    </FeedPrefsContext.Provider>
  );
}
