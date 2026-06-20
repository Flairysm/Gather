import { useState } from "react";
import { Alert, Linking, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { Feather, Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { C, S } from "../theme";

type Props = { onBack: () => void };

// Evend's support channel for now is Instagram DMs. Update the handle here if it
// changes; the rest of the screen reads from these constants.
const INSTAGRAM_HANDLE = "evend.gg";
const INSTAGRAM_WEB = `https://instagram.com/${INSTAGRAM_HANDLE}`;
const INSTAGRAM_APP = `instagram://user?username=${INSTAGRAM_HANDLE}`;
const SUPPORT_EMAIL = "support@evend.gg";

async function openInstagram() {
  try {
    const canApp = await Linking.canOpenURL(INSTAGRAM_APP);
    await Linking.openURL(canApp ? INSTAGRAM_APP : INSTAGRAM_WEB);
  } catch {
    Linking.openURL(INSTAGRAM_WEB).catch(() =>
      Alert.alert(
        "Couldn't open Instagram",
        `Please reach us at @${INSTAGRAM_HANDLE} or email ${SUPPORT_EMAIL}.`,
      ),
    );
  }
}

function openEmailSupport() {
  Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=Evend%20Support`).catch(() =>
    Alert.alert("Couldn't open email", `Please email us at ${SUPPORT_EMAIL}.`),
  );
}

type Faq = { q: string; a: string };

const FAQS: Faq[] = [
  {
    q: "How do I buy a card?",
    a: "Browse the Market or a seller's store, add items to your cart, then tap Checkout. Choose a shipping address, apply a voucher if you have one, and pay securely by card. You'll get an order confirmation and can track it under Profile → My Orders.",
  },
  {
    q: "What payment methods can I use?",
    a: "Payments are processed securely by Stripe — debit/credit cards, FPX, and supported e-wallets. You can also apply DropsTCG voucher credit at checkout to reduce the amount charged.",
  },
  {
    q: "How does shipping work?",
    a: "A flat shipping fee is added per seller at checkout (West Malaysia or East Malaysia rate). Once a seller ships, they add a tracking number so you can follow your parcel from My Orders.",
  },
  {
    q: "How do vouchers work?",
    a: "Redeem a DropsTCG voucher code under Profile → My Vouchers. The credit is held in your account and you can apply it at checkout — partial use is supported, and any remaining balance stays on the voucher for next time.",
  },
  {
    q: "When is my order protected / can I get a refund?",
    a: "Every order is covered by Buyer Protection. Your payment is held in escrow until you receive the item and the dispute window closes. If something's wrong, open a dispute from the order before the window ends and our team will review it.",
  },
  {
    q: "How do I become a seller?",
    a: "Go to Profile → Become a Seller and submit a vendor application. Once approved, you'll get a Vendor Hub to list cards, manage orders, and request payouts.",
  },
  {
    q: "How do seller payouts work?",
    a: "After an order is delivered and the dispute window closes, the funds become available in your Vendor Hub balance. Add your bank account, then request a withdrawal — the Evend team transfers it to your bank. A 5% platform fee applies, so you receive 95% of your earnings.",
  },
  {
    q: "How long do payouts take?",
    a: "Withdrawal requests are processed manually by the Evend team, usually within a few business days. You'll be notified once your payout is marked paid.",
  },
  {
    q: "I still need help — how do I contact Evend?",
    a: "Message us on Instagram (@evend.gg) and our team will get back to you. Tap the button at the top of this screen to open our profile.",
  },
];

export default function HelpCentreScreen({ onBack }: Props) {
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState<number | null>(0);

  return (
    <SafeAreaView style={st.safe}>
      <StatusBar style="light" />

      <View style={st.header}>
        <Pressable style={st.backBtn} onPress={onBack}>
          <Feather name="arrow-left" size={20} color={C.textPrimary} />
        </Pressable>
        <Text style={st.headerTitle}>Help Centre</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[st.scroll, { paddingBottom: Math.max(insets.bottom, 24) + 24 }]}
      >
        {/* ── Contact card ── */}
        <View style={st.contactCard}>
          <View style={st.contactIcon}>
            <Ionicons name="logo-instagram" size={24} color={C.accent} />
          </View>
          <Text style={st.contactTitle}>Need a hand?</Text>
          <Text style={st.contactSub}>
            Message us on Instagram and the Evend team will help you out.
          </Text>
          <Pressable style={st.contactBtn} onPress={openInstagram}>
            <Ionicons name="logo-instagram" size={18} color={C.textHero} />
            <Text style={st.contactBtnText}>Message @{INSTAGRAM_HANDLE}</Text>
          </Pressable>
          <Pressable style={st.emailBtn} onPress={openEmailSupport}>
            <Ionicons name="mail-outline" size={18} color={C.textAccent} />
            <Text style={st.emailBtnText}>Email support</Text>
          </Pressable>
        </View>

        {/* ── FAQ ── */}
        <Text style={st.sectionTitle}>Frequently asked questions</Text>
        <View style={st.faqCard}>
          {FAQS.map((f, i) => {
            const expanded = open === i;
            return (
              <View key={f.q}>
                {i > 0 && <View style={st.faqDivider} />}
                <Pressable style={st.faqRow} onPress={() => setOpen(expanded ? null : i)}>
                  <Text style={st.faqQ}>{f.q}</Text>
                  <Ionicons
                    name={expanded ? "chevron-up" : "chevron-down"}
                    size={18}
                    color={C.textMuted}
                  />
                </Pressable>
                {expanded && <Text style={st.faqA}>{f.a}</Text>}
              </View>
            );
          })}
        </View>

        <Text style={st.footerNote}>
          Still stuck? Reach us on Instagram @{INSTAGRAM_HANDLE} — we're happy to help.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },

  header: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: S.screenPadding, paddingVertical: S.md,
    gap: S.md, borderBottomWidth: 1, borderBottomColor: C.border,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: C.elevated, borderWidth: 1, borderColor: C.border,
    alignItems: "center", justifyContent: "center",
  },
  headerTitle: { flex: 1, color: C.textPrimary, fontSize: 16, fontWeight: "800", textAlign: "center" },

  scroll: { paddingHorizontal: S.screenPadding, paddingTop: S.lg },

  contactCard: {
    backgroundColor: C.accentGlow, borderRadius: S.radiusCard,
    borderWidth: 1, borderColor: C.borderStream, padding: S.xl, alignItems: "center", gap: 6,
  },
  contactIcon: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.borderStream,
    alignItems: "center", justifyContent: "center", marginBottom: 4,
  },
  contactTitle: { color: C.textPrimary, fontSize: 17, fontWeight: "900" },
  contactSub: { color: C.textSecondary, fontSize: 13, fontWeight: "500", textAlign: "center", lineHeight: 18 },
  contactBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: C.accent, borderRadius: S.radiusSmall,
    paddingVertical: 13, paddingHorizontal: 20, marginTop: 10, alignSelf: "stretch",
  },
  contactBtnText: { color: C.textHero, fontSize: 14, fontWeight: "800" },
  emailBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: C.surface, borderRadius: S.radiusSmall,
    borderWidth: 1, borderColor: C.borderStream,
    paddingVertical: 12, paddingHorizontal: 20, marginTop: 8, alignSelf: "stretch",
  },
  emailBtnText: { color: C.textAccent, fontSize: 14, fontWeight: "800" },

  sectionTitle: { color: C.textPrimary, fontSize: 15, fontWeight: "800", marginTop: S.xl, marginBottom: S.md },

  faqCard: {
    backgroundColor: C.surface, borderRadius: S.radiusCard,
    borderWidth: 1, borderColor: C.border, paddingHorizontal: S.lg,
  },
  faqDivider: { height: 1, backgroundColor: C.border },
  faqRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: S.md, paddingVertical: 16 },
  faqQ: { flex: 1, color: C.textPrimary, fontSize: 14, fontWeight: "700" },
  faqA: { color: C.textSecondary, fontSize: 13, fontWeight: "500", lineHeight: 19, paddingBottom: 16 },

  footerNote: { color: C.textMuted, fontSize: 12, fontWeight: "500", textAlign: "center", marginTop: S.xl, lineHeight: 17 },
});
