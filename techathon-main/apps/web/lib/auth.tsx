"use client";
// Client-side auth context: holds the signed-in account, restores the session
// from a stored token on load, and exposes login/logout. Pages use `useAuth()`
// for the account and `useRequireRole()` to guard access.
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiLogin, apiLogout, apiSignup, clearToken, getMe, getToken, setToken } from "./api";
import type { Account, Role } from "./types";

type AuthResult = { ok: boolean; error?: string; account?: Account };

interface AuthContextValue {
  account: Account | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<AuthResult>;
  signup: (name: string, email: string, password: string) => Promise<AuthResult>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [account, setAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      if (!getToken()) {
        setLoading(false);
        return;
      }
      const me = await getMe();
      if (!me) clearToken();
      setAccount(me);
      setLoading(false);
    })();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await apiLogin(email, password);
    if (res.ok && res.token && res.account) {
      setToken(res.token);
      setAccount(res.account);
      return { ok: true, account: res.account };
    }
    return { ok: false, error: res.error };
  }, []);

  const signup = useCallback(async (name: string, email: string, password: string) => {
    const res = await apiSignup(name, email, password);
    if (res.ok && res.token && res.account) {
      setToken(res.token);
      setAccount(res.account);
      return { ok: true, account: res.account };
    }
    return { ok: false, error: res.error };
  }, []);

  const logout = useCallback(async () => {
    await apiLogout();
    clearToken();
    setAccount(null);
    // Hard-navigate to /login so the whole app state resets cleanly. A pure SPA
    // replace can race the per-page role guards (the home route's guard fires as
    // `account` flips to null), which on the customer home (homeForRole = "/")
    // could bounce back and forth. A full load lands on /login with no token.
    if (typeof window !== "undefined") window.location.href = "/login";
  }, []);

  return (
    <AuthContext.Provider value={{ account, loading, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}

/** Default landing route for a role (used after login + for redirects). */
export function homeForRole(role: Role): string {
  if (role === "admin") return "/tickets";
  if (role === "agent") return "/escalations";
  return "/";
}

/**
 * Guard a page to one or more roles. Redirects to /login if signed out, or to
 * the account's home route if the role isn't allowed. Returns the account once
 * it's confirmed allowed (null while resolving).
 */
export function useRequireRole(...roles: Role[]): Account | null {
  const { account, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!account) {
      router.replace("/login");
      return;
    }
    if (roles.length && !roles.includes(account.role)) {
      router.replace(homeForRole(account.role));
    }
  }, [account, loading, roles, router]);

  if (loading || !account) return null;
  if (roles.length && !roles.includes(account.role)) return null;
  return account;
}
