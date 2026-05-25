import { AppHeader } from "@/components/AppHeader";
import { PageNav } from "@/components/PageNav";
import { AccountCashFlow } from "@/components/AccountCashFlow";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

const Financeiro = () => {
  const { isAdmin, loading, session } = useAuth();

  if (loading) return null;
  if (!session) return <Navigate to="/login" replace />;
  // if (!isAdmin) return <Navigate to="/" replace />;

  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto w-full max-w-[1600px] px-4 md:px-8 lg:px-12 py-4 md:py-6">
        <PageNav />
        <AccountCashFlow />
      </main>
      <footer className="border-t border-border/40 py-6 text-center">
        <p className="font-mono text-[10px] tracking-[0.35em] text-muted-foreground">MYKACA$H · VERSÃO 2.5</p>
      </footer>
    </div>
  );
};

export default Financeiro;
