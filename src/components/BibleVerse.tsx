import React, { useEffect, useState } from "react";
import { BookOpen } from "lucide-react";

interface Verse {
  text: string;
  book: string;
  chapter: number;
  number: number;
}

export const BibleVerse = () => {
  const [verse, setVerse] = useState<Verse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchVerse = async () => {
      try {
        // Using abibliadigital API for Portuguese verses
        const response = await fetch("https://www.abibliadigital.com.br/api/verses/nvi/random");
        const data = await response.json();
        setVerse({
          text: data.text,
          book: data.book.name,
          chapter: data.chapter,
          number: data.number
        });
      } catch (error) {
        console.error("Erro ao buscar versículo:", error);
        // Fallback verse in case of API failure
        setVerse({
          text: "O Senhor é o meu pastor; nada me faltará.",
          book: "Salmos",
          chapter: 23,
          number: 1
        });
      } finally {
        setLoading(false);
      }
    };

    fetchVerse();
  }, []);

  if (loading) return (
    <div className="flex justify-center py-2 animate-pulse">
      <div className="h-4 w-64 bg-muted/40 rounded-full" />
    </div>
  );

  if (!verse) return null;

  return (
    <div className="flex flex-col items-center justify-center px-6 py-2 text-center animate-fade-in">
      <div className="flex items-center gap-2 mb-1">
        <div className="h-px w-8 bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
        <BookOpen className="h-3 w-3 text-primary/60" />
        <div className="h-px w-8 bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
      </div>
      <p className="font-serif italic text-sm text-foreground/80 leading-relaxed max-w-2xl">
        "{verse.text}"
      </p>
      <span className="mt-1 font-mono text-[9px] tracking-[0.2em] text-muted-foreground uppercase">
        — {verse.book} {verse.chapter}:{verse.number} —
      </span>
    </div>
  );
};
