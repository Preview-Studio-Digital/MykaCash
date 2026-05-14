import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ArrowLeft, Pencil, Trash2, Shield, Users, Wallet } from "lucide-react";
import { AccountCashFlow } from "@/components/AccountCashFlow";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type ProfileRow = {
  id: string;
  username: string | null;
  display_name: string | null;
  created_at: string;
};

type RoleRow = { user_id: string; role: string };

const Admin = () => {
  const { isAdmin, loading, session, user } = useAuth();
  const [users, setUsers] = useState<ProfileRow[]>([]);
  const [adminIds, setAdminIds] = useState<Set<string>>(new Set());
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [makeAdmin, setMakeAdmin] = useState(false);
  const [busy, setBusy] = useState(false);

  // Edit dialog state
  const [editing, setEditing] = useState<ProfileRow | null>(null);
  const [editUsername, setEditUsername] = useState("");
  const [editDisplay, setEditDisplay] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [editIsAdmin, setEditIsAdmin] = useState(false);
  const [editBusy, setEditBusy] = useState(false);

  // Delete confirm state
  const [deleting, setDeleting] = useState<ProfileRow | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const loadUsers = async () => {
    const [{ data: profilesData, error: profilesErr }, { data: rolesData, error: rolesErr }] =
      await Promise.all([
        supabase
          .from("profiles")
          .select("id, username, display_name, created_at")
          .order("created_at", { ascending: false }),
        supabase.from("user_roles").select("user_id, role"),
      ]);
    if (profilesErr) {
      toast.error("Erro ao carregar usuários");
      return;
    }
    if (rolesErr) {
      toast.error("Erro ao carregar permissões");
      return;
    }
    setUsers(profilesData ?? []);
    const adminSet = new Set<string>();
    (rolesData as RoleRow[] | null)?.forEach((r) => {
      if (r.role === "admin") adminSet.add(r.user_id);
    });
    setAdminIds(adminSet);
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

  const openEdit = (u: ProfileRow) => {
    setEditing(u);
    setEditUsername(u.username ?? "");
    setEditDisplay(u.display_name ?? "");
    setEditPassword("");
    setEditIsAdmin(adminIds.has(u.id));
  };

  const onSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setEditBusy(true);
    try {
      const body: Record<string, unknown> = { user_id: editing.id };
      const newU = editUsername.trim().toLowerCase();
      if (newU && newU !== (editing.username ?? "")) body.username = newU;
      if (editDisplay.trim() !== (editing.display_name ?? "")) body.display_name = editDisplay.trim();
      if (editPassword.length > 0) body.password = editPassword;
      if (editIsAdmin !== adminIds.has(editing.id)) body.is_admin = editIsAdmin;

      const { data, error } = await supabase.functions.invoke("admin-update-user", { body });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success("Usuário atualizado");
      setEditing(null);
      await loadUsers();
    } catch (err: any) {
      toast.error(err.message ?? "Falha ao atualizar usuário");
    } finally {
      setEditBusy(false);
    }
  };

  const onConfirmDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-delete-user", {
        body: { user_id: deleting.id },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success("Usuário excluído");
      setDeleting(null);
      await loadUsers();
    } catch (err: any) {
      toast.error(err.message ?? "Falha ao excluir usuário");
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <Tabs defaultValue="cashflow" className="min-h-screen">
      <header className="border-b border-border/60 px-6 py-3 flex items-center justify-between bg-background/50 backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center gap-6">
          <Link
            to="/"
            className="inline-flex items-center gap-2 font-mono text-[10px] tracking-widest text-muted-foreground hover:text-primary transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> VOLTAR
          </Link>
          <h1 className="font-title title-gradient text-lg font-bold tracking-tight">PAINEL ADMINISTRADOR</h1>
        </div>

        <TabsList className="bg-muted/40 p-1 border border-border/40 rounded-xl h-9">
          <TabsTrigger value="cashflow" className="gap-2 rounded-lg text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm px-4">
            <Wallet className="h-3.5 w-3.5" /> Fluxo de Caixa
          </TabsTrigger>
          <TabsTrigger value="users" className="gap-2 rounded-lg text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm px-4">
            <Users className="h-3.5 w-3.5" /> Gestão de Usuários
          </TabsTrigger>
        </TabsList>
      </header>

      <main className="mx-auto w-full max-w-[1600px] px-4 md:px-8 lg:px-12 py-10 space-y-10">
        <TabsContent value="cashflow" className="space-y-10 focus-visible:outline-none mt-0">
          <AccountCashFlow />
        </TabsContent>

        <TabsContent value="users" className="space-y-10 focus-visible:outline-none mt-0">
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
                    type="password"
                    autoComplete="new-password"
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
                {users.map((u) => {
                  const isUserAdmin = adminIds.has(u.id);
                  const isSelf = user?.id === u.id;
                  return (
                    <div key={u.id} className="py-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-mono text-sm flex items-center gap-2">
                          <span className="truncate">{u.username ?? "—"}</span>
                          {isUserAdmin && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 font-mono text-[9px] tracking-widest text-primary">
                              <Shield className="h-3 w-3" /> ADMIN
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">{u.display_name}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="hidden sm:inline font-mono text-[10px] tracking-widest text-muted-foreground">
                          {new Date(u.created_at).toLocaleDateString("pt-BR")}
                        </span>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => openEdit(u)}
                          aria-label="Editar"
                          title="Editar usuário"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setDeleting(u)}
                          disabled={isSelf}
                          aria-label="Excluir"
                          title={isSelf ? "Você não pode excluir seu próprio usuário" : "Excluir usuário"}
                          className="text-muted-foreground hover:text-cost-red disabled:opacity-40"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
                {users.length === 0 && (
                  <p className="text-sm text-muted-foreground py-6 text-center">Nenhum usuário ainda.</p>
                )}
              </div>
            </section>
          </TabsContent>
        </Tabs>
      </main>

      {/* Edit dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar usuário</DialogTitle>
            <DialogDescription>
              Atualize os dados de acesso. Deixe a senha em branco para mantê-la.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={onSaveEdit} className="grid gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit-username">Usuário</Label>
              <Input
                id="edit-username"
                value={editUsername}
                onChange={(e) => setEditUsername(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-display">Nome de exibição</Label>
              <Input
                id="edit-display"
                value={editDisplay}
                onChange={(e) => setEditDisplay(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-password">Nova senha (opcional)</Label>
              <Input
                id="edit-password"
                type="password"
                autoComplete="new-password"
                value={editPassword}
                onChange={(e) => setEditPassword(e.target.value)}
                placeholder="Deixe em branco para manter"
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={editIsAdmin}
                disabled={editing?.id === user?.id}
                onChange={(e) => setEditIsAdmin(e.target.checked)}
              />
              Administrador
              {editing?.id === user?.id && (
                <span className="text-xs text-muted-foreground">(não é possível alterar para si mesmo)</span>
              )}
            </label>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditing(null)} disabled={editBusy}>
                Cancelar
              </Button>
              <Button type="submit" disabled={editBusy}>
                {editBusy ? "Salvando..." : "Salvar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir usuário?</AlertDialogTitle>
            <AlertDialogDescription>
              Deseja realmente excluir o usuário{" "}
              <strong>{deleting?.username ?? deleting?.display_name}</strong>? Essa ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteBusy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={onConfirmDelete} disabled={deleteBusy}>
              {deleteBusy ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Tabs>
  );
};

export default Admin;
