import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";

type ProfileRow = {
  id: string;
  username: string | null;
  display_name: string | null;
  created_at: string;
};

const Admin = () => {
  const { isAdmin, loading, session } = useAuth();
  const [users, setUsers] = useState<ProfileRow[]>([]);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [makeAdmin, setMakeAdmin] = useState(false);
  const [busy, setBusy] = useState(false);

  const loadUsers = async () => {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, username, display_name, created_at")
      .order("created_at", { ascending: false });
    if (error) {
      toast.error(error.message);
      return;
    }
    setUsers(data ?? []);
  };

  useEffect(() => {
    if (isAdmin) loadUsers();
  }, [isAdmin]);

  if (loading) return null;
  if (!session) return <Navigate to="/login" replace />;
  if (!isAdmin) return <Navigate to="/" replace />;

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-create-user", {
        body: {
          username: username.trim().toLowerCase(),
          password,
          display_name: displayName.trim() || username.trim(),
          is_admin: makeAdmin,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success(`Usuário "${username}" criado`);
      setUsername("");
      setPassword("");
      setDisplayName("");
      setMakeAdmin(false);
      await loadUsers();
    } catch (err: any) {
      toast.error(err.message ?? "Falha ao criar usuário");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen">
      <header className="border-b border-border/60 px-6 py-4 flex items-center justify-between">
        <Link
          to="/"
          className="inline-flex items-center gap-2 font-mono text-xs tracking-widest text-muted-foreground hover:text-primary"
        >
          <ArrowLeft className="h-4 w-4" /> VOLTAR
        </Link>
        <h1 className="font-title title-gradient text-xl font-bold">PAINEL ADMIN</h1>
        <span />
      </header>

      <main className="container mx-auto max-w-4xl px-4 py-10 space-y-10">
        <section className="rounded-2xl border border-border/60 bg-gradient-card p-6 shadow-panel">
          <h2 className="font-display text-lg mb-4">Criar novo usuário</h2>
          <form onSubmit={onCreate} className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="username">Usuário</Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="ex: joao.silva"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="display">Nome de exibição</Label>
              <Input
                id="display"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="João Silva"
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="password">Senha (mín. 6)</Label>
              <Input
                id="password"
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <label className="flex items-center gap-2 text-sm md:col-span-2">
              <input
                type="checkbox"
                checked={makeAdmin}
                onChange={(e) => setMakeAdmin(e.target.checked)}
              />
              Tornar este usuário também administrador
            </label>
            <Button type="submit" disabled={busy} className="md:col-span-2 font-display tracking-wide">
              {busy ? "Criando..." : "Criar usuário"}
            </Button>
          </form>
        </section>

        <section className="rounded-2xl border border-border/60 bg-gradient-card p-6 shadow-panel">
          <h2 className="font-display text-lg mb-4">Usuários ({users.length})</h2>
          <div className="divide-y divide-border/40">
            {users.map((u) => (
              <div key={u.id} className="py-3 flex items-center justify-between">
                <div>
                  <p className="font-mono text-sm">{u.username ?? "—"}</p>
                  <p className="text-xs text-muted-foreground">{u.display_name}</p>
                </div>
                <span className="font-mono text-[10px] tracking-widest text-muted-foreground">
                  {new Date(u.created_at).toLocaleDateString("pt-BR")}
                </span>
              </div>
            ))}
            {users.length === 0 && (
              <p className="text-sm text-muted-foreground py-6 text-center">Nenhum usuário ainda.</p>
            )}
          </div>
        </section>
      </main>
    </div>
  );
};

export default Admin;
