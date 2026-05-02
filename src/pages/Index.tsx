import { AppHeader } from "@/components/AppHeader";
import { PageNav } from "@/components/PageNav";
import { RegistrationSection } from "@/components/RegistrationSection";

const Index = () => {
  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="container mx-auto max-w-6xl px-4 py-10 md:py-14">
        <PageNav />
        <RegistrationSection />
      </main>
      <footer className="border-t border-border/40 py-6 text-center">
        <p className="font-mono text-[10px] tracking-[0.35em] text-muted-foreground">MYKACA$H · VERSÃO 2.0</p>
      </footer>
    </div>
  );
};

export default Index;
