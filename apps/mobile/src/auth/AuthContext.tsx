import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  createApiClient,
  type AuthUser,
  type LoginRequest,
  type LoginResponse,
} from "@crm/core";

const API_URL =
  process.env.EXPO_PUBLIC_API_URL ??
  "http://localhost:4000";

const apiFetch = createApiClient(API_URL);

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
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);

  async function login(credentials: LoginRequest) {
    const response = await apiFetch<LoginResponse>(
      "/auth/login",
      null,
      {
        method: "POST",
        body: JSON.stringify(credentials),
      }
    );

    setToken(response.token);
    setUser(response.user);
  }

  function logout() {
    setToken(null);
    setUser(null);
  }

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