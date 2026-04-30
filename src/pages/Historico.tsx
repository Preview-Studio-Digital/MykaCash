import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AppHeader } from "@/components/AppHeader";
import { PageNav } from "@/components/PageNav";
import { Button } from "@/components/ui/button";
import { DateField } from "@/components/DateField";
import { supabase } from "@/integrations/supabase/client";
import { calculate, formatBRL, formatPct, FACTORING_MONTHLY_RATE_PCT, type Installment } from "@/lib/calc";
import { toast } from "sonner";
import { CheckCircle2, Circle, Pencil, Trash2, Plus, X, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from "recharts";

type Period = "hoje" | "semana" | "mes" | "total" | "periodo";
type StatusFilter = "todas" | "abertas" | "andamento" | "vencidas" | "liquidadas";

type SettledEntry = string | { id: string; date: string };
type InvoiceRow = {
  id: string;
  invoice_number: string;
  invoice_value: number;
  operation_date: string;
  monthly_rate: number;
  factoring_monthly_rate: number | null;
  installments: Installment[];
  settled_installments: SettledEntry[];
  client_id: string;
  created_at: string;
  created_by: string | null;
  clients?: { name: string } | null;
  profiles?: { display_name: string | null; username: string | null } | null;
};

const settledIdOf = (e: SettledEntry): string => (typeof e === "string" ? e : e.id);
const settledDateOf = (e: SettledEntry): string | null =>
  typeof e === "string" ? null : e.date;

const localISO = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};
const todayISO = () => localISO(new Date());
const startOfWeekISO = () => {
  const d = new Date();
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return localISO(d);
};
const endOfWeekISO = () => {
  const d = new Date();
  const day = d.getDay();
  const diff = day === 0 ? 0 : 7 - day;
  d.setDate(d.getDate() + diff);
  return localISO(d);
};
const startOfMonthISO = () => {
  const d = new Date();
  d.setDate(1);
  return localISO(d);
};
const fmtDate = (iso: string) =>
  iso ? new Date(iso + "T00:00:00").toLocaleDateString("pt-BR") : "-";

const fmtDateShort = (iso: string) =>
  iso
    ? new Date(iso + "T00:00:00").toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "2-digit",
      })
    : "-";

const fmtDayMonth = (iso: string) =>
  iso
    ? new Date(iso + "T00:00:00").toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
      })
    : "-";

const weekdayShortPt = (iso: string) => {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00").getDay();
  const map: Record<number, string> = {
    1: "SEGUNDA",
    2: "TERÇA",
    3: "QUARTA",
    4: "QUINTA",
    5: "SEXTA",
    6: "SÁBADO",
    0: "DOMINGO",
  };
  return map[d] ?? "";
};

const yearOf = (iso: string) => (iso ? iso.slice(0, 4) : "");

const formatBRLNum = (n: number) =>
  n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const Historico = () => {
  const { user, isAdmin } = useAuth();
  const [period, setPeriod] = useState<Period>("total");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("todas");
  const [from, setFrom] = useState<string>(todayISO());
  const [to, setTo] = useState<string>(todayISO());
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState<number>(Date.now());

  // tick every 30s so the 5-minute edit window updates
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const range = useMemo(() => {
    const today = todayISO();
    if (period === "hoje") return { from: today, to: today };
    if (period === "semana") return { from: startOfWeekISO(), to: today };
    if (period === "mes") return { from: startOfMonthISO(), to: today };
    if (period === "total") return { from: "1900-01-01", to: "2999-12-31" };
    return { from, to };
  }, [period, from, to]);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("invoices")
      .select(
        "id, invoice_number, invoice_value, operation_date, monthly_rate, factoring_monthly_rate, installments, settled_installments, client_id, created_at, created_by, clients(name), profiles:created_by(display_name, username)"
      )
      .order("operation_date", { ascending: false });
    if (error) {
      toast.error("Erro ao carregar histórico");
      setLoading(false);
      return;
    }
    setInvoices((data ?? []) as any);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const todayStr = todayISO();

  // Build flat rows (one per installment)
  const rows = useMemo(() => {
    type Row = {
      key: string;
      invoiceId: string;
      installmentId: string;
      clientName: string;
      invoiceNumber: string;
      operationDate: string;
      dueDate: string;
      days: number;
      monthlyRate: number;
      effectivePct: number;
      value: number;
      presentValue: number;
      cost: number;
      factoringCost: number;
      savings: number;
      parcelLabel: string;
      settled: boolean;
      settledDate: string | null;
      overdue: boolean;
      createdBy: string;
      createdAt: string;
      isAuthor: boolean;
      withinEditWindow: boolean;
    };
    const out: Row[] = [];
    for (const inv of invoices) {
      const installments = Array.isArray(inv.installments) ? inv.installments : [];
      const settledEntries: SettledEntry[] = Array.isArray(inv.settled_installments)
        ? (inv.settled_installments as any)
        : [];
      const settledMap = new Map<string, string | null>();
      settledEntries.forEach((e) => settledMap.set(settledIdOf(e), settledDateOf(e)));
      const factoringRate = Number(inv.factoring_monthly_rate ?? FACTORING_MONTHLY_RATE_PCT);
      const result = calculate({
        invoiceValue: Number(inv.invoice_value) || 0,
        operationDate: inv.operation_date,
        monthlyRate: Number(inv.monthly_rate) || 0,
        installments: installments as Installment[],
      });
      const showIdx = result.installmentCalcs.length > 1;
      const createdAtMs = new Date(inv.created_at).getTime();
      const withinEditWindow = now - createdAtMs < 5 * 60 * 1000;
      const isAuthor = !!user && inv.created_by === user.id;
      const createdBy =
        inv.profiles?.username || inv.profiles?.display_name || "—";

      result.installmentCalcs.forEach((i, idx) => {
        const cost = i.value - i.presentValue;
        const effectivePct = i.value > 0 ? (cost / i.value) * 100 : 0;
        const settled = settledMap.has(i.id);
        const settledDate = settled ? settledMap.get(i.id) ?? null : null;
        const overdue = !settled && i.dueDate < todayStr;
        const factoringCost = i.value * (factoringRate / 100) * (i.days / 30);
        const savings = factoringCost - cost;
        out.push({
          key: `${inv.id}-${i.id}`,
          invoiceId: inv.id,
          installmentId: i.id,
          clientName: inv.clients?.name ?? "—",
          invoiceNumber: inv.invoice_number,
          operationDate: inv.operation_date,
          dueDate: i.dueDate,
          days: i.days,
          monthlyRate: Number(inv.monthly_rate) || 0,
          effectivePct,
          value: i.value,
          presentValue: i.presentValue,
          cost,
          factoringCost,
          savings,
          parcelLabel: showIdx ? String(idx + 1).padStart(2, "0") : "ÚNICA",
          settled,
          settledDate,
          overdue,
          createdBy,
          createdAt: inv.created_at,
          isAuthor,
          withinEditWindow,
        });
      });
    }
    return out;
  }, [invoices, todayStr, now, user]);

  const filteredRows = useMemo(() => {
    // Para "liquidadas": filtrar por dueDate (data de vencimento) dentro do período.
    // Para "andamento": parcelas em aberto (não liquidadas, não vencidas) cujo intervalo
    //   [abertura, vencimento] intersecta o período selecionado — ou seja, a operação
    //   está "acontecendo" em algum momento dentro do período.
    // Para os demais: filtrar por operationDate (data de abertura).
    const inRange = (d: string) => d >= range.from && d <= range.to;
    if (statusFilter === "liquidadas") {
      // Para "liquidadas": filtrar pela data efetiva de liquidação dentro do período
      return rows.filter((r) => r.settled && r.settledDate && inRange(r.settledDate));
    }
    if (statusFilter === "andamento") {
      // Operações em andamento: não foram liquidadas e começaram antes ou durante o período
      return rows.filter(
        (r) => !r.settled && r.operationDate <= range.to
      );
    }
    if (statusFilter === "todas") {
      return rows.filter((r) => {
        // "andamento" (inclui abertas e vencidas até a data limite)
        if (!r.settled && r.operationDate <= range.to) return true;
        // "liquidadas" apenas se a data de liquidação estiver dentro do período
        if (r.settled && r.settledDate && inRange(r.settledDate)) return true;
        return false;
      });
    }
    const base = rows.filter((r) => inRange(r.operationDate));
    if (statusFilter === "vencidas") return base.filter((r) => !r.settled && r.overdue);
    return base.filter((r) => !r.settled && !r.overdue); // abertas
  }, [rows, statusFilter, range.from, range.to]);

  const totals = filteredRows.reduce(
    (a, r) => ({
      value: a.value + r.value,
      presentValue: a.presentValue + r.presentValue,
      cost: a.cost + r.cost,
      factoring: a.factoring + r.factoringCost,
      savings: a.savings + r.savings,
    }),
    { value: 0, presentValue: 0, cost: 0, factoring: 0, savings: 0 }
  );
  const totalEffective = totals.value > 0 ? (totals.cost / totals.value) * 100 : 0;
  const factoringSavings = Math.max(0, totals.factoring - totals.cost);
  const settledPresent = filteredRows.reduce((s, r) => s + (r.settled ? r.value : 0), 0);
  // "Em aberto" deve refletir o saldo do gráfico (valores brutos): entra na operação, sai no vencimento se liquidado
  const openPresent = filteredRows.reduce((s, r) => s + (r.settled ? 0 : r.value), 0);

  // Chart: "Operações em Transação" — running outstanding balance over time.
  // Bruto entra na operação; sai no vencimento se liquidado.
  const chartData = useMemo(() => {
    type Ev = { date: string; delta: number };

    // Pegamos todos os eventos das operações filtradas
    const allEvents: Ev[] = [];
    for (const r of filteredRows) {
      allEvents.push({ date: r.operationDate, delta: r.value });
      if (r.settled) {
        allEvents.push({ date: r.dueDate, delta: -r.value });
      }
    }

    if (allEvents.length === 0)
      return [] as { date: string; label: string; labelShort: string; saldo: number }[];

    // Saldo acumulado de todos os eventos com data ESTRITAMENTE anterior a range.from
    const carryOver = allEvents
      .filter((e) => e.date < range.from)
      .reduce((s, e) => s + e.delta, 0);

    // Eventos que ocorreram DENTRO do período
    const periodEvents = allEvents.filter((e) => e.date >= range.from && e.date <= range.to);

    // Agrupa eventos do período por data
    const byDate = new Map<string, number>();
    periodEvents.forEach((e) => {
      byDate.set(e.date, (byDate.get(e.date) ?? 0) + e.delta);
    });
    const sortedDates = Array.from(byDate.keys()).sort();

    const series: { date: string; label: string; labelShort: string; saldo: number }[] = [];

    const allDatesSorted = allEvents.map((e) => e.date).sort();
    const firstHistoricalDate = allDatesSorted[0];
    const includesFirst = firstHistoricalDate >= range.from && firstHistoricalDate <= range.to;

    if (period === "total" && includesFirst) {
      // Período total engloba a primeira operação: baseline em zero, uma semana antes
      const first = new Date(sortedDates[0] + "T00:00:00");
      first.setDate(first.getDate() - 7);
      const baseline = localISO(first);
      series.push({ date: baseline, label: fmtDate(baseline), labelShort: fmtDayMonth(baseline), saldo: 0 });
    } else {
      // Período NÃO é total ou não engloba a primeira operação: começa com o saldo acumulado real
      // ancorado no início do intervalo
      const anchor = range.from > "1900-01-01" ? range.from : (sortedDates[0] || todayStr);
      series.push({
        date: anchor,
        label: fmtDate(anchor),
        labelShort: fmtDayMonth(anchor),
        saldo: Math.round(carryOver * 100) / 100,
      });
    }

    const fillGaps = (targetDateStr: string, currentSaldo: number) => {
      if (series.length === 0) return;
      const lastDate = series[series.length - 1].date;
      const lastDateObj = new Date(lastDate + "T00:00:00");
      const dObj = new Date(targetDateStr + "T00:00:00");
      let temp = new Date(lastDateObj.getFullYear(), lastDateObj.getMonth() + 1, 1);
      while (temp < dObj) {
        const firstStr = localISO(temp);
        if (firstStr !== targetDateStr && firstStr !== lastDate) {
          series.push({
            date: firstStr,
            label: fmtDate(firstStr),
            labelShort: fmtDayMonth(firstStr),
            saldo: Math.round(currentSaldo * 100) / 100,
          });
        }
        temp.setMonth(temp.getMonth() + 1);
      }
    };

    let acc = (period === "total" && includesFirst) ? 0 : carryOver;
    for (const d of sortedDates) {
      fillGaps(d, acc);

      acc += byDate.get(d)!;
      // Evita ponto duplicado se o primeiro evento coincide com o anchor
      if (series.length && series[series.length - 1].date === d) {
        series[series.length - 1].saldo = Math.round(acc * 100) / 100;
      } else {
        series.push({
          date: d,
          label: fmtDate(d),
          labelShort: fmtDayMonth(d),
          saldo: Math.round(acc * 100) / 100,
        });
      }
    }

    // Para períodos maiores, sempre mostrar a data de hoje se ainda não estiver (pra a linha ir até o fim)
    if (period === "semana" || period === "mes" || period === "total") {
      const last = series[series.length - 1];
      if (last && last.date < todayStr) {
        fillGaps(todayStr, last.saldo);
        series.push({
          date: todayStr,
          label: fmtDate(todayStr),
          labelShort: fmtDayMonth(todayStr),
          saldo: last.saldo,
        });
      } else if (last && last.date > todayStr) {
        const insertIdx = series.findIndex((s) => s.date > todayStr);
        if (insertIdx > 0) {
          const prev = series[insertIdx - 1];
          series.splice(insertIdx, 0, {
            date: todayStr,
            label: fmtDate(todayStr),
            labelShort: fmtDayMonth(todayStr),
            saldo: prev.saldo,
          });
        }
      }
    }
    
    return series;
  }, [filteredRows, period, range.from, range.to, todayStr]);

  const toggleSettlement = async (row: (typeof rows)[number]) => {
    const inv = invoices.find((i) => i.id === row.invoiceId);
    if (!inv) return;
    const current: SettledEntry[] = Array.isArray(inv.settled_installments)
      ? (inv.settled_installments as any)
      : [];
    const isSettled = current.some((e) => settledIdOf(e) === row.installmentId);
    const next: SettledEntry[] = isSettled
      ? current.filter((e) => settledIdOf(e) !== row.installmentId)
      : [...current, { id: row.installmentId, date: todayISO() }];
    // optimistic
    setInvoices((prev) =>
      prev.map((i) => (i.id === inv.id ? { ...i, settled_installments: next } : i))
    );
    const { error } = await supabase.rpc("toggle_invoice_settlement", {
      _invoice_id: inv.id,
      _settled_ids: next as any,
    });
    if (error) {
      toast.error("Erro ao atualizar liquidação");
      load();
    } else {
      toast.success(
        !isSettled ? "Parcela marcada como liquidada" : "Liquidação removida"
      );
    }
  };

  const handleDeleteOperation = async (invoiceId: string) => {
    if (!isAdmin) return toast.error("Apenas administradores podem excluir aberturas");
    if (!confirm("Deseja realmente excluir a abertura? Essa ação não pode ser desfeita.")) return;
    const { error } = await supabase.from("invoices").delete().eq("id", invoiceId);
    if (error) {
      const { friendlyDbError } = await import("@/lib/dbErrors");
      return toast.error(friendlyDbError(error, "Erro ao excluir abertura"));
    }
    toast.success("Abertura removida");
    load();
  };

  // ---- Edit operation (admin only) ----
  type EditForm = {
    invoice_number: string;
    invoice_value: string;
    operation_date: string;
    monthly_rate: string;
    factoring_monthly_rate: string;
    installments: { id: string; value: string; dueDate: string }[];
  };
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [saving, setSaving] = useState(false);

  const openEdit = (invoiceId: string) => {
    if (!isAdmin) return toast.error("Apenas administradores podem editar aberturas");
    const inv = invoices.find((i) => i.id === invoiceId);
    if (!inv) return;
    const insts = (Array.isArray(inv.installments) ? inv.installments : []) as Installment[];
    setEditForm({
      invoice_number: inv.invoice_number,
      invoice_value: String(inv.invoice_value),
      operation_date: inv.operation_date,
      monthly_rate: String(inv.monthly_rate),
      factoring_monthly_rate: String(inv.factoring_monthly_rate ?? FACTORING_MONTHLY_RATE_PCT),
      installments: insts.map((i) => ({
        id: i.id,
        value: String(i.value),
        dueDate: i.dueDate,
      })),
    });
    setEditingId(invoiceId);
  };

  const closeEdit = () => {
    setEditingId(null);
    setEditForm(null);
  };

  const updateInstallment = (idx: number, patch: Partial<{ value: string; dueDate: string }>) => {
    setEditForm((f) =>
      f
        ? {
            ...f,
            installments: f.installments.map((it, i) => (i === idx ? { ...it, ...patch } : it)),
          }
        : f
    );
  };

  const addInstallment = () => {
    setEditForm((f) =>
      f
        ? {
            ...f,
            installments: [
              ...f.installments,
              { id: crypto.randomUUID(), value: "", dueDate: f.operation_date },
            ],
          }
        : f
    );
  };

  const removeInstallment = (idx: number) => {
    setEditForm((f) =>
      f ? { ...f, installments: f.installments.filter((_, i) => i !== idx) } : f
    );
  };

  const saveEdit = async () => {
    if (!editingId || !editForm) return;
    const invoiceValue = Number(editForm.invoice_value);
    const monthlyRate = Number(editForm.monthly_rate);
    const factoringRate = Number(editForm.factoring_monthly_rate);
    if (!editForm.invoice_number.trim()) return toast.error("Informe o número da NF");
    if (!Number.isFinite(invoiceValue) || invoiceValue <= 0)
      return toast.error("Valor da NF inválido");
    if (!editForm.operation_date) return toast.error("Informe a data de abertura");
    if (!Number.isFinite(monthlyRate) || monthlyRate < 0)
      return toast.error("Taxa mensal inválida");
    if (editForm.installments.length === 0)
      return toast.error("Adicione ao menos uma parcela");
    const installments: Installment[] = [];
    for (const it of editForm.installments) {
      const v = Number(it.value);
      if (!Number.isFinite(v) || v <= 0) return toast.error("Valor de parcela inválido");
      if (!it.dueDate) return toast.error("Informe o vencimento de todas as parcelas");
      installments.push({ id: it.id, value: v, dueDate: it.dueDate });
    }
    setSaving(true);
    const { error } = await supabase
      .from("invoices")
      .update({
        invoice_number: editForm.invoice_number.trim(),
        invoice_value: invoiceValue,
        operation_date: editForm.operation_date,
        monthly_rate: monthlyRate,
        factoring_monthly_rate: factoringRate,
        installments: installments as any,
      })
      .eq("id", editingId);
    setSaving(false);
    if (error) {
      const { friendlyDbError } = await import("@/lib/dbErrors");
      return toast.error(friendlyDbError(error, "Erro ao salvar abertura"));
    }
    toast.success("Abertura atualizada");
    closeEdit();
    load();
  };


  const periodOptions: { id: Period; label: string }[] = [
    { id: "hoje", label: "HOJE" },
    { id: "semana", label: "SEMANA" },
    { id: "mes", label: "MÊS" },
    { id: "total", label: "TOTAL" },
    { id: "periodo", label: "PERÍODO" },
  ];

  const statusOptions: { id: StatusFilter; label: string }[] = [
    { id: "todas", label: "TODAS" },
    { id: "abertas", label: "ABERTAS" },
    { id: "andamento", label: "ANDAMENTO" },
    { id: "vencidas", label: "VENCIDAS" },
    { id: "liquidadas", label: "LIQUIDADAS" },
  ];

  // Hover state to preview liquidation in orange
  const [hoverKey, setHoverKey] = useState<string | null>(null);

  // Sorting state
  type SortKey =
    | "clientName"
    | "invoiceNumber"
    | "parcelLabel"
    | "operationDate"
    | "dueDate"
    | "days"
    | "monthlyRate"
    | "effectivePct"
    | "value"
    | "presentValue"
    | "cost"
    | "savings"
    | "createdBy";
  type SortDir = "asc" | "desc";
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const toggleSort = (key: SortKey) => {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDir("asc");
    } else if (sortDir === "asc") {
      setSortDir("desc");
    } else {
      setSortKey(null);
      setSortDir("asc");
    }
  };

  const sortedRows = useMemo(() => {
    if (!sortKey) return filteredRows;
    const arr = [...filteredRows];
    const dir = sortDir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      const av = (a as any)[sortKey];
      const bv = (b as any)[sortKey];
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      const as = String(av ?? "").toLowerCase();
      const bs = String(bv ?? "").toLowerCase();
      return as.localeCompare(bs, "pt-BR", { numeric: true }) * dir;
    });
    return arr;
  }, [filteredRows, sortKey, sortDir]);

  const SortableTh = ({
    label,
    sKey,
    className = "",
  }: {
    label: ReactNode;
    sKey: SortKey;
    className?: string;
  }) => {
    const active = sortKey === sKey;
    const Icon = sortDir === "asc" ? ArrowUp : ArrowDown;
    return (
      <th className={"px-1.5 py-2 text-center font-medium " + className}>
        <button
          type="button"
          onClick={() => toggleSort(sKey)}
          title="Clique para ordenar"
          className={
            "inline-flex items-center justify-center transition-all px-1.5 py-1 rounded-md " +
            (active
              ? "text-foreground bg-foreground/5"
              : "hover:text-foreground hover:bg-foreground/10")
          }
        >
          <span>{label}</span>
          {active && <Icon className="ml-1 h-3 w-3 text-primary" />}
        </button>
      </th>
    );
  };

  // Vence dentro da semana vigente (segunda a domingo) e ainda em aberto?
  const isDueSoon = (r: (typeof rows)[number]) => {
    if (r.settled || r.overdue) return false;
    const ws = startOfWeekISO();
    const we = endOfWeekISO();
    return r.dueDate >= ws && r.dueDate <= we;
  };

  // Row coloring — when hovering the status pill of an open/overdue row, show orange preview
  const rowClass = (r: (typeof rows)[number]) => {
    if (r.settled) return "bg-[hsl(var(--factoring-amber)/0.22)] hover:bg-[hsl(var(--factoring-amber)/0.28)]";
    if (hoverKey === r.key) {
      return "bg-[hsl(var(--factoring-amber)/0.22)]";
    }
    if (r.overdue) return "bg-[hsl(var(--cost-red)/0.12)] hover:bg-[hsl(var(--cost-red)/0.18)]";
    if (isDueSoon(r)) return "row-due-soon hover:bg-[hsl(var(--net-green)/0.45)]";
    return "bg-[hsl(var(--net-green)/0.06)] hover:bg-[hsl(var(--net-green)/0.10)]";
  };

  const renderFilters = () => (
    <section className="flex flex-col items-center justify-center gap-4 animate-fade-up text-center w-full">
      <div className="inline-flex flex-wrap justify-center rounded-2xl sm:rounded-full border border-border/60 bg-background/40 p-1 gap-1 max-w-full">
        {periodOptions.map((opt) => {
          const active = period === opt.id;
          return (
            <button
              key={opt.id}
              onClick={() => setPeriod(opt.id)}
              className={
                "inline-flex items-center rounded-full px-3 sm:px-4 py-1.5 font-mono text-[9px] sm:text-[10px] tracking-[0.25em] sm:tracking-[0.3em] transition-all whitespace-nowrap " +
                (active
                  ? "bg-primary text-primary-foreground shadow-[0_0_15px_hsl(var(--primary)/0.4)]"
                  : "text-muted-foreground hover:text-foreground")
              }
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap justify-center gap-1">
        {statusOptions.map((opt) => {
          const active = statusFilter === opt.id;
          const activeCls =
            opt.id === "abertas" || opt.id === "andamento"
              ? "bg-net-green/20 text-net-green shadow-[0_0_12px_hsl(var(--net-green)/0.35)]"
              : opt.id === "vencidas"
              ? "bg-cost-red/20 text-cost-red shadow-[0_0_12px_hsl(var(--cost-red)/0.35)]"
              : opt.id === "liquidadas"
              ? "bg-factoring-amber/20 text-factoring-amber shadow-[0_0_12px_hsl(var(--factoring-amber)/0.35)]"
              : "bg-primary text-primary-foreground shadow-[0_0_12px_hsl(var(--primary)/0.4)]";
          return (
            <button
              key={opt.id}
              onClick={() => setStatusFilter(opt.id)}
              className={
                "inline-flex items-center rounded-full px-3 py-1 font-mono text-[9px] tracking-[0.25em] transition-all whitespace-nowrap " +
                (active ? activeCls : "text-muted-foreground hover:text-foreground")
              }
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {period === "periodo" && (
        <div className="flex items-center justify-center gap-3">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[9px] tracking-[0.25em] text-muted-foreground">DE</span>
            <DateField value={from} onChange={setFrom} />
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[9px] tracking-[0.25em] text-muted-foreground">ATÉ</span>
            <DateField value={to} onChange={setTo} />
          </div>
        </div>
      )}

      {period !== "periodo" && period !== "total" && (
        <span className="font-mono text-[10px] tracking-[0.25em] text-muted-foreground">
          {range.from === range.to
            ? fmtDate(range.from)
            : `${fmtDate(range.from)} → ${fmtDate(range.to)}`}
        </span>
      )}
      {period === "total" && (
        <span className="font-mono text-[10px] tracking-[0.25em] text-muted-foreground">
          TODAS EM ANDAMENTO
        </span>
      )}
    </section>
  );

  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="container mx-auto max-w-6xl px-4 py-10 md:py-14 space-y-8">
        <PageNav />

        {/* Main filters (Top) */}
        {renderFilters()}

        {/* Summary panels — reflect selected period */}
        <section className="grid gap-4 md:grid-cols-3 animate-fade-up">
          <div className="relative overflow-hidden rounded-xl bg-gradient-net p-4 text-net-green-foreground panel-glow-net">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,255,255,0.25),transparent_60%)]" />
            <div className="relative">
              <div className="font-mono text-[9px] tracking-[0.3em] opacity-80">VALOR LÍQUIDO</div>
              <div className="mt-1 font-display text-xl md:text-2xl font-bold tabular-nums break-words">
                {formatBRL(totals.presentValue)}
              </div>
              <div className="mt-3 h-px bg-white/20" />
              <div className="mt-3 font-mono text-[9px] tracking-[0.3em] opacity-80">VALOR BRUTO</div>
              <div className="mt-1 font-display text-base md:text-lg font-semibold tabular-nums">
                {formatBRL(totals.value)}
              </div>
            </div>
          </div>

          <div className="relative overflow-hidden rounded-xl bg-gradient-cost p-4 text-cost-red-foreground panel-glow-cost">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,255,255,0.25),transparent_60%)]" />
            <div className="relative">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="font-mono text-[9px] tracking-[0.3em] opacity-80">CUSTO</div>
                  <div className="mt-1 font-display text-xl md:text-2xl font-bold tabular-nums break-words">
                    {formatBRL(totals.cost)}
                  </div>
                </div>
                <div>
                  <div className="font-mono text-[9px] tracking-[0.3em] opacity-80">TAXA EFETIVA MÉDIA</div>
                  <div className="mt-1 font-display text-xl md:text-2xl font-bold tabular-nums text-right">
                    {formatPct(totalEffective)}
                  </div>
                </div>
              </div>
              <div className="mt-3 h-px bg-white/20" />
              <div className="mt-3 font-mono text-[9px] tracking-[0.3em] opacity-80">ECONOMIA FACTORING</div>
              <div className="mt-1 font-display text-base md:text-lg font-semibold tabular-nums">
                {formatBRL(factoringSavings)}
              </div>
            </div>
          </div>

          <div className="relative overflow-hidden rounded-xl bg-gradient-factoring p-4 text-white panel-glow-factoring">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,255,255,0.25),transparent_60%)]" />
            <div className="relative">
              <div className="font-mono text-[9px] tracking-[0.3em] opacity-90">VALOR EM ABERTO</div>
              <div className="mt-1 font-display text-xl md:text-2xl font-bold tabular-nums">
                {formatBRL(openPresent)}
              </div>
              <div className="mt-3 h-px bg-white/25" />
              <div className="mt-3 font-mono text-[9px] tracking-[0.3em] opacity-90">VALOR LIQUIDADO</div>
              <div className="mt-1 font-display text-base md:text-lg font-semibold tabular-nums">
                {formatBRL(settledPresent)}
              </div>
            </div>
          </div>
        </section>

        {/* Chart */}
        <section className="rounded-2xl border border-border/60 bg-gradient-card p-6 md:p-8 shadow-card animate-fade-up">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="h-2 w-2 rounded-full bg-primary animate-pulse-glow" />
              <h2 className="font-display text-xl font-semibold tracking-tight">
                Gráfico Evolutivo
              </h2>
            </div>
            <span className="font-mono text-[10px] tracking-[0.3em] text-muted-foreground">
              {chartData.length} {chartData.length === 1 ? "DATA" : "DATAS"}
            </span>
          </div>
          <div className="h-64 w-full">
            {chartData.length === 0 ? (
              <div className="flex h-full items-center justify-center font-mono text-xs tracking-widest text-muted-foreground">
                SEM DADOS NO PERÍODO
              </div>
            ) : (
              (() => {
                const n = chartData.length;
                const slopeColor = (s: number, maxAbs: number) => {
                  // s normalizado em [-1, 1]; -1 caindo => verde, 0 plano => amarelo, +1 subindo => vermelho.
                  // Curva agressiva: pequenas variações já saturam em verde/vermelho,
                  // reduzindo a zona amarela do degradê.
                  const raw = maxAbs === 0 ? 0 : Math.max(-1, Math.min(1, s / maxAbs));
                  const t = Math.sign(raw) * Math.pow(Math.abs(raw), 0.35);
                  // Hue: vermelho 0, amarelo 50, verde 145
                  const hue = t >= 0 ? 50 + (0 - 50) * t : 50 + (145 - 50) * -t;
                  const sat = 90;
                  const light = 50;
                  return `hsl(${hue.toFixed(1)} ${sat}% ${light}%)`;
                };
                const slopes: number[] = [];
                for (let i = 0; i < n; i++) {
                  const prev = chartData[Math.max(0, i - 1)].saldo;
                  const next = chartData[Math.min(n - 1, i + 1)].saldo;
                  slopes.push(next - prev);
                }
                const maxAbs = Math.max(1, ...slopes.map((s) => Math.abs(s)));
                const stops = chartData.map((_, i) => ({
                  offset: n === 1 ? 0 : (i / (n - 1)) * 100,
                  color: slopeColor(slopes[i], maxAbs),
                }));

                const monthBoundaries: string[] = [];
                
                if (n > 0) {
                  for (let i = 1; i < n; i++) {
                    const prevM = chartData[i - 1].date.substring(0, 7);
                    const currM = chartData[i].date.substring(0, 7);
                    if (prevM !== currM) {
                      monthBoundaries.push(chartData[i].date);
                    }
                  }
                }

                return (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="lineGrad" x1="0" y1="0" x2="1" y2="0">
                          {stops.map((s, i) => (
                            <stop key={i} offset={`${s.offset}%`} stopColor={s.color} stopOpacity={1} />
                          ))}
                        </linearGradient>
                        <linearGradient id="areaGradH" x1="0" y1="0" x2="1" y2="0">
                          {stops.map((s, i) => (
                            <stop key={i} offset={`${s.offset}%`} stopColor={s.color} stopOpacity={0.55} />
                          ))}
                        </linearGradient>
                        <linearGradient id="areaFade" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#ffffff" stopOpacity={1} />
                          <stop offset="100%" stopColor="#ffffff" stopOpacity={0.05} />
                        </linearGradient>
                        <mask id="areaFadeMask">
                          <rect x="0" y="0" width="100%" height="100%" fill="url(#areaFade)" />
                        </mask>
                      </defs>
                      <CartesianGrid strokeDasharray="4 4" stroke="hsl(var(--muted-foreground))" opacity={0.4} vertical={true} horizontal={true} />
                      <XAxis
                        dataKey="date"
                        tickFormatter={(val) => {
                          const parts = val.split("-");
                          if (parts.length === 3) return `${parts[2]}/${parts[1]}`;
                          return val;
                        }}
                        tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                        stroke="hsl(var(--border))"
                      />
                      <YAxis
                        width={80}
                        tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                        stroke="hsl(var(--border))"
                        tickFormatter={(v) => `R$ ${(v / 1000).toFixed(0)}k`}
                      />
                      <Tooltip
                        cursor={{ strokeWidth: 0, stroke: "transparent", fill: "transparent" }}
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const data = payload[0].payload;
                            return (
                              <div
                                style={{
                                  background: "hsl(var(--popover))",
                                  border: "1px solid hsl(var(--border))",
                                  borderRadius: 8,
                                  padding: "8px 12px",
                                  fontFamily: "JetBrains Mono, monospace",
                                  fontSize: 12,
                                }}
                              >
                                <div style={{ color: "hsl(var(--foreground))", marginBottom: 4, fontWeight: 500 }}>
                                  {data.label}
                                </div>
                                <div style={{ color: "hsl(var(--foreground))" }}>
                                  {formatBRL(payload[0].value as number)}
                                </div>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />

                      {monthBoundaries.map((dateKey) => (
                        <ReferenceLine
                          key={dateKey}
                          x={dateKey}
                          stroke="hsl(var(--muted-foreground))"
                          strokeDasharray="4 4"
                          strokeWidth={2.5}
                          opacity={0.9}
                        />
                      ))}

                      <Area
                        type="monotone"
                        dataKey="saldo"
                        name="saldo"
                        stroke="url(#lineGrad)"
                        strokeWidth={2.5}
                        fill="url(#areaGradH)"
                        mask="url(#areaFadeMask)"
                      />

                    </AreaChart>
                  </ResponsiveContainer>
                );
              })()
            )}
          </div>
          {chartData.length > 0 && (() => {
            // Agrupa anos consecutivos preservando largura proporcional ao nº de pontos
            const segs: { year: string; count: number }[] = [];
            for (const p of chartData) {
              const y = yearOf(p.date);
              const last = segs[segs.length - 1];
              if (last && last.year === y) last.count += 1;
              else segs.push({ year: y, count: 1 });
            }
            const total = chartData.length;
            // Compensa as margens do AreaChart (left: 0 + YAxis ~45px, right: 16)
            return (
              <div className="mt-1 flex" style={{ paddingLeft: 45, paddingRight: 16 }}>
                {segs.map((s, i) => (
                  <div
                    key={i}
                    className="text-center font-mono text-[10px] tracking-[0.25em] text-muted-foreground"
                    style={{ flex: s.count / total }}
                  >
                    {s.year}
                  </div>
                ))}
              </div>
            );
          })()}
        </section>

        {/* Secondary filters (Middle) */}
        {renderFilters()}

        {/* Table */}
        <section className="rounded-2xl border border-border/60 bg-gradient-card p-6 md:p-8 shadow-card animate-fade-up">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="h-2 w-2 rounded-full bg-primary animate-pulse-glow" />
              <h2 className="font-display text-xl font-semibold tracking-tight">Histórico de Operações</h2>
            </div>
            <span className="font-mono text-[10px] tracking-[0.3em] text-muted-foreground">
              {invoices.length} {invoices.length === 1 ? "OPERAÇÃO" : "OPERAÇÕES"} · {filteredRows.length}{" "}
              {filteredRows.length === 1 ? "PARCELA" : "PARCELAS"}
            </span>
          </div>

          {/* Mobile cards */}
          <div className="space-y-2 md:hidden">
            {loading ? (
              <div className="py-12 text-center font-mono text-xs tracking-widest text-muted-foreground">
                CARREGANDO...
              </div>
            ) : filteredRows.length === 0 ? (
              <div className="py-12 text-center font-mono text-xs tracking-widest text-muted-foreground">
                NENHUMA ABERTURA NO PERÍODO
              </div>
            ) : (
              sortedRows.map((r) => {
                const canManage = isAdmin;
                return (
                  <div
                    key={r.key}
                    className={
                      "rounded-lg border border-border/40 p-3 space-y-1 " +
                      (r.settled
                        ? "bg-[hsl(var(--factoring-amber)/0.18)]"
                        : r.overdue
                        ? "bg-[hsl(var(--cost-red)/0.15)]"
                        : "bg-[hsl(var(--net-green)/0.12)]")
                    }
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-mono text-[10px] tracking-widest text-primary-glow">
                        NF {r.invoiceNumber} · P {r.parcelLabel}
                      </div>
                      <div className="flex items-center gap-2">
                        {r.settled ? (
                          <span className="rounded-full bg-factoring-amber/20 px-2 py-0.5 font-mono text-[9px] tracking-widest text-factoring-amber">
                            LIQUIDADA
                          </span>
                        ) : r.overdue ? (
                          <span className="rounded-full bg-cost-red/20 px-2 py-0.5 font-mono text-[9px] tracking-widest text-cost-red">
                            VENCIDA
                          </span>
                        ) : (
                          <span className="rounded-full bg-net-green/15 px-2 py-0.5 font-mono text-[9px] tracking-widest text-net-green">
                            ANDAMENTO
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-sm font-semibold truncate">{r.clientName}</div>
                    <div className="font-mono text-[10px] text-muted-foreground">
                      OP {fmtDate(r.operationDate)} · VENC {fmtDate(r.dueDate)} · {r.days} DIAS
                    </div>
                    <div className="font-mono text-[10px] text-muted-foreground">
                      POR {r.createdBy}
                    </div>
                    <div className="grid grid-cols-2 gap-2 pt-2 font-mono text-xs tabular-nums">
                      <div>
                        <div className="text-[9px] tracking-widest text-muted-foreground">VALOR BRUTO</div>
                        <div>{formatBRL(r.value)}</div>
                      </div>
                      <div>
                        <div className="text-[9px] tracking-widest text-muted-foreground">VALOR LÍQUIDO</div>
                        <div className="text-net-green">{formatBRL(r.presentValue)}</div>
                      </div>
                      <div>
                        <div className="text-[9px] tracking-widest text-muted-foreground">CUSTO</div>
                        <div className="text-cost-red">{formatBRL(r.cost)}</div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2 pt-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => toggleSettlement(r)}
                        className="font-mono text-[10px] tracking-widest"
                      >
                        {r.settled ? (
                          <>
                            <CheckCircle2 className="mr-1 h-3 w-3" /> DESFAZER
                          </>
                        ) : (
                          <>
                            <Circle className="mr-1 h-3 w-3" /> LIQUIDAR
                          </>
                        )}
                      </Button>
                      {canManage && (
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => openEdit(r.invoiceId)}
                            className="text-muted-foreground hover:text-primary"
                            aria-label="Editar"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDeleteOperation(r.invoiceId)}
                            className="text-muted-foreground hover:text-cost-red"
                            aria-label="Remover"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block rounded-lg border border-border/50 overflow-hidden">
            <table className="w-full table-auto text-[10px] lg:text-[11px]">
              <thead className="bg-muted/40 font-mono tracking-widest">
                <tr className="text-muted-foreground">
                  <th className="px-1.5 py-2 text-center font-medium">STATUS</th>
                  <SortableTh label="CLIENTE" sKey="clientName" />
                  <SortableTh label="NF" sKey="invoiceNumber" />
                  <SortableTh label="PARC." sKey="parcelLabel" />
                  <SortableTh label="ABERTURA" sKey="operationDate" />
                  <SortableTh label="VENC." sKey="dueDate" />
                  <SortableTh label="DIAS" sKey="days" />
                  <SortableTh label="TX MÊS" sKey="monthlyRate" />
                  <SortableTh label="TX EFET." sKey="effectivePct" />
                  <SortableTh label="BRUTO (R$)" sKey="value" />
                  <SortableTh label="LÍQUIDO (R$)" sKey="presentValue" />
                  <SortableTh label="CUSTO (R$)" sKey="cost" />
                  <SortableTh label="AUTOR" sKey="createdBy" />
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={13} className="py-12 text-center font-mono text-xs tracking-widest text-muted-foreground">
                      CARREGANDO...
                    </td>
                  </tr>
                ) : filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={13} className="py-12 text-center font-mono text-xs tracking-widest text-muted-foreground">
                      NENHUMA ABERTURA NO PERÍODO
                    </td>
                  </tr>
                ) : (
                  sortedRows.map((r) => {
                    const canManage = isAdmin;
                    return (
                      <tr
                        key={r.key}
                        className={
                          "border-t border-border/40 font-mono tabular-nums text-center transition-colors " +
                          rowClass(r)
                        }
                      >
                        <td className="px-2 py-2">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => toggleSettlement(r)}
                              onMouseEnter={() => !r.settled && setHoverKey(r.key)}
                              onMouseLeave={() => setHoverKey((k) => (k === r.key ? null : k))}
                              onFocus={() => !r.settled && setHoverKey(r.key)}
                              onBlur={() => setHoverKey((k) => (k === r.key ? null : k))}
                              title={
                                r.settled
                                  ? "Clique para desfazer a liquidação"
                                  : "Clique para marcar como LIQUIDADA"
                              }
                              className={
                                "group relative inline-block rounded-full px-2 py-0.5 text-[9px] tracking-widest transition-all cursor-pointer " +
                                (r.settled
                                  ? "bg-factoring-amber/20 text-factoring-amber hover:bg-factoring-amber/30"
                                  : r.overdue
                                  ? "bg-cost-red/20 text-cost-red hover:bg-factoring-amber/30 hover:text-factoring-amber"
                                  : "bg-net-green/15 text-net-green hover:bg-factoring-amber/30 hover:text-factoring-amber")
                              }
                            >
                              <span className="group-hover:hidden">
                                {r.settled
                                  ? "LIQUIDADA"
                                  : r.overdue
                                  ? "VENCIDA"
                                  : isDueSoon(r)
                                  ? weekdayShortPt(r.dueDate)
                                  : "ANDAMENTO"}
                              </span>
                              <span className="hidden group-hover:inline">
                                {r.settled ? "DESFAZER" : "LIQUIDAR"}
                              </span>
                            </button>
                            {canManage && (
                              <>
                                <button
                                  onClick={() => openEdit(r.invoiceId)}
                                  className="rounded p-1 text-muted-foreground transition-colors hover:bg-primary/15 hover:text-primary"
                                  title="Editar abertura"
                                  aria-label="Editar"
                                >
                                  <Pencil className="h-3 w-3" />
                                </button>
                                <button
                                  onClick={() => handleDeleteOperation(r.invoiceId)}
                                  className="rounded p-1 text-muted-foreground transition-colors hover:bg-cost-red/15 hover:text-cost-red"
                                  title="Remover abertura"
                                  aria-label="Remover"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                        <td className="px-2 py-2 max-w-[160px] truncate" title={r.clientName}>
                          {r.clientName}
                        </td>
                        <td className="px-1.5 py-2">{r.invoiceNumber}</td>
                        <td className="px-1.5 py-2">{r.parcelLabel}</td>
                        <td className="px-1.5 py-2">{fmtDateShort(r.operationDate)}</td>
                        <td className="px-1.5 py-2">{fmtDateShort(r.dueDate)}</td>
                        <td className="px-1.5 py-2">{r.days}</td>
                        <td className="px-1.5 py-2">{formatPct(r.monthlyRate)}</td>
                        <td className="px-1.5 py-2">{formatPct(r.effectivePct)}</td>
                        <td className="px-1.5 py-2">{formatBRLNum(r.value)}</td>
                        <td className="px-1.5 py-2 text-net-green">{formatBRLNum(r.presentValue)}</td>
                        <td className="px-1.5 py-2 text-cost-red">{formatBRLNum(r.cost)}</td>
                        <td className="px-2 py-2 max-w-[120px] truncate" title={r.createdBy}>
                          {r.createdBy}
                        </td>
                      </tr>
                    );
                  })
                )}

                {!loading && filteredRows.length > 0 && (
                  <tr className="border-t-2 border-primary-glow/40 bg-primary-glow/[0.07] font-mono tabular-nums text-center font-semibold">
                    <td className="px-2 py-2">—</td>
                    <td className="px-2 py-2 tracking-widest text-primary-glow">TOTAL</td>
                    <td className="px-2 py-2">—</td>
                    <td className="px-2 py-2">—</td>
                    <td className="px-2 py-2">—</td>
                    <td className="px-2 py-2">—</td>
                    <td className="px-2 py-2">—</td>
                    <td className="px-2 py-2">—</td>
                    <td className="px-1.5 py-2 text-center font-medium text-factoring-amber text-muted-foreground">{formatPct(totalEffective)}</td>
                    <td className="px-1.5 py-2">{formatBRLNum(totals.value)}</td>
                    <td className="px-1.5 py-2 text-net-green">{formatBRLNum(totals.presentValue)}</td>
                    <td className="px-1.5 py-2 text-cost-red">{formatBRLNum(totals.cost)}</td>
                    <td className="px-2 py-2">—</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <p className="mt-4 font-mono text-[10px] tracking-[0.25em] text-muted-foreground text-justify">
            * EDIÇÃO E REMOÇÃO DE OPERAÇÕES PERMITIDAS APENAS AO ADMINISTRADOR.
          </p>
        </section>
      </main>

      {/* Edit operation dialog (admin only) */}
      <Dialog open={!!editingId} onOpenChange={(o) => !o && closeEdit()}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">Editar abertura</DialogTitle>
            <DialogDescription className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground">
              ALTERAÇÕES APLICADAS IMEDIATAMENTE AO HISTÓRICO
            </DialogDescription>
          </DialogHeader>

          {editForm && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground">NF</Label>
                  <Input
                    value={editForm.invoice_number}
                    onChange={(e) => setEditForm((f) => f && { ...f, invoice_number: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground">VALOR DA NF</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={editForm.invoice_value}
                    onChange={(e) => setEditForm((f) => f && { ...f, invoice_value: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground">DATA DA ABERTURA</Label>
                  <DateField
                    value={editForm.operation_date}
                    onChange={(v) => setEditForm((f) => f && { ...f, operation_date: v })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground">TAXA MENSAL (%)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={editForm.monthly_rate}
                    onChange={(e) => setEditForm((f) => f && { ...f, monthly_rate: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground">
                    TAXA FACTORING MENSAL (%)
                  </Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={editForm.factoring_monthly_rate}
                    onChange={(e) =>
                      setEditForm((f) => f && { ...f, factoring_monthly_rate: e.target.value })
                    }
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="font-mono text-[10px] tracking-[0.25em] text-muted-foreground">
                    PARCELAS
                  </Label>
                  <Button type="button" size="sm" variant="outline" onClick={addInstallment}>
                    <Plus className="mr-1 h-3 w-3" /> Adicionar
                  </Button>
                </div>
                <div className="space-y-2">
                  {editForm.installments.map((it, idx) => (
                    <div
                      key={it.id}
                      className="grid grid-cols-[1fr_1fr_auto] items-end gap-2 rounded-lg border border-border/50 p-2"
                    >
                      <div className="space-y-1">
                        <Label className="font-mono text-[9px] tracking-widest text-muted-foreground">
                          VALOR #{idx + 1}
                        </Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={it.value}
                          onChange={(e) => updateInstallment(idx, { value: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="font-mono text-[9px] tracking-widest text-muted-foreground">
                          VENCIMENTO
                        </Label>
                        <DateField
                          value={it.dueDate}
                          onChange={(v) => updateInstallment(idx, { dueDate: v })}
                        />
                      </div>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        onClick={() => removeInstallment(idx)}
                        aria-label="Remover parcela"
                        className="text-muted-foreground hover:text-cost-red"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={closeEdit} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={saveEdit} disabled={saving}>
              {saving ? "Salvando..." : "Salvar alterações"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <footer className="border-t border-border/40 py-6 text-center">
        <p className="font-mono text-[10px] tracking-[0.35em] text-muted-foreground">MYKA MONEY · VERSÃO 2.0</p>
      </footer>
    </div>
  );
};

export default Historico;
