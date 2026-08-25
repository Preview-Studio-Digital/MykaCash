import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AppFooter } from "@/components/AppFooter";
import { toast } from "sonner";
import { z } from "zod";

const USERNAME_DOMAIN = "smartmoney.local";

const schema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, { message: "Mínimo de 3 caracteres" }),
  password: z.string().min(6, { message: "Mínimo de 6 caracteres" }).max(72),
});

const Login = () => {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  if (!loading && session) return <Navigate to="/" replace />;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse({ email, password });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    setBusy(true);
    try {
      const resolvedEmail = parsed.data.email.includes("@")
        ? parsed.data.email
        : `${parsed.data.email}@${USERNAME_DOMAIN}`;

      const { error } = await supabase.auth.signInWithPassword({
        email: resolvedEmail,
        password: parsed.data.password,
      });
      if (error) throw error;
      navigate("/", { replace: true });
    } catch (err: any) {
      toast.error(err.message || "E-mail ou senha inválidos");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden flex flex-col justify-between">
      <div className="absolute inset-0 grid-overlay opacity-40 pointer-events-none" />
      <div className="absolute -top-40 left-1/2 -translate-x-1/2 h-[600px] w-[600px] rounded-full bg-primary/20 blur-3xl animate-pulse-glow pointer-events-none" />

      <div />

      <main className="relative w-full max-w-md mx-auto my-auto px-4 py-8">
        <div className="rounded-2xl border border-border/60 bg-gradient-card p-8 shadow-panel animate-fade-up">
          <div className="mb-8 text-center flex flex-col items-center">
            <img src="/money-management.ico" alt="Smart Money" className="h-16 w-16 mb-4" />
            <h1 className="font-title font-normal title-gradient text-3xl sm:text-4xl whitespace-nowrap tracking-wide">MYKACA$H</h1>
            <p className="mt-2 font-mono text-xs tracking-[0.4em] text-muted-foreground">VERSÃO 3.3</p>
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">E-mail ou Usuário</Label>
              <Input
                id="email"
                type="text"
                autoComplete="email"
                placeholder="exemplo@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <Button type="submit" disabled={busy} className="w-full font-display tracking-wide">
              {busy ? "Aguarde..." : "Entrar"}
            </Button>
          </form>

          <p className="mt-6 text-center text-xs font-mono tracking-widest text-muted-foreground whitespace-pre-line">
            ACESSO RESTRITO
          </p>
        </div>
      </main>

      <AppFooter className="relative z-10" />
    </div>
  );
};

export default Login;
