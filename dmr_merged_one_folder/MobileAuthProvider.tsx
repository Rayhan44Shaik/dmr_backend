import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  clearMobileSession,
  loadMobileSession,
  saveMobileSession,
  type MobileSupervisorProfile,
} from "./mobileAuthStorage";
import { MobileAuthContext } from "./mobileAuthContext";
import {
  asMobileApiError,
  mobileLogin,
  mobileLogout,
  mobileMe,
  setMobileAccessToken,
} from "../services/mobileApiClient";

export default function MobileAuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [supervisor, setSupervisor] = useState<MobileSupervisorProfile | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const stored = await loadMobileSession();
      if (!stored || cancelled) {
        setLoading(false);
        return;
      }

      setMobileAccessToken(stored.token);
      setSupervisor(stored.supervisor);
      setExpiresAt(stored.expiresAt);

      try {
        const current = await mobileMe();
        if (cancelled) return;
        const refreshed = {
          token: stored.token,
          expiresAt: current.expiresAt,
          supervisor: current.supervisor,
        };
        await saveMobileSession(refreshed);
        setSupervisor(current.supervisor);
        setExpiresAt(current.expiresAt);
      } catch (error) {
        const apiError = asMobileApiError(error);
        // Office unreachability must not destroy a still-valid offline session.
        if (apiError.status === 401 || apiError.status === 403) {
          await clearMobileSession();
          setMobileAccessToken(null);
          if (!cancelled) {
            setSupervisor(null);
            setExpiresAt(null);
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const session = await mobileLogin(username, password);
    await saveMobileSession(session);
    setMobileAccessToken(session.token);
    setSupervisor(session.supervisor);
    setExpiresAt(session.expiresAt);
  }, []);

  const logout = useCallback(async () => {
    try {
      await mobileLogout();
    } catch {
      // Local logout still completes when the office is unavailable. The
      // server-side session expires automatically and can be revoked later.
    } finally {
      await clearMobileSession();
      setMobileAccessToken(null);
      setSupervisor(null);
      setExpiresAt(null);
    }
  }, []);

  const value = useMemo(
    () => ({ loading, supervisor, expiresAt, login, logout }),
    [expiresAt, loading, login, logout, supervisor]
  );

  return <MobileAuthContext.Provider value={value}>{children}</MobileAuthContext.Provider>;
}
