import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";
import type { UserProfile } from "@gitarena/shared";

import { fetchCurrentUser, loginWithGoogleIdToken, logoutUser } from "../api/client";

interface AuthContextValue {
  user: UserProfile | null;
  loading: boolean;
  loginWithGoogleToken: (idToken: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const run = async () => {
      try {
        const loadedUser = await fetchCurrentUser();
        setUser(loadedUser);
      } catch {
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      async loginWithGoogleToken(idToken: string) {
        const nextUser = await loginWithGoogleIdToken(idToken);
        setUser(nextUser);
      },
      async logout() {
        try {
          await logoutUser();
        } finally {
          setUser(null);
        }
      }
    }),
    [loading, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return context;
}
