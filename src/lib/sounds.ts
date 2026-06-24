export type SoundKind = "confirm" | "success" | "overdue";

export type SoundOption = { id: string; label: string; file: string };

export const SOUND_CATALOG: Record<SoundKind, SoundOption[]> = {
  confirm: [
    { id: "ding", label: "Ding", file: "/sounds/confirm-ding.wav" },
    { id: "chime", label: "Chime duplo", file: "/sounds/confirm-chime.wav" },
    { id: "pop", label: "Pop", file: "/sounds/confirm-pop.wav" },
    { id: "notify", label: "Notificação", file: "/sounds/confirm-notify.wav" },
    { id: "soft", label: "Suave", file: "/sounds/confirm-soft.wav" },
  ],
  success: [
    { id: "bell", label: "Sino", file: "/sounds/success-bell.wav" },
    { id: "chord", label: "Acorde", file: "/sounds/success-chord.wav" },
    { id: "cash", label: "Caixa registradora", file: "/sounds/success-cash.wav" },
    { id: "levelup", label: "Level up", file: "/sounds/success-levelup.wav" },
    { id: "shine", label: "Brilho", file: "/sounds/success-shine.wav" },
  ],
  overdue: [
    { id: "notify", label: "Notificação", file: "/sounds/confirm-notify.wav" },
    { id: "chime", label: "Chime duplo", file: "/sounds/confirm-chime.wav" },
    { id: "ding", label: "Ding", file: "/sounds/confirm-ding.wav" },
    { id: "pop", label: "Pop", file: "/sounds/confirm-pop.wav" },
    { id: "soft", label: "Suave", file: "/sounds/confirm-soft.wav" },
  ],
};

export type SoundPrefs = {
  enabled: boolean;
  volume: number; // 0..1
  confirm: string;
  success: string;
  overdue: string;
  overdueVolume: number; // 0..1
};

const STORAGE_KEY = "mikacash:sound-prefs";

export const DEFAULT_PREFS: SoundPrefs = {
  enabled: true,
  volume: 0.7,
  confirm: "chime",
  success: "bell",
  overdue: "notify",
  overdueVolume: 0.8,
};

export function loadPrefs(): SoundPrefs {
  if (typeof window === "undefined") return DEFAULT_PREFS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_PREFS, ...parsed };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function savePrefs(prefs: SoundPrefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}

export function playSound(kind: SoundKind, overridePrefs?: SoundPrefs) {
  const prefs = overridePrefs ?? loadPrefs();
  if (!prefs.enabled) return;
  const id = prefs[kind];
  const opt = SOUND_CATALOG[kind].find((o) => o.id === id) ?? SOUND_CATALOG[kind][0];
  if (!opt) return;
  try {
    const audio = new Audio(opt.file);
    const soundVolume = kind === "overdue" ? (prefs.overdueVolume ?? 0.8) : prefs.volume;
    audio.volume = Math.max(0, Math.min(1, soundVolume));
    void audio.play().catch(() => {});
  } catch {
    /* ignore */
  }
}

export function previewSound(file: string, volume: number) {
  try {
    const audio = new Audio(file);
    audio.volume = Math.max(0, Math.min(1, volume));
    void audio.play().catch(() => {});
  } catch {
    /* ignore */
  }
}
