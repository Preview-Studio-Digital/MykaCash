import { AppHeader } from "@/components/AppHeader";
import { AppFooter } from "@/components/AppFooter";
import SoundSettings from "@/components/SoundSettings";

export default function Configuracoes() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <AppHeader />
      <main className="container max-w-3xl py-8 space-y-8 flex-1">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <span className="h-2 w-2 rounded-full animate-color-cycle" />
            <h2 className="font-mono text-sm sm:text-base md:text-lg tracking-[0.2em] font-bold uppercase">
              CONFIGURAÇÕES
            </h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Personalize os alertas sonoros do sistema.
          </p>
        </div>
        <SoundSettings />
      </main>
      <AppFooter />
    </div>
  );
}
