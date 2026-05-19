import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";

type AuthCtx = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isAdmin: boolean;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthCtx>({
  user: null,
  session: null,
  loading: true,
  isAdmin: false,
  signOut: async () => {},
});

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let active = true;

    const checkAdmin = async (userId: string) => {
      try {
        const { data } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", userId)
          .eq("role", "admin")
          .maybeSingle();
        return !!data;
      } catch (err) {
        console.error("Error checking admin role:", err);
        return false;
      }
    };

    // Load initial session
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      const s = data.session;
      setSession(s);
      if (s?.user) {
        const adminVal = await checkAdmin(s.user.id);
        if (active) {
          setIsAdmin(adminVal);
          setLoading(false);
        }
      } else {
        setIsAdmin(false);
        setLoading(false);
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange(async (_evt, s) => {
      if (!active) return;
      setSession(s);
      if (s?.user) {
        const adminVal = await checkAdmin(s.user.id);
        if (active) {
          setIsAdmin(adminVal);
          setLoading(false);
        }
      } else {
        setIsAdmin(false);
        setLoading(false);
      }
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
    <Ctx.Provider value={{ user: session?.user ?? null, session, loading, isAdmin, signOut }}>
      {children}
    </Ctx.Provider>
  );
};

export const useAuth = () => useContext(Ctx);
