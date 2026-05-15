// v2 - filtros fixos na base
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AppHeader } from "@/components/AppHeader";
import { PageNav } from "@/components/PageNav";
import { RegistrationSection } from "@/components/RegistrationSection";
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

type Period = "data" | "semana" | "mes" | "total" | "periodo";
type StatusFilter = "todas" | "iniciadas" | "andamento" | "vencidas" | "liquidadas" | "a_vencer";

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
  ordem?: number | null;
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
const endOfMonthISO = () => {
  const d = new Date();
  return localISO(new Date(d.getFullYear(), d.getMonth() + 1, 0));
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
  const [showFuture, setShowFuture] = useState<boolean>(false);
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
      opNumber: number;
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
      const withinEditWindow = now - createdAtMs < 1 * 60 * 1000;
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
          opNumber: opNumberMap.get(inv.id) ?? 0,
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

  const dataBounds = useMemo(() => {
    if (rows.length === 0) return { from: todayStr, to: todayStr };
    let min = todayStr;
    let max = todayStr;
    for (const r of rows) {
      if (r.operationDate < min) min = r.operationDate;
      const cDate = r.createdAt.slice(0, 10);
      if (cDate < min) min = cDate;
      if (r.settled && r.settledDate && r.settledDate < min) min = r.settledDate;
      
      if (r.dueDate > max) max = r.dueDate;
      if (r.settled && r.settledDate && r.settledDate > max) max = r.settledDate;
    }
    return { from: min, to: max };
  }, [rows, todayStr]);

  const range = useMemo(() => {
    const todayStr = todayISO();
    if (period === "total") return { from: dataBounds.from, to: todayStr };
    if (period === "mes") return { from: startOfMonthISO(), to: endOfMonthISO() };
    if (period === "semana") return { from: startOfWeekISO(), to: endOfWeekISO() };
    if (period === "data") return { from: from || todayStr, to: from || todayStr };
    // periodo
    return { from: from || todayStr, to: to || todayStr };
  }, [period, from, to, todayStr, dataBounds]);

  const inRange = (d: string) => d >= range.from && d <= range.to;

  const filteredRows = useMemo(() => {
    if (statusFilter === "liquidadas") {
      return rows.filter((r) => r.settled && r.settledDate && inRange(r.settledDate));
    }
    if (statusFilter === "andamento") {
      return rows.filter(
        (r) => !r.settled && r.operationDate <= range.to && r.dueDate >= range.from
      );
    }
    if (statusFilter === "a_vencer") {
      return rows.filter((r) => !r.settled && inRange(r.dueDate));
    }
    if (statusFilter === "todas") {
      // Para "todas", incluímos tudo que começou até o fim do período.
      // A lógica de carryOver e eventos cuidará de abater o que já foi liquidado.
      return rows.filter((r) => r.operationDate <= range.to);
    }

    if (statusFilter === "vencidas") {
      return rows.filter((r) => !r.settled && r.overdue && inRange(r.dueDate));
    }

    const base = rows.filter((r) => inRange(r.operationDate));
    return base.filter((r) => !r.settled); 
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
  const factoringEffectiveRate = totals.value > 0 ? (totals.factoring / totals.value) * 100 : 0;
  const settledPresent = filteredRows.reduce((s, r) => s + (r.settled ? r.value : 0), 0);
  const openPresent = filteredRows.reduce((s, r) => s + (r.settled ? 0 : r.value), 0);

  const countBusinessDays = (fromISO: string, toISO: string) => {
    const start = new Date(fromISO + "T00:00:00");
    const end = new Date(toISO + "T00:00:00");
    let count = 0;
    const cur = new Date(start);
    while (cur <= end) {
      const dow = cur.getDay(); 
      if (dow !== 0 && dow !== 6) count++;
      cur.setDate(cur.getDate() + 1);
    }
    return Math.max(1, count);
  };
  const periodEndForDays = period === "total" && range.to > todayStr ? todayStr : range.to;
  const periodDays = Math.max(1, Math.round(
    (new Date(periodEndForDays + "T00:00:00").getTime() - new Date(range.from + "T00:00:00").getTime()) / 86_400_000
  ) + 1);

  const avgEnd = (statusFilter === "a_vencer" || range.to <= todayStr) ? range.to : todayStr;
  const businessDays = countBusinessDays(range.from, avgEnd);
  const dailyAvgOpen = openPresent / businessDays;
  const dailyAvgSettled = settledPresent / businessDays;
  const dailyAvgBruto = totals.value / businessDays;
  const dailyAvgNet = totals.presentValue / businessDays;

  const chartData = useMemo(() => {
    type Ev = { date: string; delta: number };

    const fmtTime = (iso: string) => {
      if (!iso.includes("T")) return "00:00";
      return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    };

    const allEvents: Ev[] = [];
    if (statusFilter === "a_vencer") {
      for (const r of filteredRows) {
        allEvents.push({ date: r.dueDate.slice(0, 10), delta: -r.value });
      }
    } else if (statusFilter === "liquidadas") {
      for (const r of filteredRows) {
        if (r.settled) {
          // No gráfico de liquidadas, usamos a data de vencimento (regra: liq = venc)
          const rawDate = r.dueDate;
          const setDate = (period === "data") ? rawDate : rawDate.slice(0, 10);
          allEvents.push({ date: setDate, delta: r.value });
        }
      }
    } else {
      // Para TODAS, INICIADAS, ANDAMENTO e VENCIDAS:
      // Gráfico de SALDO EM ABERTO: Início (+) e Liquidação (-)
      for (const r of filteredRows) {
        // Regra: Operações VENCIDAS entram no gráfico na DATA DE VENCIMENTO.
        // As demais (em andamento ou já liquidadas) entram na DATA DE OPERAÇÃO.
        const isOverdue = !r.settled && r.dueDate < todayStr;
        const evDate = isOverdue
          ? r.dueDate.slice(0, 10)
          : ((period === "data") ? r.createdAt : r.operationDate.slice(0, 10));
          
        allEvents.push({ date: evDate, delta: r.value });
        
        if (r.settled) {
          // Liquidada: Abate do saldo na data de vencimento (histórico ou futuro)
          const rawDate = r.dueDate;
          const setDate = (period === "data") ? rawDate : rawDate.slice(0, 10);
          allEvents.push({ date: setDate, delta: -r.value });
        } else if (r.dueDate > todayStr) {
          // Não liquidada (Iniciada/Andamento): Abate do saldo apenas se o vencimento for FUTURO (projeção tracejada)
          const rawDate = r.dueDate;
          const setDate = (period === "data") ? rawDate : rawDate.slice(0, 10);
          allEvents.push({ date: setDate, delta: -r.value });
        }
        // Se estiver vencida (não liquidada e vencimento no passado), NÃO adicionamos o evento de abatimento.
        // Isso mantém o saldo "alto" no histórico até que a operação seja liquidada.
      }
    }

    if (allEvents.length === 0)
      return [] as { date: string; label: string; labelShort: string; saldo: number | null; saldoFuturo?: number }[];

    // Para filtros de saldo, precisamos do saldo anterior ao início do período
    let carryOver = 0;
    const balanceFilters: StatusFilter[] = ["todas", "iniciadas", "andamento", "vencidas"];
    if (balanceFilters.includes(statusFilter)) {
      const pastEvents = allEvents.filter((e) => e.date < range.from);
      carryOver = pastEvents.reduce((sum, e) => sum + e.delta, 0);
    } else if (statusFilter === "a_vencer") {
      // Saldo inicial é a soma de todos os valores "a vencer" no período
      carryOver = filteredRows.reduce((sum, r) => sum + r.value, 0);
    }

    // Eventos que ocorreram DENTRO do período
    const periodEvents = allEvents.filter((e) => {
      if (period === "data") return e.date.startsWith(range.from);
      return e.date >= range.from && e.date <= range.to;
    });

    // Agrupa eventos do período por data
    const byDate = new Map<string, number>();
    periodEvents.forEach((e) => {
      byDate.set(e.date, (byDate.get(e.date) ?? 0) + e.delta);
    });

    // Garante que o início e fim do período estejam presentes no eixo X para mostrar as datas corretamente
    if (range.from && !byDate.has(range.from)) byDate.set(range.from, 0);
    if (range.to && !byDate.has(range.to)) byDate.set(range.to, 0);

    if (period === "semana") {
      // Garante que todos os dias da semana estejam presentes no eixo X
      const d = new Date(range.from + "T00:00:00");
      const end = new Date(range.to + "T00:00:00");
      while (d <= end) {
        const iso = localISO(d);
        if (!byDate.has(iso)) byDate.set(iso, 0);
        d.setDate(d.getDate() + 1);
      }
    }

    const sortedDates = Array.from(byDate.keys()).sort();

    const series: { date: string; label: string; labelShort: string; saldo: number | null; saldoFuturo?: number }[] = [];

    const allDatesSorted = allEvents.map((e) => e.date).sort();
    const firstHistoricalDate = allDatesSorted[0];
    const includesFirst = firstHistoricalDate >= range.from && firstHistoricalDate <= range.to;

    if (statusFilter === "liquidadas") {
      // Sempre começa em zero — o gráfico mostra apenas saídas (liquidações)
      const anchor = sortedDates[0] ?? range.from;
      const baseDate = new Date(anchor + "T00:00:00");
      baseDate.setDate(baseDate.getDate() - 1);
      const baseline = localISO(baseDate);
      series.push({ date: baseline, label: fmtDate(baseline), labelShort: fmtDayMonth(baseline), saldo: 0 });
    } else if (period === "total" && includesFirst && statusFilter !== "a_vencer") {
      // Começa em zero UM DIA ANTES da primeira operação histórica
      const d = new Date(sortedDates[0] + "T00:00:00");
      d.setDate(d.getDate() - 1);
      const baseline = localISO(d);
      series.push({ date: baseline, label: fmtDate(baseline), labelShort: fmtDayMonth(baseline), saldo: 0 });
    } else {
      // Período NÃO é total ou não engloba a primeira operação: começa com o saldo acumulado real
      // ancorado no início do intervalo
      const anchor = range.from > "1900-01-01" ? range.from : (sortedDates[0] || todayStr);
      const startVal = Math.round(carryOver * 100) / 100;
      const isAnchorFuture = anchor > todayStr;
      series.push({
        date: anchor,
        label: (period === "data") ? `${fmtDate(anchor)} 00:00` : fmtDate(anchor),
        labelShort: (period === "data") ? "00:00" : fmtDayMonth(anchor),
        saldo: isAnchorFuture ? null : startVal,
        saldoFuturo: isAnchorFuture ? startVal : undefined,
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
          const val = Math.round(currentSaldo * 100) / 100;
          const isGapFuture = firstStr > todayStr;
          series.push({
            date: firstStr,
            label: fmtDate(firstStr),
            labelShort: fmtDayMonth(firstStr),
            saldo: isGapFuture ? null : val,
            saldoFuturo: isGapFuture ? val : undefined,
          });
        }
        temp.setMonth(temp.getMonth() + 1);
      }
    };

    const isAVencer = statusFilter === "a_vencer";
    let acc = (statusFilter === "liquidadas" || (period === "total" && includesFirst && !isAVencer)) ? 0 : carryOver;
    for (const d of sortedDates) {
      fillGaps(d, acc);

      acc += byDate.get(d)!;
      const currentVal = Math.round(acc * 100) / 100;
      
      const isFuture = d > todayStr;
      const useFuture = isFuture;

      // Evita ponto duplicado se o primeiro evento coincide com o anchor
      if (series.length && series[series.length - 1].date === d) {
        if (useFuture) series[series.length - 1].saldoFuturo = currentVal;
        else series[series.length - 1].saldo = currentVal;
      } else {
        series.push({
          date: d,
          label: (period === "data") ? `${fmtDate(d.slice(0, 10))} ${fmtTime(d)}` : fmtDate(d),
          labelShort: (period === "data") ? fmtTime(d) : fmtDayMonth(d),
          saldo: useFuture ? null : currentVal,
          saldoFuturo: useFuture ? currentVal : undefined,
        });
      }
    }

    if (period === "data" && range.from === todayStr) {
      const last = series[series.length - 1];
      if (last) {
        series.push({
          date: "agora",
          label: `${fmtDate(todayStr)} Agora`,
          labelShort: "AGORA",
          saldo: last.saldo,
          saldoFuturo: (last as any).saldoFuturo,
        });
      }
    } else if (period !== "data") {
      const last = series[series.length - 1];
      const hasToday = series.some((s) => s.date === todayStr);
      if (!hasToday) {
        if (last && last.date < todayStr) {
          const lastSaldo = last.saldo ?? last.saldoFuturo ?? 0;
          fillGaps(todayStr, lastSaldo);
          series.push({
            date: todayStr,
            label: fmtDate(todayStr),
            labelShort: fmtDayMonth(todayStr),
            saldo: isAVencer ? null : lastSaldo,
            saldoFuturo: isAVencer ? lastSaldo : undefined,
          });
        } else if (last && last.date > todayStr) {
          const insertIdx = series.findIndex((s) => s.date > todayStr);
          if (insertIdx > 0) {
            const prev = series[insertIdx - 1];
            const prevVal = prev.saldo ?? prev.saldoFuturo ?? 0;
            series.splice(insertIdx, 0, {
              date: todayStr,
              label: fmtDate(todayStr),
              labelShort: fmtDayMonth(todayStr),
              saldo: isAVencer ? null : prevVal,
              saldoFuturo: isAVencer ? prevVal : undefined,
            });
          }
        }
      }
    }

    // Bridge historical to future points
    for (let i = 0; i < series.length - 1; i++) {
      if (series[i].date <= todayStr && series[i+1].date > todayStr) {
        if (series[i].saldo !== null) {
          series[i].saldoFuturo = series[i].saldo;
        }
      }
    }
    
    return series;
  }, [filteredRows, statusFilter, range.from, range.to, todayStr, period]);

  const chartGradId = useMemo(() => Math.random().toString(36).substr(2, 9), [chartData]);

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
      console.error("Erro ao liquidar:", error);
      const { friendlyDbError } = await import("@/lib/dbErrors");
      toast.error(friendlyDbError(error, "Erro ao atualizar liquidação"));
      load();
    } else {
      toast.success(
        !isSettled ? "Parcela marcada como liquidada" : "Liquidação removida"
      );
      // Recarrega para refletir a nova autoria (created_by passa para quem liquidou)
      load();
    }
  };

  const handleDeleteOperation = async (invoiceId: string) => {
    const inv = invoices.find((i) => i.id === invoiceId);
    if (!inv) return;
    const createdAtMs = new Date(inv.created_at).getTime();
    const withinEditWindow = Date.now() - createdAtMs < 1 * 60 * 1000;
    const isAuthor = !!user && inv.created_by === user.id;
    const canManage = isAdmin || (isAuthor && withinEditWindow);
    if (!canManage) return toast.error("Sem permissão para excluir esta abertura");
    if (!confirm("Deseja realmente excluir a abertura? Essa ação não pode ser desfeita.")) return;
    try {
      const { error: deleteError } = await supabase.from("invoices").delete().eq("id", invoiceId);
      if (deleteError) throw deleteError;
      toast.success("Abertura removida");
      load();
    } catch (error) {
      const { friendlyDbError } = await import("@/lib/dbErrors");
      toast.error(friendlyDbError(error, "Erro ao excluir abertura"));
    }
  };

  const [editingId, setEditingId] = useState<string | null>(null);

  const openEdit = (invoiceId: string) => {
    const inv = invoices.find((i) => i.id === invoiceId);
    if (!inv) return;
    const createdAtMs = new Date(inv.created_at).getTime();
    const withinEditWindow = Date.now() - createdAtMs < 1 * 60 * 1000;
    const isAuthor = !!user && inv.created_by === user.id;
    const canManage = isAdmin || (isAuthor && withinEditWindow);
    if (!canManage) return toast.error("Sem permissão para editar esta abertura");
    setEditingId(invoiceId);
  };

  const closeEdit = () => {
    setEditingId(null);
  };

  const invoiceToEditProps = useMemo(() => {
    if (!editingId || !invoices) return undefined;
    const inv = invoices.find(i => i.id === editingId);
    if (!inv) return undefined;
    return {
      id: inv.id,
      client_id: inv.client_id,
      invoice_number: inv.invoice_number,
      invoice_value: Number(inv.invoice_value),
      operation_date: inv.operation_date,
      monthly_rate: Number(inv.monthly_rate),
      factoring_monthly_rate: inv.factoring_monthly_rate ? Number(inv.factoring_monthly_rate) : null,
      installments: Array.isArray(inv.installments) ? (inv.installments as Installment[]) : [],
      ordem: inv.ordem,
    };
  }, [editingId, invoices]);


  const periodOptions: { id: Period; label: string }[] = [
    { id: "total", label: "TOTAL" },
    { id: "data", label: "DATA" },
    { id: "semana", label: "SEMANA" },
    { id: "mes", label: "MÊS" },
    { id: "periodo", label: "INTERVALO" },
  ];

  const statusOptions: { id: StatusFilter; label: string }[] = [
    { id: "todas", label: "TODAS" },
    { id: "iniciadas", label: "INICIADAS" },
    { id: "andamento", label: "ANDAMENTO" },
    { id: "vencidas", label: "VENCIDAS" },
    { id: "liquidadas", label: "LIQUIDADAS" },
    { id: "a_vencer", label: "A VENCER" },
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

  const renderFiltersBar = () => (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 backdrop-blur-md"
      style={{
        background: "linear-gradient(to top, hsl(var(--background)) 0%, hsl(var(--background)/0.92) 55%, transparent 100%)",
      }}
    >
      {/* Decorative top line */}
      <div className="h-px w-full bg-gradient-to-r from-transparent via-primary/40 to-transparent" />

      <div className="flex flex-col items-center gap-2 px-4 py-3">
        {/* Period label */}
        <span className="font-mono text-[9px] tracking-[0.3em] text-muted-foreground/70">
          {period === "total" ? (
            (() => {
              const label = {
                todas: "TODAS AS OPERAÇÕES",
                iniciadas: "OPERAÇÕES INICIADAS",
                andamento: "OPERAÇÕES EM ANDAMENTO",
                vencidas: "OPERAÇÕES VENCIDAS",
                liquidadas: "OPERAÇÕES LIQUIDADAS",
                a_vencer: "OPERAÇÕES A VENCER",
              }[statusFilter] || "OPERAÇÕES";
              return `${label} ATÉ A DATA DE HOJE`;
            })()
          ) : period !== "periodo" ? (
            range.from === range.to ? fmtDate(range.from) : `${fmtDate(range.from)} → ${fmtDate(range.to)}`
          ) : null}
        </span>

        {/* Custom date range inputs */}
        {(period === "periodo" || period === "data") && (
          <div className="flex items-center justify-center gap-3">
            {period === "data" ? (
              <div className="flex items-center gap-2">
                <span className="font-mono text-[9px] tracking-[0.25em] text-muted-foreground">DATA</span>
                <DateField value={from} onChange={(v) => { setFrom(v); setTo(v); }} />
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[9px] tracking-[0.25em] text-muted-foreground">DE</span>
                  <DateField value={from} onChange={setFrom} />
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[9px] tracking-[0.25em] text-muted-foreground">ATÉ</span>
                  <DateField value={to} onChange={setTo} />
                </div>
              </>
            )}
          </div>
        )}

        {/* Filter rows */}
        <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6">
          {/* Period pills */}
          <div className="flex flex-col items-center gap-1.5">
            <span className="font-mono text-[8px] tracking-[0.2em] text-muted-foreground/60 uppercase">PERÍODO DE TEMPO</span>
            <div className="inline-flex flex-wrap justify-center rounded-full border border-border/50 bg-background/60 p-1 gap-1 shadow-panel">
              {periodOptions.map((opt) => {
                const active = period === opt.id;
                return (
                  <button
                    key={opt.id}
                    onClick={() => setPeriod(opt.id)}
                    className={
                      "inline-flex items-center rounded-full px-3 py-1 font-mono text-[9px] tracking-[0.25em] transition-all whitespace-nowrap " +
                      (active
                        ? "bg-primary text-primary-foreground shadow-[0_0_12px_hsl(var(--primary)/0.5)]"
                        : "text-muted-foreground hover:text-foreground")
                    }
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Divider */}
          <div className="h-10 w-px bg-border/30 hidden sm:block mt-3" />

          {/* Status pills */}
          <div className="flex flex-col items-center gap-1.5">
            <span className="font-mono text-[8px] tracking-[0.2em] text-muted-foreground/60 uppercase">STATUS DAS OPERAÇÕES</span>
            <div className="inline-flex flex-wrap justify-center rounded-full border border-border/50 bg-background/60 p-1 gap-1 shadow-panel">
              {statusOptions.map((opt) => {
                const active = statusFilter === opt.id;
                return (
                  <button
                    key={opt.id}
                    onClick={() => setStatusFilter(opt.id)}
                    className={
                      "inline-flex items-center rounded-full px-3 py-1 font-mono text-[9px] tracking-[0.25em] transition-all whitespace-nowrap " +
                      (active
                        ? "bg-primary text-primary-foreground shadow-[0_0_12px_hsl(var(--primary)/0.5)]"
                        : "text-muted-foreground hover:text-foreground")
                    }
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  // alias para compatibilidade com versão anterior (evita ReferenceError no Lovable)
  const renderFilters = renderFiltersBar;

  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto w-full max-w-[1600px] px-4 md:px-8 lg:px-12 py-4 md:py-6 pb-36 space-y-8">
        <PageNav />

        {/* Summary panels — reflect selected period */}
        <section className="grid gap-4 md:grid-cols-3 animate-fade-up">
          <div className="relative overflow-hidden rounded-xl bg-gradient-net p-4 text-net-green-foreground panel-glow-net">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,255,255,0.25),transparent_60%)]" />
            <div className="relative">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="font-mono text-[9px] tracking-[0.3em] opacity-80">VALOR LÍQUIDO</div>
                  <div className="mt-1 font-display text-xl md:text-2xl font-bold tabular-nums whitespace-nowrap">
                    {formatBRL(totals.presentValue)}
                  </div>
                </div>
                <div>
                  <div className="font-mono text-[9px] tracking-[0.25em] opacity-70 text-right">MÉDIA DIÁRIA</div>
                  <div className="mt-1 font-display text-xl font-bold tabular-nums text-right opacity-90 whitespace-nowrap md:text-lg">
                    {formatBRL(dailyAvgNet)}
                  </div>
                </div>
              </div>
              <div className="mt-3 h-px bg-white/20" />
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <div className="font-mono text-[9px] tracking-[0.3em] opacity-80">VALOR BRUTO</div>
                  <div className="mt-1 font-display text-lg font-semibold tabular-nums whitespace-nowrap">
                    {formatBRL(totals.value)}
                  </div>
                </div>
                <div>
                  <div className="font-mono text-[9px] tracking-[0.25em] opacity-70 text-right">MÉDIA DIÁRIA</div>
                  <div className="mt-1 font-display text-lg font-semibold tabular-nums text-right opacity-90 whitespace-nowrap">
                    {formatBRL(dailyAvgBruto)}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="relative overflow-hidden rounded-xl bg-gradient-cost p-4 text-cost-red-foreground panel-glow-cost">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,255,255,0.25),transparent_60%)]" />
            <div className="relative">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="font-mono text-[9px] tracking-[0.3em] opacity-80">CUSTO</div>
                  <div className="mt-1 font-display text-xl md:text-2xl font-bold tabular-nums whitespace-nowrap">
                    {formatBRL(totals.cost)}
                  </div>
                </div>
                <div>
                  <div className="font-mono text-[9px] tracking-[0.3em] opacity-80 text-right">TAXA EFETIVA</div>
                  <div className="mt-1 font-display text-xl font-bold tabular-nums text-right whitespace-nowrap md:text-lg">
                    {formatPct(totalEffective)}
                  </div>
                </div>
              </div>
              <div className="mt-3 h-px bg-white/20" />
              <div className="grid grid-cols-2 gap-3 mt-3">
                <div>
                  <div className="font-mono text-[9px] tracking-[0.3em] opacity-80">ECONOMIA FACTORING</div>
                  <div className="mt-1 font-display text-lg font-semibold tabular-nums whitespace-nowrap">
                    {formatBRL(factoringSavings)}
                  </div>
                </div>
                <div>
                  <div className="font-mono text-[9px] tracking-[0.3em] opacity-80 text-right">TAXA EFETIVA</div>
                  <div className="mt-1 font-display text-lg font-semibold tabular-nums text-right whitespace-nowrap">
                    {formatPct(factoringEffectiveRate)}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="relative overflow-hidden rounded-xl bg-gradient-factoring p-4 text-white panel-glow-factoring">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,255,255,0.25),transparent_60%)]" />
            <div className="relative flex flex-col h-full">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="font-mono text-[9px] tracking-[0.3em] opacity-90">VALOR EM ABERTO</div>
                  <div className="mt-1 font-display text-xl md:text-2xl font-bold tabular-nums whitespace-nowrap">
                    {formatBRL(openPresent)}
                  </div>
                </div>
                <div>
                  <div className="font-mono text-[9px] tracking-[0.25em] opacity-70 text-right">MÉDIA DIÁRIA</div>
                  <div className="mt-1 font-display text-lg font-semibold tabular-nums text-right opacity-90 whitespace-nowrap">
                    {formatBRL(dailyAvgOpen)}
                  </div>
                </div>
              </div>
              <div className="mt-3 h-px bg-white/25" />
              <div className="mt-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="font-mono text-[9px] tracking-[0.3em] opacity-90">VALOR LIQUIDADO</div>
                    <div className="mt-1 font-display text-lg font-semibold tabular-nums whitespace-nowrap">
                      {formatBRL(settledPresent)}
                    </div>
                  </div>
                  <div>
                    <div className="font-mono text-[9px] tracking-[0.25em] opacity-70 text-right">MÉDIA DIÁRIA</div>
                    <div className="mt-1 font-display text-lg font-semibold tabular-nums text-right opacity-90 whitespace-nowrap">
                      {formatBRL(dailyAvgSettled)}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Chart */}
        <section className="rounded-2xl border border-border/60 bg-gradient-card p-6 md:p-8 shadow-card animate-fade-up">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="h-2 w-2 rounded-full animate-color-cycle" />
              <h2 className="font-display text-xl font-semibold tracking-tight">
                Gráfico Evolutivo
              </h2>
            </div>
            <span className="font-mono text-[10px] tracking-[0.3em] text-muted-foreground">
              {periodDays} {periodDays === 1 ? "DIA" : "DIAS"}
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
                const isFuture = (idx: number) => {
                  const p: any = chartData[idx];
                  return p?.saldo == null && p?.saldoFuturo != null;
                };
                const valOf = (idx: number) => {
                  const p: any = chartData[idx];
                  return (isFuture(idx) ? p.saldoFuturo : p?.saldo ?? 0) as number;
                };
                const neighbor = (i: number, dir: -1 | 1) => {
                  const target = isFuture(i);
                  let j = i + dir;
                  while (j >= 0 && j < n && isFuture(j) !== target) j += dir;
                  if (j < 0 || j >= n) j = i;
                  return j;
                };
                const slopes: number[] = [];
                for (let i = 0; i < n; i++) {
                  slopes.push(valOf(neighbor(i, 1)) - valOf(neighbor(i, -1)));
                }
                const maxAbs = Math.max(1, ...slopes.map((s) => Math.abs(s)));
                const histIdx = chartData.map((_, i) => i).filter((i) => !isFuture(i));
                const histN = histIdx.length;
                const isAVencerFilter = statusFilter === "a_vencer";
                const stops = histN === 0
                  ? [{ offset: 0, color: "hsl(var(--muted-foreground))" }, { offset: 100, color: "hsl(var(--muted-foreground))" }]
                  : histIdx.map((origIdx, k) => ({
                      offset: histN <= 1 ? 0 : (k / (histN - 1)) * 100,
                      color: slopeColor(slopes[origIdx], maxAbs),
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

                const gradId = chartGradId;
                return (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id={`lineGrad-${gradId}`} x1="0" y1="0" x2="1" y2="0">
                          {stops.map((s, i) => (
                            <stop key={i} offset={`${s.offset}%`} stopColor={s.color} stopOpacity={1} />
                          ))}
                        </linearGradient>
                        <linearGradient id={`areaGradH-${gradId}`} x1="0" y1="0" x2="1" y2="0">
                          {stops.map((s, i) => (
                            <stop key={i} offset={`${s.offset}%`} stopColor={s.color} stopOpacity={0.55} />
                          ))}
                        </linearGradient>
                        <linearGradient id={`areaFade-${gradId}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#ffffff" stopOpacity={1} />
                          <stop offset="100%" stopColor="#ffffff" stopOpacity={0.05} />
                        </linearGradient>
                        <mask id={`areaFadeMask-${gradId}`}>
                          <rect x="0" y="0" width="100%" height="100%" fill={`url(#areaFade-${gradId})`} />
                        </mask>
                      </defs>
                      <CartesianGrid strokeDasharray="4 4" stroke="hsl(var(--muted-foreground))" opacity={0.4} vertical={true} horizontal={true} />
                      <XAxis
                        dataKey="date"
                        interval={period === "semana" ? 0 : "preserveStartEnd"}
                        tickFormatter={(val) => {
                          const parts = val.split("-");
                          if (parts.length === 3) return parts[2];
                          return val;
                        }}
                        tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                        stroke="hsl(var(--border))"
                      />
                      <YAxis
                        width={50}
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
                        stroke={`url(#lineGrad-${gradId})`}
                        strokeWidth={2.5}
                        fill={`url(#areaGradH-${gradId})`}
                        mask={`url(#areaFadeMask-${gradId})`}
                        connectNulls={false}
                        isAnimationActive={false}
                      />
                      {statusFilter !== "liquidadas" && (
                        <Area
                          type="monotone"
                          dataKey="saldoFuturo"
                          name="projeção"
                          stroke={isAVencerFilter ? "hsl(var(--muted-foreground))" : "hsl(0 0% 100%)"}
                          strokeWidth={2.5}
                          strokeDasharray="6 4"
                          fill="hsl(var(--muted-foreground))"
                          fillOpacity={0.35}
                          connectNulls={true}
                          isAnimationActive={false}
                        />
                      )}

                    </AreaChart>
                  </ResponsiveContainer>
                );
              })()
            )}
          </div>
          {chartData.length > 0 && (() => {
            const MONTHS_PT = ["JANEIRO","FEVEREIRO","MARÇO","ABRIL","MAIO","JUNHO","JULHO","AGOSTO","SETEMBRO","OUTUBRO","NOVEMBRO","DEZEMBRO"];
            // Agrupa meses consecutivos
            const monthSegs: { key: string; label: string; count: number }[] = [];
            for (const p of chartData) {
              const [y, m] = p.date.split("-");
              const key = `${y}-${m}`;
              const label = MONTHS_PT[parseInt(m, 10) - 1] || m;
              const last = monthSegs[monthSegs.length - 1];
              if (last && last.key === key) last.count += 1;
              else monthSegs.push({ key, label, count: 1 });
            }
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
              <>
                <div className="mt-1 flex bg-muted/40 rounded-sm" style={{ marginLeft: 50, marginRight: 16 }}>
                  {monthSegs.map((s, i) => (
                    <div
                      key={i}
                      className="text-center font-mono text-[10px] tracking-[0.2em] text-muted-foreground py-1 overflow-hidden whitespace-nowrap"
                      style={{ flex: s.count / total }}
                    >
                      {s.label}
                    </div>
                  ))}
                </div>
                <div className="mt-1 flex" style={{ paddingLeft: 50, paddingRight: 16 }}>
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
              </>
            );
          })()}
        </section>

        {/* Secondary filters (Middle) */}
        {renderFilters()}

        {/* Table */}
        <section className="rounded-2xl border border-border/60 bg-gradient-card p-6 md:p-8 shadow-card animate-fade-up">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="h-2 w-2 rounded-full animate-color-cycle" />
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
                const canManage = isAdmin || (r.isAuthor && r.withinEditWindow);
                return (
                  <div
                    key={r.key}
                    className={
                      "group/card rounded-lg border border-border/40 p-3 space-y-1 relative " +
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
                        <div className="flex items-center gap-1 opacity-0 group-hover/card:opacity-100 transition-opacity">
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
                  <th className="px-1.5 py-2 text-center font-medium">#</th>
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
                    <td colSpan={14} className="py-12 text-center font-mono text-xs tracking-widest text-muted-foreground">
                      CARREGANDO...
                    </td>
                  </tr>
                ) : filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={14} className="py-12 text-center font-mono text-xs tracking-widest text-muted-foreground">
                      NENHUMA ABERTURA NO PERÍODO
                    </td>
                  </tr>
                ) : (
                  sortedRows.map((r) => {
                    const canManage = isAdmin || (r.isAuthor && r.withinEditWindow);
                    return (
                      <tr
                        key={r.key}
                        className={
                          "group/row border-t border-border/40 font-mono tabular-nums text-center transition-colors " +
                          rowClass(r)
                        }
                      >
                        <td className="px-1.5 py-2 text-muted-foreground">{r.parcelLabel === "ÚNICA" ? r.opNumber : `${r.opNumber}${String.fromCharCode(96 + Number(r.parcelLabel))}`}</td>
                        <td className="relative px-2 py-2">
                          <div className="inline-flex items-center justify-center">
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
                              <div className="absolute left-[calc(100%-0.25rem)] top-1/2 -translate-y-1/2 flex items-center gap-0.5 opacity-0 pointer-events-none group-hover/row:opacity-100 group-hover/row:pointer-events-auto transition-all bg-background/95 backdrop-blur-sm border border-border/50 rounded-md p-0.5 shadow-sm z-10">
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
                              </div>
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
            * EDIÇÕES E EXCLUSÕES DE OPERAÇÕES PERMITIDAS DENTRO DE UM MINUTO APÓS O CADASTRO.
          </p>
        </section>
      </main>

      {/* Fixed bottom filter bar */}
      {renderFiltersBar()}

      {/* Edit operation dialog */}
      <Dialog open={!!editingId} onOpenChange={(o) => !o && closeEdit()}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto bg-transparent border-none p-0 shadow-none">
          <DialogTitle className="sr-only">Editar Abertura</DialogTitle>
          {invoiceToEditProps && (
            <RegistrationSection
              invoiceToEdit={invoiceToEditProps}
              onSaveSuccess={(updated) => {
                if (updated) {
                  setInvoices((prev) => prev.map((i) => (i.id === updated.id ? { ...i, ...updated } : i) as any));
                }
                closeEdit();
                load();
              }}
              onCancel={closeEdit}
            />
          )}
        </DialogContent>
      </Dialog>

      <footer className="border-t border-border/40 py-6 text-center">
        <p className="font-mono text-[10px] tracking-[0.35em] text-muted-foreground">MYKACA$H · VERSÃO 2.4</p>
      </footer>
    </div>
  );
};

export default Historico;
