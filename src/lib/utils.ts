import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getMobileXAxisTicks(dates: string[]): string[] {
  if (dates.length === 0) return [];
  const ticks = new Set<string>();
  for (let i = 1; i < dates.length; i++) {
    const prevM = dates[i - 1].slice(0, 7);
    const currM = dates[i].slice(0, 7);
    if (prevM !== currM && dates[i] !== "agora") {
      ticks.add(dates[i]);
    }
  }
  const midIdx = Math.floor((dates.length - 1) / 2);
  const mid = dates[midIdx];
  if (mid && mid !== "agora") ticks.add(mid);
  return Array.from(ticks).sort();
}

