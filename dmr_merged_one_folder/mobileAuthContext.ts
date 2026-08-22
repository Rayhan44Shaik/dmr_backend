import { createContext, useContext } from "react";
import type { MobileSupervisorProfile } from "./mobileAuthStorage";

export type MobileAuthContextValue = {
  loading: boolean;
  supervisor: MobileSupervisorProfile | null;
  expiresAt: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

export const MobileAuthContext = createContext<MobileAuthContextValue | null>(null);

export function useMobileAuth(): MobileAuthContextValue {
  const context = useContext(MobileAuthContext);
  if (!context) throw new Error("useMobileAuth must be used inside MobileAuthProvider");
  return context;
}
