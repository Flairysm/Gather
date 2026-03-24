import { createContext, useContext } from "react";
import { supabase } from "../lib/supabase";

export type VendorStatus = "none" | "pending" | "approved" | "rejected";

export type UserContextValue = {
  isVerifiedVendor: boolean;
  vendorStatus: VendorStatus;
  setVendorStatus: (status: VendorStatus) => void;
};

export const UserContext = createContext<UserContextValue>({
  isVerifiedVendor: false,
  vendorStatus: "none",
  setVendorStatus: () => {},
});

export function useUser() {
  return useContext(UserContext);
}

export async function fetchVendorStatus(): Promise<VendorStatus> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return "none";

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("verified_seller")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) throw profileError;
  if (profile?.verified_seller) return "approved";

  const { data: app, error: appError } = await supabase
    .from("vendor_applications")
    .select("status")
    .eq("profile_id", user.id)
    .maybeSingle();

  if (appError) throw appError;

  const status = (app?.status ?? "").toLowerCase();
  if (status === "pending") return "pending";
  if (status === "rejected") return "rejected";
  return "none";
}
