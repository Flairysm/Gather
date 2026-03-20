import { createContext, useContext } from "react";

export type VendorStatus = "none" | "pending" | "approved";

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
