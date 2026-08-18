import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { LogOut, Shield } from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

export const AppHeader = () => {
  const { user, signOut, isAdmin } = useAuth();
  const [displayName, setDisplayName] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id) {
      setDisplayName(null);
      return;
    }
    supabase
      .from("profiles")
      .select("display_name, username")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        setDisplayName(data?.display_name || data?.username || null);
      });
  }, [user?.id]);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return "Bom dia";
    if (hour >= 12 && hour < 18) return "Boa tarde";
    return "Boa noite";
  };

  const greeting = getGreeting();
  const headerName = displayName ?? (user?.user_metadata as any)?.display_name ?? user?.email;

  return (
    <header className="relative overflow-hidden border-b border-border/60">
      <div className="absolute inset-0 grid-overlay opacity-50 pointer-events-none" />
      <div className="absolute -top-32 left-1/2 -translate-x-1/2 h-[500px] w-[900px] rounded-full bg-primary/20 blur-3xl animate-pulse-glow pointer-events-none" />
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/80 to-transparent" />

      {/* Header bar */}
      <div className="relative z-10 mx-auto w-full max-w-[1600px] px-2 md:px-4 lg:px-6 flex items-center justify-between gap-2 py-2 md:py-3 text-xs font-mono tracking-widest text-muted-foreground">
        <Link to="/" className="hover:opacity-80 transition-opacity shrink-0">
          <span className="font-title title-gradient title-shimmer font-normal leading-none tracking-normal text-xl sm:text-2xl md:text-3xl lg:text-4xl">
            MYKACA$H
          </span>
        </Link>

        <div className="flex items-center gap-1 sm:gap-3 md:gap-4 shrink-0 -translate-y-[1px]">
          <span className="hidden sm:inline">
            {greeting}, <span className="font-semibold text-foreground">{headerName}</span>!
          </span>
          {isAdmin && (
            <Button
              asChild
              size="sm"
              className="h-8 px-3 text-[10px] md:text-xs font-mono tracking-wider text-muted-foreground bg-transparent rounded-full border-0 gap-1 transition-all hover:animate-color-cycle hover:text-primary-foreground hover:shadow-md"
            >
              <Link to="/admin">
                <Shield className="mr-1 md:mr-1.5 h-3 w-3 md:h-3.5 md:w-3.5" />
                ADMIN
              </Link>
            </Button>
          )}
          <Button
            size="sm"
            onClick={signOut}
            className="h-8 px-3 text-[10px] md:text-xs font-mono tracking-wider text-muted-foreground bg-transparent rounded-full border-0 gap-1 transition-all hover:animate-color-cycle hover:text-primary-foreground hover:shadow-md"
          >
            <LogOut className="mr-1 md:mr-1.5 h-3 w-3 md:h-3.5 md:w-3.5" />
            SAIR
          </Button>
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
    </header>
  );
};
