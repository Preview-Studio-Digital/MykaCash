import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { LogOut, Shield } from "lucide-react";
import { Link } from "react-router-dom";

export const AppHeader = () => {
  const { user, signOut, isAdmin } = useAuth();
  const usernameMeta = (user?.user_metadata as any)?.username as string | undefined;

  return (
    <header className="relative overflow-hidden border-b border-border/60">
      <div className="absolute inset-0 grid-overlay opacity-50 pointer-events-none" />
      <div className="absolute -top-32 left-1/2 -translate-x-1/2 h-[500px] w-[900px] rounded-full bg-primary/20 blur-3xl animate-pulse-glow pointer-events-none" />
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/80 to-transparent" />

      {/* User bar */}
      <div className="relative z-10 flex items-center justify-between px-6 pt-5 text-xs font-mono tracking-widest text-muted-foreground">
        <span className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-net-green shadow-[0_0_10px_hsl(var(--net-green))] animate-pulse-glow" />
          SISTEMA ONLINE
        </span>
        <div className="flex items-center gap-4">
          <span className="hidden sm:inline">{usernameMeta ?? user?.email}</span>
          {isAdmin && (
            <Button asChild variant="ghost" size="sm" className="h-8 px-3 text-xs font-mono tracking-wider hover:text-primary">
              <Link to="/admin">
                <Shield className="mr-1.5 h-3.5 w-3.5" />
                ADMIN
              </Link>
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={signOut}
            className="h-8 px-3 text-xs font-mono tracking-wider hover:text-primary"
          >
            <LogOut className="mr-1.5 h-3.5 w-3.5" />
            SAIR
          </Button>
        </div>
      </div>

      {/* Hero title block — three lines centered and vertically aligned */}
      <div className="relative z-10 flex flex-col items-center justify-center px-6 py-14 md:py-20 text-center">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-4 py-1.5 backdrop-blur-sm">
          <span className="h-1.5 w-1.5 rounded-full bg-primary-glow animate-pulse-glow" />
          <span className="font-mono text-[10px] tracking-[0.35em] text-primary-foreground/90">
            ADIANTAMENTO DE RECEBÍVEIS
          </span>
        </div>

        <h1 className="font-title title-gradient font-extrabold leading-[0.9] tracking-tighter animate-fade-up text-6xl">
          MYKA MONEY
        </h1>


        <p className="mt-2 font-mono text-xs tracking-[0.4em] text-muted-foreground animate-fade-up">
          VERSÃO 1.0
        </p>
      </div>

      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
    </header>
  );
};
