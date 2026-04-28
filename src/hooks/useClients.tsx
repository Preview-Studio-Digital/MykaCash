import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { friendlyDbError } from "@/lib/dbErrors";

export type Client = {
  id: string;
  name: string;
  document: string | null;
};

export const useClients = () => {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const { data, error } = await supabase
      .from("clients")
      .select("id, name, document")
      .order("name", { ascending: true });
    if (error) {
      toast.error("Erro ao carregar clientes");
      return;
    }
    setClients(data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const channel = supabase
      .channel("clients-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "clients" }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const addClient = async (name: string, document: string | null) => {
    const { data: userData } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from("clients")
      .insert({ name, document, created_by: userData.user?.id ?? null })
      .select("id, name, document")
      .single();
    if (error) {
      toast.error(friendlyDbError(error, "Erro ao cadastrar cliente"));
      return null;
    }
    toast.success("Cliente cadastrado");
    return data as Client;
  };

  const removeClient = async (id: string) => {
    const { error } = await supabase.from("clients").delete().eq("id", id);
    if (error) {
      toast.error(friendlyDbError(error, "Erro ao remover cliente"));
      return false;
    }
    toast.success("Cliente removido");
    return true;
  };

  return { clients, loading, addClient, removeClient, reload: load };
};
