import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  type AuthUser,
  type LoginRequest,
  type LoginResponse,
} from "@crm/core";

import { apiFetch, setUnauthorizedHandler } from "../api";
import {
  clearSession,
  loadSession,
  saveSession,
} from "./sessionStorage";
import type { StoredSession } from "./sessionStorage.types";

type AuthContextValue = {
  token: string | null;
  user: AuthUser | null;
  isAuthenticated: boolean;
  login: (credentials: LoginRequest) => Promise<void>;
  logout: () => void;
};

const AuthContext =
  createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [session, setSession] = useState<StoredSession | null>(() =>
    loadSession()
  );

  const token = session?.token ?? null;
  const user = session?.user ?? null;

  async function login(credentials: LoginRequest) {
    const response = await apiFetch<LoginResponse>(
      "/auth/login",
      null,
      {
        method: "POST",
        body: JSON.stringify(credentials),
      }
    );

    const next: StoredSession = { token: response.token, user: response.user };

    saveSession(next);
    setSession(next);
  }

  function logout() {
    clearSession();
    setSession(null);
  }

  // Any request that comes back 401 (expired or revoked token) logs the user
  // out, so a dead session surfaces as the login screen rather than errors on
  // every screen. Registered once; re-registered if logout changes identity.
  useEffect(() => {
    setUnauthorizedHandler(logout);
    return () => setUnauthorizedHandler(undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo(
    () => ({
      token,
      user,
      isAuthenticated: Boolean(token),
      login,
      logout,
    }),
    [token, user]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error(
      "useAuth must be used inside AuthProvider"
    );
  }

  return context;
}