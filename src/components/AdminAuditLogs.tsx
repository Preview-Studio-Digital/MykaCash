import React, { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Search, History, Calendar, FileText, CheckCircle2, AlertCircle, Edit, Trash2, ArrowLeftRight } from "lucide-react";
import { Input } from "@/components/ui/input";

type AuditLog = {
  id: string;
  created_at: string;
  action: string;
  op_number: string | null;
  client_name: string | null;
  invoice_number: string | null;
  author: string;
  details: string | null;
};

export const AdminAuditLogs = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const loadLogs = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("operation_logs")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setLogs(data || []);
    } catch (err: any) {
      console.error("Erro ao carregar logs:", err);
      toast.error("Erro ao carregar histórico de auditoria");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, []);

  const filteredLogs = useMemo(() => {
    if (!search.trim()) return logs;
    const q = search.toLowerCase();
    return logs.filter((log) => {
      return (
        log.author.toLowerCase().includes(q) ||
        (log.client_name && log.client_name.toLowerCase().includes(q)) ||
        (log.op_number && log.op_number.toLowerCase().includes(q)) ||
        (log.invoice_number && log.invoice_number.toLowerCase().includes(q)) ||
        log.action.toLowerCase().includes(q) ||
        (log.details && log.details.toLowerCase().includes(q))
      );
    });
  }, [logs, search]);

  const groupedLogs = useMemo(() => {
    const groups: { [dateStr: string]: AuditLog[] } = {};
    filteredLogs.forEach((log) => {
      const date = new Date(log.created_at);
      const dateStr = date.toLocaleDateString("pt-BR", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      });
      // Capitalize first letter of weekday
      const capitalizedDateStr = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);
      if (!groups[capitalizedDateStr]) {
        groups[capitalizedDateStr] = [];
      }
      groups[capitalizedDateStr].push(log);
    });
    return groups;
  }, [filteredLogs]);

  const getActionBadge = (action: string) => {
    switch (action) {
      case "CREATE":
        return {
          icon: FileText,
          bg: "bg-net-green/10 border-net-green/30 text-net-green",
          label: "Abertura",
        };
      case "UPDATE":
        return {
          icon: Edit,
          bg: "bg-factoring-amber/10 border-factoring-amber/30 text-factoring-amber",
          label: "Edição",
        };
      case "SETTLE":
        return {
          icon: CheckCircle2,
          bg: "bg-net-green/15 border-net-green/30 text-net-green",
          label: "Liquidação",
        };
      case "UNSETTLE":
        return {
          icon: ArrowLeftRight,
          bg: "bg-factoring-amber/15 border-factoring-amber/30 text-factoring-amber",
          label: "Estorno",
        };
      case "DELETE":
        return {
          icon: Trash2,
          bg: "bg-cost-red/10 border-cost-red/30 text-cost-red",
          label: "Exclusão",
        };
      default:
        return {
          icon: AlertCircle,
          bg: "bg-muted text-muted-foreground",
          label: action,
        };
    }
  };

  const formatLogText = (log: AuditLog) => {
    const time = new Date(log.created_at).toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    const op = log.op_number ? String(log.op_number).padStart(4, "0") : "—";
    const client = log.client_name || "—";
    const nf = log.invoice_number || "—";

    switch (log.action) {
      case "CREATE":
        return (
          <span>
            <strong className="text-foreground">{log.author}</strong> abriu a operação{" "}
            <span className="font-mono text-xs text-muted-foreground">
              (Registro: {op}, Cliente: {client}, NF: {nf}, Horário: {time})
            </span>
          </span>
        );
      case "UPDATE":
        return (
          <span>
            <strong className="text-foreground">{log.author}</strong> editou a operação{" "}
            <span className="font-mono text-xs text-muted-foreground">
              (Registro: {op}, Cliente: {client}, NF: {nf}, Horário: {time})
            </span>
          </span>
        );
      case "SETTLE":
        return (
          <span>
            <strong className="text-foreground">{log.author}</strong> liquidou a operação{" "}
            <span className="font-mono text-xs text-muted-foreground">
              (Registro: {op}, Cliente: {client}, NF: {nf}, Horário: {time})
            </span>
          </span>
        );
      case "UNSETTLE":
        return (
          <span>
            <strong className="text-foreground">{log.author}</strong> removeu a liquidação da operação{" "}
            <span className="font-mono text-xs text-muted-foreground">
              (Registro: {op}, Cliente: {client}, NF: {nf}, Horário: {time})
            </span>
          </span>
        );
      case "DELETE":
        return (
          <span>
            <strong className="text-foreground">{log.author}</strong> deletou a operação{" "}
            <span className="font-mono text-xs text-muted-foreground">
              (Registro: {op}, Cliente: {client}, NF: {nf}, Horário: {time})
            </span>
          </span>
        );
      default:
        return (
          <span>
            <strong className="text-foreground">{log.author}</strong> realizou {log.action}{" "}
            <span className="font-mono text-xs text-muted-foreground">({time})</span>
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
        <div className="relative w-full max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por autor, cliente, registro ou NF..."
            className="pl-9 h-10 bg-background/50 border-border/40 font-sans"
          />
        </div>
        <button
          onClick={loadLogs}
          className="flex items-center gap-2 text-xs font-mono tracking-wider text-muted-foreground hover:text-foreground transition-colors uppercase border border-border/40 rounded-lg px-3 py-2 bg-muted/20"
        >
          <History className="h-3.5 w-3.5" />
          Atualizar Logs
        </button>
      </div>

      {/* Logs Content */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <span className="font-mono text-xs text-muted-foreground">Carregando logs de auditoria...</span>
        </div>
      ) : Object.keys(groupedLogs).length === 0 ? (
        <div className="border border-border/40 rounded-2xl bg-card/10 backdrop-blur-sm p-12 text-center">
          <Calendar className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
          <h3 className="font-mono text-sm text-foreground/80 font-bold uppercase tracking-wider">
            Nenhum registro encontrado
          </h3>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
            Não há registros de alterações de operações correspondentes à busca atual.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {Object.entries(groupedLogs).map(([dateStr, entries]) => (
            <div key={dateStr} className="space-y-3">
              {/* Date Header */}
              <div className="flex items-center gap-3">
                <span className="text-xs font-mono font-bold tracking-widest text-primary-glow/80 uppercase">
                  {dateStr}
                </span>
                <div className="h-px flex-1 bg-border/40" />
              </div>

              {/* Entries list */}
              <div className="space-y-2.5 pl-1">
                {entries.map((log) => {
                  const badge = getActionBadge(log.action);
                  const IconComponent = badge.icon;
                  return (
                    <div
                      key={log.id}
                      className="group flex flex-col md:flex-row md:items-center justify-between gap-3 p-3 rounded-xl border border-border/20 bg-card/20 hover:bg-card/40 transition-all font-mono text-xs md:text-sm"
                    >
                      <div className="flex items-start gap-3">
                        {/* Action Badge */}
                        <div
                          className={`flex items-center justify-center p-2 rounded-lg border shrink-0 ${badge.bg}`}
                          title={badge.label}
                        >
                          <IconComponent className="h-4 w-4" />
                        </div>
                        {/* Log Text */}
                        <div className="leading-relaxed text-muted-foreground pt-0.5">
                          {formatLogText(log)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
