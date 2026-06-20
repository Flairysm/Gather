import { useEffect, useState } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ActivityIndicator, View } from "react-native";
import { StripeProvider } from "@stripe/stripe-react-native";
import TabNavigator from "./src/navigation/TabNavigator";
import AuthScreen from "./src/screens/AuthScreen";
import { supabase } from "./src/lib/supabase";
import { STRIPE_PUBLISHABLE_KEY, STRIPE_URL_SCHEME } from "./src/lib/stripe";
import { C } from "./src/theme";
import type { Session } from "@supabase/supabase-js";

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    let mounted = true;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return;
      setSession(nextSession);
      setCheckingSession(false);
    });

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setCheckingSession(false);
    });

    const loadingTimeout = setTimeout(() => {
      if (mounted) setCheckingSession(false);
    }, 8000);

    return () => {
      mounted = false;
      clearTimeout(loadingTimeout);
      subscription.unsubscribe();
    };
  }, []);

  return (
    <StripeProvider
      publishableKey={STRIPE_PUBLISHABLE_KEY}
      urlScheme={STRIPE_URL_SCHEME}
    >
      <SafeAreaProvider>
        {checkingSession ? (
          <View
            style={{
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: C.bg,
            }}
          >
            <ActivityIndicator size="large" color={C.accent} />
          </View>
        ) : session ? (
          <TabNavigator />
        ) : (
          <AuthScreen />
        )}
      </SafeAreaProvider>
    </StripeProvider>
  );
}
