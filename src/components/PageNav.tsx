import { Link, useLocation } from "react-router-dom";
import { FilePlus2, History, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";

import { useAuth } from "@/hooks/useAuth";

export const PageNav = () => {
  const { pathname } = useLocation();
  const { isAdmin } = useAuth();

  const items = [
    { to: "/cadastro", label: "CADASTRO", icon: FilePlus2 },
    { to: "/", label: "HISTÓRICO", icon: History },
    ...(isAdmin ? [{ to: "/financeiro", label: "FINANCEIRO", icon: Wallet }] : []),
  ];
  return (
    <nav className="mb-6 flex items-center justify-center gap-2 animate-fade-up">
      <div className="inline-flex rounded-full border border-border/60 bg-background/40 p-1 backdrop-blur-sm">
        {items.map((it) => {
          const active = pathname === it.to;
          const Icon = it.icon;
          return (
            <Link
              key={it.to}
              to={it.to}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 font-mono text-[9px] tracking-[0.2em] transition-all sm:gap-2 sm:px-5 sm:py-2 sm:text-[11px] sm:tracking-[0.3em]",
                active
                  ? "bg-primary text-primary-foreground shadow-[0_0_20px_hsl(var(--primary)/0.4)]"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {it.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
};
