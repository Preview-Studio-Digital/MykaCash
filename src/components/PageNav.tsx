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
    <div className="sticky top-0 z-40 mb-4 md:mb-6 py-2 animate-fade-up">
      <nav className="flex items-center justify-center gap-2 px-2">
        <div className="inline-flex max-w-full rounded-full border border-border/60 bg-background/80 p-1 sm:p-1.5 backdrop-blur-md shadow-lg shadow-black/40">
          {items.map((it) => {
            const active = pathname === it.to;
            const Icon = it.icon;
            return (
              <Link
                key={it.to}
                to={it.to}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2 py-1.5 font-mono text-[10px] tracking-[0.12em] transition-all sm:gap-2 sm:px-5 sm:py-2 sm:text-xs sm:tracking-[0.3em]",
                  active
                    ? "animate-color-cycle text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                {it.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
};
