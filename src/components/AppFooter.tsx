import React from "react";
import { cn } from "@/lib/utils";

interface AppFooterProps {
  className?: string;
}

export const AppFooter = ({ className }: AppFooterProps) => {
  return (
    <footer className={cn("border-t border-border/40 py-4 text-center mt-auto", className)}>
      <p className="font-mono text-[10px] tracking-[0.35em] text-muted-foreground uppercase">
        MYKACA$H · VERSÃO 3.3
      </p>
    </footer>
  );
};

export default AppFooter;
