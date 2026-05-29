import { useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Play, RotateCcw, Volume2 } from "lucide-react";
import {
  DEFAULT_PREFS,
  SOUND_CATALOG,
  SoundKind,
  SoundPrefs,
  loadPrefs,
  previewSound,
  savePrefs,
} from "@/lib/sounds";
import { toast } from "sonner";

export default function Configuracoes() {
  const [prefs, setPrefs] = useState<SoundPrefs>(() => loadPrefs());

  const update = (patch: Partial<SoundPrefs>) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    savePrefs(next);
  };

  const preview = (kind: SoundKind) => {
    const opt = SOUND_CATALOG[kind].find((o) => o.id === prefs[kind]);
    if (opt) previewSound(opt.file, prefs.volume);
  };

  const reset = () => {
    setPrefs(DEFAULT_PREFS);
    savePrefs(DEFAULT_PREFS);
    toast.success("Configurações restauradas");
  };

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

        <section className="rounded-lg border border-border/60 bg-card/40 p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="enabled" className="text-base">Alertas sonoros</Label>
              <p className="text-xs text-muted-foreground">
                Tocar sons ao abrir confirmação e ao salvar operação.
              </p>
            </div>
            <Switch
              id="enabled"
              checked={prefs.enabled}
              onCheckedChange={(v) => update({ enabled: v })}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2">
                <Volume2 className="h-4 w-4" /> Volume
              </Label>
              <span className="text-sm tabular-nums text-muted-foreground">
                {Math.round(prefs.volume * 100)}%
              </span>
            </div>
            <Slider
              value={[Math.round(prefs.volume * 100)]}
              onValueChange={([v]) => update({ volume: v / 100 })}
              max={100}
              step={5}
              disabled={!prefs.enabled}
            />
          </div>
        </section>

        {(["confirm", "success"] as const).map((kind) => (
          <section
            key={kind}
            className="rounded-lg border border-border/60 bg-card/40 p-6 space-y-3"
          >
            <div>
              <Label className="text-base">
                {kind === "confirm" ? "Som de confirmação (ao abrir tela)" : "Som de sucesso (ao salvar)"}
              </Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                {kind === "confirm"
                  ? "Tocado quando a tela de confirmação da operação aparece."
                  : "Tocado quando uma operação nova ou editada é salva com sucesso."}
              </p>
            </div>
            <div className="flex gap-2">
              <Select
                value={prefs[kind]}
                onValueChange={(v) => update({ [kind]: v } as any)}
                disabled={!prefs.enabled}
              >
                <SelectTrigger className="flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SOUND_CATALOG[kind].map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="icon"
                onClick={() => preview(kind)}
                disabled={!prefs.enabled}
                title="Ouvir prévia"
              >
                <Play className="h-4 w-4" />
              </Button>
            </div>
          </section>
        ))}

        <div className="flex justify-end">
          <Button variant="outline" onClick={reset}>
            <RotateCcw className="h-4 w-4 mr-2" />
            Restaurar padrões
          </Button>
        </div>
      </main>
    </div>
  );
}
