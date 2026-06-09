import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";

type AuthCtx = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isAdmin: boolean;
  isAdminLoading: boolean;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthCtx>({
  user: null,
  session: null,
  loading: true,
  isAdmin: false,
  isAdminLoading: true,
  signOut: async () => {},
});

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isAdminLoading, setIsAdminLoading] = useState(true);

  useEffect(() => {
    let active = true;
    let lastUserId: string | null = null;

    const checkAdminRole = async (userId: string) => {
      if (!active) return;
      setIsAdminLoading(true);
      try {
        const { data } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", userId)
          .eq("role", "admin")
          .maybeSingle();
        if (active) {
          setIsAdmin(!!data);
        }
      } catch (err) {
        console.error("Error checking admin role:", err);
        if (active) {
          setIsAdmin(false);
        }
      } finally {
        if (active) {
          setIsAdminLoading(false);
        }
      }
    };

    const applySession = (s: Session | null) => {
      const newUserId = s?.user?.id ?? null;
      // Only update session state if the user identity actually changed.
      // This prevents TOKEN_REFRESHED / focus events from re-rendering the
      // tree and remounting pages (which caused the "load twice" delay).
      if (newUserId !== lastUserId) {
        lastUserId = newUserId;
        setSession(s);
        if (newUserId) {
          checkAdminRole(newUserId);
        } else {
          setIsAdmin(false);
          setIsAdminLoading(false);
        }
      }
      // Same user — do not update session state to avoid re-render cascades
      // (token refreshes are handled internally by the supabase client).
    };

    // Load initial session (with minimum 1s loading screen)
    const minDelay = new Promise((r) => setTimeout(r, 1000));
    Promise.all([supabase.auth.getSession(), minDelay]).then(([{ data }]) => {
      if (!active) return;
      applySession(data.session);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_evt, s) => {
      if (!active) return;
      applySession(s);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);


  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <Ctx.Provider value={{ user: session?.user ?? null, session, loading, isAdmin, isAdminLoading, signOut }}>
      {children}
    </Ctx.Provider>
  );
};

export const useAuth = () => useContext(Ctx);
