import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { api } from "@/lib/api";

interface UserProfile {
  id: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
  github_connected: boolean;
  vercel_connected: boolean;
  github_username: string | null;
  is_admin?: boolean;
}

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  signInWithGitHub: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  async function syncProfile(s?: Session | null) {
    const currentSession = s || session;
    try {
      const p = await api.get<UserProfile>("/auth/me");

      // If logged in via GitHub and we have a provider token, always send it
      // (handles both first connect and reconnect with a fresh token)
      if (currentSession?.provider_token) {
        const username = currentSession.user?.user_metadata?.user_name
          || currentSession.user?.user_metadata?.preferred_username;
        await api.post("/auth/github-token", {
          access_token: currentSession.provider_token,
          username,
        });
        const updated = await api.get<UserProfile>("/auth/me");
        setProfile(updated);
        return;
      }

      setProfile(p);
    } catch {
      try {
        const { data } = await supabase.auth.getUser();
        if (data.user) {
          const syncPayload: Record<string, string | undefined> = {
            email: data.user.email,
            name: data.user.user_metadata?.full_name || data.user.user_metadata?.name,
            avatar_url: data.user.user_metadata?.avatar_url,
          };

          // Include GitHub token on first sync if available
          if (currentSession?.provider_token) {
            syncPayload.github_access_token = currentSession.provider_token;
            syncPayload.github_username = data.user.user_metadata?.user_name
              || data.user.user_metadata?.preferred_username;
          }

          const p = await api.post<UserProfile>("/auth/sync", syncPayload);
          setProfile(p as unknown as UserProfile);
        }
      } catch { /* user will need to retry */ }
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session) {
      syncProfile(session);
    } else {
      setProfile(null);
    }
  }, [session]);

  const refreshProfile = async () => {
    await syncProfile();
  };

  const signInWithGitHub = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "github",
      options: {
        scopes: "repo read:user",
        redirectTo: window.location.origin,
      },
    });
  };

  const signInWithEmail = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const signUpWithEmail = async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        profile,
        loading,
        signInWithGitHub,
        signInWithEmail,
        signUpWithEmail,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
