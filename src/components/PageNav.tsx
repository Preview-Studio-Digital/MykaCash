import { Link, useLocation } from "react-router-dom";
import { FilePlus2, History, LineChart } from "lucide-react";
import { cn } from "@/lib/utils";

export const PageNav = () => {
  const { pathname } = useLocation();

  const items = [
    { to: "/cadastro", label: "CADASTRO", icon: FilePlus2 },
    { to: "/", label: "HISTÓRICO", icon: History },
    { to: "/analises", label: "ANÁLISES", icon: LineChart },
  ];

  return (
    <div className="sticky top-0 z-40 -mx-4 md:-mx-8 lg:-mx-12 mb-6 bg-background/80 backdrop-blur-md border-b border-border/40 py-3 animate-fade-up">
      <nav className="flex items-center justify-center gap-2">
        <div className="inline-flex rounded-full border border-border/60 bg-background/40 p-1 backdrop-blur-sm">
          {items.map((it) => {
            const active = pathname === it.to;
            const Icon = it.icon;
            return (
              <Link
                key={it.to}
                to={it.to}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 font-mono text-[11px] tracking-[0.2em] transition-all sm:gap-2 sm:px-5 sm:py-2 sm:text-xs sm:tracking-[0.3em]",
                  active
                    ? "animate-color-cycle text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {it.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
};
