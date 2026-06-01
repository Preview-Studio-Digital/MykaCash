import { AppHeader } from "@/components/AppHeader";
import SoundSettings from "@/components/SoundSettings";

export default function Configuracoes() {
  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="container max-w-3xl py-8 space-y-8">
        <div>
          <h2 className="font-display text-2xl tracking-wide">CONFIGURAÇÕES</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Personalize os alertas sonoros do sistema.
          </p>
        </div>
        <SoundSettings />
      </main>
    </div>
  );
}
