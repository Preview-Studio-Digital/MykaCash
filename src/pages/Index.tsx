import { AppHeader } from "@/components/AppHeader";
import { PageNav } from "@/components/PageNav";
import { RegistrationSection } from "@/components/RegistrationSection";

const Index = () => {
  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto w-full max-w-[1600px] px-4 md:px-8 lg:px-12 py-4 md:py-6">
        <PageNav />
        <RegistrationSection />
      </main>
      <footer className="border-t border-border/40 py-6 text-center">
        <p className="font-mono text-[10px] tracking-[0.35em] text-muted-foreground">MYKACA$H · VERSÃO 2.4</p>
      </footer>
    </div>
  );
};

export default Index;
