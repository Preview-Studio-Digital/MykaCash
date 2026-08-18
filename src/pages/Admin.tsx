import React, { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ArrowLeft, Pencil, Trash2, Shield, Users, Settings, UserPlus, Wallet, Menu, History } from "lucide-react";
import SoundSettings from "@/components/SoundSettings";
import { AccountCashFlow } from "@/components/AccountCashFlow";
import { AdminAuditLogs } from "@/components/AdminAuditLogs";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
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

type TabKey = "usuarios" | "financeiro" | "configuracoes" | "historico";

const Admin = () => {
  const { isAdmin, loading, session, user, isAdminLoading } = useAuth();
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
  const [activeTab, setActiveTab] = useState<TabKey>("financeiro");
  const [showCreateModal, setShowCreateModal] = useState(false);

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

  if (loading || isAdminLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="font-mono text-sm text-muted-foreground animate-pulse-glow">
          Verificando permissões...
        </div>
      </div>
    );
  }
  if (!session) return <Navigate to="/login" replace />;
  if (!isAdmin) return <Navigate to="/" replace />;

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const userInput = username.trim().toLowerCase();
      let email = "";
      if (userInput.includes("@")) {
        email = userInput;
      } else {
        email = `${userInput}@smartmoney.local`;
      }

      const { data, error } = await supabase.rpc("admin_create_user", {
        p_email: email,
        p_password: password,
        p_username: userInput,
        p_display_name: displayName.trim() || userInput,
        p_is_admin: makeAdmin,
      });

      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);

      toast.success(`Usuário "${username}" criado`);
      setUsername("");
      setPassword("");
      setDisplayName("");
      setMakeAdmin(false);
      setShowCreateModal(false);
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
      const newU = editUsername.trim().toLowerCase();
      let email: string | null = null;
      if (newU) {
        if (newU.includes("@")) {
          email = newU;
        } else {
          email = `${newU}@smartmoney.local`;
        }
      }

      const { data, error } = await supabase.rpc("admin_update_user", {
        p_user_id: editing.id,
        p_email: email,
        p_password: editPassword || null,
        p_username: newU || null,
        p_display_name: editDisplay.trim() || null,
        p_is_admin: editIsAdmin !== adminIds.has(editing.id) ? editIsAdmin : null,
      });

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
      const { data, error } = await supabase.rpc("admin_delete_user", {
        p_user_id: deleting.id,
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
    <div className="min-h-screen">
      <header className="border-b border-border/60 px-2 sm:px-3 md:px-6 py-3 grid grid-cols-3 items-center gap-1 sm:gap-2 bg-background/50 backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center justify-start min-w-0">
          <Link
            to="/"
            className="inline-flex items-center justify-center p-2 rounded-full border border-border/40 bg-background/50 hover:bg-muted/30 transition-all text-muted-foreground hover:text-foreground hover:scale-105 shrink-0"
            title="Voltar para o início"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </div>

        <div className="flex items-center justify-center text-center min-w-0">
          <h1 className="font-title title-gradient text-sm sm:text-base md:text-lg font-normal tracking-wide whitespace-nowrap uppercase">
            ADMINISTRAÇÃO
          </h1>
        </div>

        <div className="flex items-center justify-end shrink-0">
          <button
            onClick={() => setActiveTab("configuracoes")}
            className={cn(
              "inline-flex items-center gap-1.5 font-mono text-[10px] tracking-widest transition-all rounded-full px-2.5 sm:px-4 py-1.5 sm:py-2 border border-transparent hover:animate-color-cycle hover:text-primary-foreground hover:shadow-md",
              activeTab === "configuracoes"
                ? "text-foreground border-foreground bg-muted/20"
                : "text-muted-foreground bg-transparent hover:bg-muted/10"
            )}
          >
            <Settings className="h-3.5 w-3.5" /> <span className="hidden sm:inline">CONFIGURAÇÕES</span>
          </button>
        </div>
      </header>

      <div className="container max-w-[1600px] mx-auto px-3 sm:px-4 py-6">
        {/* Navigation Buttons */}
        <div className="flex items-center justify-center gap-2 mb-8 animate-fade-up px-2">
          <div className="inline-flex max-w-full rounded-full border border-border/60 bg-background/80 p-1 sm:p-1.5 backdrop-blur-md shadow-lg shadow-black/40">
            {[
              { key: "financeiro", label: "FINANCEIRO", icon: Wallet },
              { key: "historico", label: "AUDITORIA", icon: History },
              { key: "usuarios", label: "USUÁRIOS", icon: Users },
            ].map((it) => {
              const active = activeTab === it.key;
              const Icon = it.icon;
              return (
                <button
                  key={it.key}
                  onClick={() => setActiveTab(it.key as TabKey)}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2 py-1.5 font-mono text-[10px] tracking-[0.12em] transition-all sm:gap-2 sm:px-5 sm:py-2 sm:text-xs sm:tracking-[0.3em]",
                    active
                      ? "animate-color-cycle text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                  {it.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Tab Contents */}
        {activeTab === "usuarios" && (
          <main className="mx-auto w-full max-w-[1200px] py-4">
            <section className="rounded-2xl border border-border/60 bg-gradient-card p-6 shadow-panel">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-display text-lg">Usuários ({users.length})</h2>
                <Button onClick={() => setShowCreateModal(true)} size="sm" className="gap-2">
                  <UserPlus className="h-4 w-4" /> Criar Usuário
                </Button>
              </div>
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
          </main>
        )}

        {activeTab === "financeiro" && (
          <main className="mx-auto w-full py-4">
            <AccountCashFlow />
          </main>
        )}

        {activeTab === "configuracoes" && (
          <main className="mx-auto w-full max-w-3xl py-4">
            <SoundSettings />
          </main>
        )}

        {activeTab === "historico" && (
          <main className="mx-auto w-full max-w-5xl py-4">
            <AdminAuditLogs />
          </main>
        )}
      </div>


      {/* Create user dialog */}
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Criar novo usuário</DialogTitle>
            <DialogDescription>
              Cadastre um novo usuário para acesso à plataforma.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={onCreate} className="grid gap-4">
            <div className="space-y-2">
              <Label htmlFor="username">E-mail ou Usuário</Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="ex: joao.silva@gmail.com ou joao.silva"
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
            <div className="space-y-2">
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
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={makeAdmin}
                onChange={(e) => setMakeAdmin(e.target.checked)}
              />
              Tornar este usuário também administrador
            </label>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowCreateModal(false)} disabled={busy}>
                Cancelar
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? "Criando..." : "Criar usuário"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

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
              <Label htmlFor="edit-username">E-mail ou Usuário</Label>
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
    </div>
  );
};
export default Admin;
