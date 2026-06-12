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
import { CheckCircle2, Circle, Pencil, Trash2, Plus, X, ArrowUp, ArrowDown, ArrowUpDown, SlidersHorizontal } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
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
  const [settlingRow, setSettlingRow] = useState<any | null>(null);
  const [settlementDate, setSettlementDate] = useState<string>("");
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState<boolean>(false);
  const [activeAlertTab, setActiveAlertTab] = useState<"diaria" | "mensal" | "anual">("diaria");

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
        "id, invoice_number, invoice_value, operation_date, monthly_rate, factoring_monthly_rate, installments, settled_installments, client_id, created_at, created_by, ordem, clients(name), profiles:created_by(display_name, username)"
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
        inv.profiles?.display_name || inv.profiles?.username || "—";

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
          opNumber: Number((inv as any).ordem) || 0,
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
    if (period === "total") {
      return { from: dataBounds.from, to: todayStr };
    }
    if (period === "mes") return { from: startOfMonthISO(), to: endOfMonthISO() };
    if (period === "semana") return { from: startOfWeekISO(), to: endOfWeekISO() };
    if (period === "data") return { from: from || todayStr, to: from || todayStr };
    // periodo
    return { from: from || todayStr, to: to || todayStr };
  }, [period, from, to, todayStr, dataBounds, statusFilter]);

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
          // Operações a partir de jun/2026 usam a data REAL de liquidação;
          // anteriores usam o vencimento (datas de liquidação antigas eram aleatórias).
          const useSettled = r.operationDate.slice(0, 7) >= "2026-06" && r.settledDate;
          const rawDate = useSettled ? (r.settledDate as string) : r.dueDate;
          const setDate = (period === "data") ? rawDate : rawDate.slice(0, 10);
          allEvents.push({ date: setDate, delta: r.value });
        }
      }
    } else {
      // Para TODAS, INICIADAS, ANDAMENTO e VENCIDAS:
      // Gráfico de SALDO EM ABERTO: Início (+) e Liquidação (-)
      for (const r of filteredRows) {
        // As operações entram no gráfico na DATA DE OPERAÇÃO.
        const evDate = (period === "data") ? r.createdAt : r.operationDate.slice(0, 10);
          
        allEvents.push({ date: evDate, delta: r.value });
        
        if (r.settled) {
          // Operações a partir de jun/2026 usam a data REAL de liquidação;
          // anteriores usam o vencimento (datas de liquidação antigas eram aleatórias).
          const useSettled = r.operationDate.slice(0, 7) >= "2026-06" && r.settledDate;
          const rawDate = useSettled ? (r.settledDate as string) : r.dueDate;
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

    if (period === "semana" || period === "mes" || period === "periodo") {
      // Garante que todos os dias do período estejam presentes no eixo X
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

    if (isSettled) {
      // Se já está liquidada, apenas remove sem perguntar data
      const next: SettledEntry[] = current.filter((e) => settledIdOf(e) !== row.installmentId);
      await saveSettlement(inv.id, next, "Liquidação removida");
    } else {
      // Se vai liquidar, pergunta a data
      setSettlementDate(row.dueDate);
      setSettlingRow(row);
    }
  };

  const saveSettlement = async (invoiceId: string, next: SettledEntry[], successMsg: string) => {
    // optimistic
    setInvoices((prev) =>
      prev.map((i) => (i.id === invoiceId ? { ...i, settled_installments: next } : i))
    );
    const { error } = await supabase.rpc("toggle_invoice_settlement", {
      _invoice_id: invoiceId,
      _settled_ids: next as any,
    });
    if (error) {
      console.error("Erro ao liquidar:", error);
      const { friendlyDbError } = await import("@/lib/dbErrors");
      toast.error(friendlyDbError(error, "Erro ao atualizar liquidação"));
      load();
    } else {
      toast.success(successMsg);
      load();
    }
  };

  const confirmSettlement = async () => {
    if (!settlingRow) return;
    const inv = invoices.find((i) => i.id === settlingRow.invoiceId);
    if (!inv) return;
    const current: SettledEntry[] = Array.isArray(inv.settled_installments)
      ? (inv.settled_installments as any)
      : [];
    
    const next: SettledEntry[] = [...current, { id: settlingRow.installmentId, date: settlementDate }];
    await saveSettlement(inv.id, next, "Parcela marcada como liquidada");
    setSettlingRow(null);
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

        {/* Mobile toggle */}
        <button
          onClick={() => setMobileFiltersOpen((v) => !v)}
          className="sm:hidden inline-flex items-center gap-2 rounded-full border border-border/50 bg-background/60 px-3 py-1.5 font-mono text-[9px] tracking-[0.25em] text-muted-foreground hover:text-foreground transition-all"
        >
          <SlidersHorizontal className="h-3 w-3" />
          {mobileFiltersOpen ? "OCULTAR FILTROS" : "MOSTRAR FILTROS"}
        </button>

        {/* Filter rows */}
        <div className={cn("flex flex-wrap items-center justify-center gap-4 sm:gap-6", !mobileFiltersOpen && "hidden sm:flex")}>
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

  // === Métricas GLOBAIS (independem de período/filtro) ===
  const globalStats = useMemo(() => {
    const g = rows.reduce(
      (a, r) => ({
        value: a.value + r.value,
        cost: a.cost + r.cost,
        factoring: a.factoring + r.factoringCost,
        settled: a.settled + (r.settled ? r.value : 0),
        open: a.open + (r.settled ? 0 : r.value),
      }),
      { value: 0, cost: 0, factoring: 0, settled: 0, open: 0 }
    );
    const effective = g.value > 0 ? (g.cost / g.value) * 100 : 0;
    const savings = Math.max(0, g.factoring - g.cost);
    const fromISO = dataBounds.from;
    const toISO = todayStr;
    const bDays = countBusinessDays(fromISO, toISO);
    const dailySpeed = g.value / bDays;
    return {
      totalBorrowed: g.value,
      totalCost: g.cost,
      totalDebt: g.open,
      totalSettled: g.settled,
      effectiveRate: effective,
      factoringSavings: savings,
      businessDays: bDays,
      dailySpeed,
    };
  }, [rows, dataBounds.from, todayStr]);

  const alertMetrics = useMemo(() => {
    const dailySpeed = globalStats.dailySpeed || 0;
    const effectiveRate = globalStats.effectiveRate || 0;
    const totalDebt = globalStats.totalDebt || 0;
    const totalSettled = globalStats.totalSettled || 0;
    const totalBorrowed = globalStats.totalBorrowed || 0;

    const liquidationRate = totalBorrowed > 0
      ? (totalSettled / totalBorrowed) * 100
      : 0;
    const rolloverRate = Math.max(0, 100 - liquidationRate);

    const monthlyAnticipationVolume = dailySpeed * 22;
    const cashCommitmentPct = monthlyAnticipationVolume > 0
      ? (totalDebt / monthlyAnticipationVolume) * 100
      : 0;
    const daysToClear = dailySpeed > 0 ? totalDebt / dailySpeed : 0;
    const projectedInterest30d = monthlyAnticipationVolume * (effectiveRate / 100);
    const projectedInterest1y = (dailySpeed * 260) * (effectiveRate / 100);
    const annualSavingsProjected = globalStats.businessDays > 0
      ? (globalStats.factoringSavings / globalStats.businessDays) * 260
      : 0;

    // Score CONTÍNUO (0–100): cai proporcionalmente conforme cada indicador piora,
    // evitando saltos bruscos quando uma única operação cruza um limiar.
    const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));
    // Penalidades suaves (cada uma pode tirar até X pontos)
    const penCommit = clamp((cashCommitmentPct / 80) * 45, 0, 45);   // até -45 pts
    const penRoll   = clamp((rolloverRate / 100) * 30, 0, 30);        // até -30 pts
    const penRate   = clamp((effectiveRate / 6) * 25, 0, 25);         // até -25 pts
    const scoreNumeric = Math.round(clamp(100 - penCommit - penRoll - penRate));

    let riskLevel: "BAIXO" | "MODERADO" | "CRÍTICO" = "BAIXO";
    let riskColor = "text-net-green";
    let riskBg = "bg-net-green/10";
    let riskBorder = "border-net-green/20";
    let healthScore = "A+";
    let scoreColor = "text-net-green";

    if (scoreNumeric < 45) {
      riskLevel = "CRÍTICO";
      riskColor = "text-cost-red";
      riskBg = "bg-cost-red/10 border-cost-red/20";
      riskBorder = "border-cost-red/30";
      healthScore = scoreNumeric < 30 ? "D-" : "D";
      scoreColor = "text-cost-red animate-pulse-glow";
    } else if (scoreNumeric < 75) {
      riskLevel = "MODERADO";
      riskColor = "text-factoring-amber";
      riskBg = "bg-factoring-amber/10 border-factoring-amber/20";
      riskBorder = "border-factoring-amber/30";
      healthScore = scoreNumeric < 60 ? "C" : "B";
      scoreColor = "text-factoring-amber";
    } else {
      healthScore = scoreNumeric >= 90 ? "A+" : "A";
    }


    return {
      dailySpeed, effectiveRate, totalDebt, totalSettled, totalBorrowed,
      liquidationRate, rolloverRate, monthlyAnticipationVolume,
      cashCommitmentPct, daysToClear, projectedInterest30d,
      projectedInterest1y, annualSavingsProjected,
      riskLevel, riskColor, riskBg, riskBorder, healthScore, scoreColor, scoreNumeric,
    };
  }, [globalStats]);

  // === Consultor AI: recomendação adaptativa que muda forma e conteúdo a cada nova operação ===
  const opsCount = rows.length;
  const latestOpNumber = rows.reduce((max, r) => {
    const n = Number(r.opNumber) || 0;
    return n > max ? n : max;
  }, 0);
  const opLabel = latestOpNumber > 0 ? String(latestOpNumber).padStart(4, "0") : String(opsCount).padStart(4, "0");

  const advisorRecommendation = useMemo(() => {
    const {
      cashCommitmentPct, rolloverRate, effectiveRate, daysToClear,
      totalDebt, totalBorrowed, totalSettled, dailySpeed,
      projectedInterest30d, annualSavingsProjected, scoreNumeric, healthScore,
    } = alertMetrics;

    if (opsCount === 0) {
      return {
        tone: "neutral" as const,
        headline: "Aguardando primeiro lançamento",
        body: "Cadastre uma operação para iniciarmos o diagnóstico adaptativo. A cada novo registro a recomendação será recalculada considerando comprometimento de receita, rolagem, taxa efetiva e velocidade diária.",
      };
    }

    const commitTier = cashCommitmentPct >= 60 ? 3 : cashCommitmentPct >= 25 ? 2 : 1;
    const rollTier   = rolloverRate >= 70 ? 3 : rolloverRate >= 40 ? 2 : 1;
    const rateTier   = effectiveRate >= 4 ? 3 : effectiveRate >= 2 ? 2 : 1;
    const speedTier  = dailySpeed > 0 && daysToClear > 45 ? 3 : daysToClear > 20 ? 2 : 1;
    const sumTier    = commitTier + rollTier + rateTier + speedTier;
    const tone: "up" | "warn" | "down" = sumTier >= 10 ? "down" : sumTier >= 7 ? "warn" : "up";

    const tiers = [
      { key: "commit", tier: commitTier, value: cashCommitmentPct },
      { key: "roll",   tier: rollTier,   value: rolloverRate },
      { key: "rate",   tier: rateTier,   value: effectiveRate },
      { key: "speed",  tier: speedTier,  value: daysToClear },
    ];
    const dominant = [...tiers].sort((a, b) => b.tier - a.tier || b.value - a.value)[0];

    const pick = <T,>(arr: T[]): T => arr[opsCount % arr.length];

    const openings: Record<typeof tone, string[]> = {
      up: [
        `Operação ${opLabel} registrada — a saúde financeira segue em zona positiva (score ${scoreNumeric}/100, nota ${healthScore}).`,
        `Bom trabalho. Após o registro ${opLabel}, os indicadores continuam equilibrados (${healthScore}).`,
        `Cenário ainda confortável após o lançamento ${opLabel}: ${formatPct(rolloverRate)} de rolagem e ${formatPct(cashCommitmentPct)} de receita comprometida.`,
      ],
      warn: [
        `Diagnóstico atualizado após a operação ${opLabel}: estamos na faixa moderada (score ${scoreNumeric}, ${healthScore}).`,
        `O lançamento ${opLabel} move o termômetro para zona de atenção — exposição já em ${formatBRL(totalDebt)} contra ${formatBRL(totalBorrowed)} captados.`,
        `Sinais mistos após o registro ${opLabel}: ${formatPct(cashCommitmentPct)} da receita futura já está comprometida e a taxa efetiva média está em ${formatPct(effectiveRate)}.`,
      ],
      down: [
        `Alerta após a operação ${opLabel}: score em ${scoreNumeric} (${healthScore}) e ${formatPct(rolloverRate)} de rolagem indicam dependência crescente de novas captações.`,
        `Cenário crítico após o registro ${opLabel} — receita comprometida em ${formatPct(cashCommitmentPct)} e ${Math.round(daysToClear)} dias úteis necessários para zerar a posição no ritmo atual.`,
        `O lançamento ${opLabel} intensifica a pressão: ${formatBRL(totalDebt)} em aberto contra apenas ${formatBRL(totalSettled)} liquidados.`,
      ],
    };

    const diagnosis = (() => {
      if (dominant.key === "commit" && commitTier >= 2) {
        return pick([
          `O ponto que mais pesa agora é o comprometimento da receita futura (${formatPct(cashCommitmentPct)}). Cada nova antecipação está consumindo o caixa projetado dos próximos ${Math.round(daysToClear)} dias úteis.`,
          `Foco: comprometimento de receita em ${formatPct(cashCommitmentPct)}. Mantido esse ritmo, o juro projetado para 30 dias soma ${formatBRL(projectedInterest30d)}.`,
        ]);
      }
      if (dominant.key === "roll" && rollTier >= 2) {
        return pick([
          `O fator crítico é a rolagem (${formatPct(rolloverRate)}): há mais captação do que liquidação real e isso transforma a antecipação em dívida circulante.`,
          `Sua taxa de re-empréstimo está em ${formatPct(rolloverRate)} — sinal de que novos títulos estão financiando os antigos em vez de gerar liquidez nova.`,
        ]);
      }
      if (dominant.key === "rate" && rateTier >= 2) {
        return pick([
          `A taxa efetiva média subiu para ${formatPct(effectiveRate)} ao mês. Em base anualizada isso equivale a uma sangria estimada de ${formatBRL(projectedInterest30d * 12)} se o ritmo persistir.`,
          `Custo financeiro é o principal vilão: ${formatPct(effectiveRate)} efetivos. Antecipações de prazo mais curto e renegociação de spread devem entrar na pauta.`,
        ]);
      }
      if (dominant.key === "speed" && speedTier >= 2) {
        return pick([
          `Você está antecipando ${formatBRL(dailySpeed)} por dia útil — nesse passo, levaria ~${Math.round(daysToClear)} dias úteis para liquidar o saldo atual sem novas operações.`,
          `Velocidade elevada (${formatBRL(dailySpeed)}/dia útil) com saldo em aberto de ${formatBRL(totalDebt)}: alterne dias sem captação para alongar o prazo médio efetivo.`,
        ]);
      }
      return pick([
        `Indicadores equilibrados: liquidação em ${formatPct(100 - rolloverRate)} do volume e taxa média controlada em ${formatPct(effectiveRate)}.`,
        `Sem vilão dominante. Você está usando a antecipação como instrumento tático e não como dívida recorrente — exatamente o uso recomendado.`,
        `Composição saudável entre captação e liquidação após o registro ${opLabel}. A economia projetada anual frente ao factoring soma ${formatBRL(annualSavingsProjected)}.`,
      ]);
    })();

    const actions: Record<typeof tone, string[]> = {
      up: [
        "Próxima ação sugerida: aproveitar a folga para negociar spread menor com o banco; cada 0,1% economizado se multiplica nas próximas operações.",
        "Continue priorizando antecipações somente quando houver oportunidade real (compra com desconto à vista). É essa disciplina que sustenta o score.",
        "Considere registrar uma reserva-meta: separar parte da economia gerada hoje cria amortecimento para meses de menor faturamento.",
      ],
      warn: [
        `Reduza o ritmo diário para abaixo de ${formatBRL(dailySpeed * 0.7)} nas próximas captações e priorize duplicatas de até 15 dias para baixar a taxa efetiva.`,
        `Concentre liquidações: zerar pelo menos ${formatBRL(totalDebt * 0.3)} do saldo aberto antes da próxima antecipação devolveria o score à faixa segura.`,
        "Reavalie qual contraparte está cobrando mais caro — concentrar volume no banco de menor spread costuma render ganhos imediatos no próximo ciclo.",
      ],
      down: [
        `Freie novas antecipações por pelo menos ${Math.max(5, Math.round(daysToClear / 3))} dias úteis e direcione todo o fluxo recebido à liquidação dos títulos abertos.`,
        "Renegociação é prioridade: leve à mesa o histórico e peça redução de spread ou troca por uma linha de capital de giro mais barata para os títulos mais longos.",
        `Estabeleça um teto de antecipação semanal abaixo de ${formatBRL(dailySpeed * 5 * 0.5)} até a rolagem cair para menos de 40%.`,
      ],
    };

    return {
      tone,
      headline: tone === "down" ? "Atenção crítica" : tone === "warn" ? "Recalibrar exposição" : "Saúde financeira positiva",
      body: `${pick(openings[tone])} ${diagnosis} ${pick(actions[tone])}`,
    };
  }, [opsCount, opLabel, alertMetrics]);



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
              PERÍODO: {periodDays} {periodDays === 1 ? "DIA" : "DIAS"}
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
                    <AreaChart data={chartData} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
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
                        yAxisId="left"
                        width={60}
                        axisLine={false}
                        tickLine={false}
                        tickMargin={4}
                        tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                        stroke="hsl(var(--border))"
                        tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}K`}
                      />
                      <YAxis
                        yAxisId="right"
                        orientation="right"
                        width={60}
                        axisLine={false}
                        tickLine={false}
                        tickMargin={4}
                        tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                        stroke="hsl(var(--border))"
                        tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}K`}
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
                          yAxisId="left"
                          stroke="hsl(var(--muted-foreground))"
                          strokeDasharray="4 4"
                          strokeWidth={2.5}
                          opacity={0.9}
                        />
                      ))}

                      <Area
                        yAxisId="left"
                        type="monotone"
                        dataKey="saldo"
                        name="saldo"
                        stroke={`url(#lineGrad-${gradId})`}
                        strokeWidth={2.5}
                        fill={`url(#areaGradH-${gradId})`}
                        mask={`url(#areaFadeMask-${gradId})`}
                        connectNulls={false}
                        isAnimationActive={true}
                        animationDuration={900}
                        animationEasing="ease-out"

                      />
                      <Area
                        yAxisId="right"
                        type="monotone"
                        dataKey="saldo"
                        stroke="transparent"
                        fill="transparent"
                        isAnimationActive={true}
                        animationDuration={900}
                        animationEasing="ease-out"

                      />
                      {statusFilter !== "liquidadas" && (
                        <Area
                          yAxisId="left"
                          type="monotone"
                          dataKey="saldoFuturo"
                          name="projeção"
                          stroke={isAVencerFilter ? "hsl(var(--muted-foreground))" : "hsl(0 0% 100%)"}
                          strokeWidth={2.5}
                          strokeDasharray="6 4"
                          fill="hsl(var(--muted-foreground))"
                          fillOpacity={0.35}
                          connectNulls={true}
                          isAnimationActive={true}
                          animationDuration={900}
                          animationEasing="ease-out"

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
                <div className="mt-1 flex bg-muted/40 rounded-sm" style={{ marginLeft: 60, marginRight: 60 }}>
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
                <div className="mt-1 flex" style={{ marginLeft: 60, marginRight: 60 }}>
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

        {/* Inteligência Financeira & Alertas — análise GLOBAL (não responde a filtros de período/status) */}
        <section
          key={`alerts-${rows.length}-${alertMetrics.scoreNumeric}`}
          className="rounded-2xl border border-border/60 bg-gradient-card p-6 md:p-8 shadow-card animate-fade-up"
        >
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-3">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full animate-color-cycle opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 animate-color-cycle"></span>
              </span>
              <h2 className="font-display text-xl font-semibold tracking-tight">
                Análise de Compromisso e Saúde Financeira
              </h2>
            </div>
            
            {/* Tabs para navegar nas análises */}
            <div className="inline-flex rounded-lg border border-border/50 bg-background/40 p-0.5 gap-0.5 self-start md:self-auto font-mono text-[9px] tracking-widest">
              <button
                onClick={() => setActiveAlertTab("diaria")}
                className={cn(
                  "rounded-md px-3 py-1.5 transition-all",
                  activeAlertTab === "diaria"
                    ? "bg-primary text-primary-foreground font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                DIÁRIA & VELOCIDADE
              </button>
              <button
                onClick={() => setActiveAlertTab("mensal")}
                className={cn(
                  "rounded-md px-3 py-1.5 transition-all",
                  activeAlertTab === "mensal"
                    ? "bg-primary text-primary-foreground font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                PROJEÇÃO MENSAL
              </button>
              <button
                onClick={() => setActiveAlertTab("anual")}
                className={cn(
                  "rounded-md px-3 py-1.5 transition-all",
                  activeAlertTab === "anual"
                    ? "bg-primary text-primary-foreground font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                VISÃO ANUAL & SCORE
              </button>
            </div>
          </div>





          <div className="grid gap-6 md:grid-cols-12 items-stretch">
            {/* Esquerda: O diagnóstico em texto corrido e interativo */}
            <div className="md:col-span-8 space-y-4 flex flex-col justify-between">
              {activeAlertTab === "diaria" && (
                <div className="space-y-4 animate-fade-in">
                  <p className="text-sm text-justify text-foreground/90 leading-relaxed font-sans">
                    A empresa está antecipando recebíveis a uma velocidade média de{" "}
                    <strong className="text-primary-glow font-mono text-base">{formatBRL(alertMetrics.dailySpeed)}/dia útil</strong>. 
                    Isso significa que seu fluxo de caixa futuro está sendo consumido de forma contínua para cobrir despesas de curto prazo.
                  </p>
                  <p className="text-sm text-justify text-foreground/90 leading-relaxed font-sans">
                    Atualmente, o saldo bruto total já antecipado e em aberto é de{" "}
                    <strong className="text-cost-red font-mono text-base">{formatBRL(alertMetrics.totalDebt)}</strong>. 
                    Se a empresa parasse de realizar novas antecipações hoje, ela levaria aproximadamente{" "}
                    <strong className="text-foreground font-mono text-base">{Math.ceil(alertMetrics.daysToClear)} dias úteis</strong> para liquidar todo o saldo devedor pendente através dos recebimentos normais.
                  </p>
                  <p className="text-sm text-justify text-foreground/90 leading-relaxed font-sans">
                    Adicionalmente, detectamos um comportamento de **Rolagem de Recebíveis (Re-empréstimo)**. Do volume total captado no período (<strong>{formatBRL(alertMetrics.totalBorrowed)}</strong>), apenas <strong>{formatPct(alertMetrics.liquidationRate)}</strong> foi liquidado de fato (<strong>{formatBRL(alertMetrics.totalSettled)}</strong>). Isso significa que <strong>{formatPct(alertMetrics.rolloverRate)}</strong> do capital está sendo re-emprestado de imediato, gerando um acúmulo acelerado de juros e dependência de novas antecipações para pagar títulos antigos.
                  </p>
                  <div className="flex flex-wrap gap-2 pt-2">
                    <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 font-mono text-[9px] tracking-wider text-primary border border-primary/20">
                      VELOCIDADE DIÁRIA: {formatBRL(alertMetrics.dailySpeed)}
                    </span>
                    <span className="inline-flex items-center rounded-full bg-white/5 px-2.5 py-0.5 font-mono text-[9px] tracking-wider text-muted-foreground border border-border/30">
                      TAXA EFETIVA MÉDIA: {formatPct(alertMetrics.effectiveRate)}
                    </span>
                    <span className={cn(
                      "inline-flex items-center rounded-full px-2.5 py-0.5 font-mono text-[9px] tracking-wider border",
                      alertMetrics.rolloverRate >= 70 
                        ? "bg-cost-red/10 text-cost-red border-cost-red/20" 
                        : "bg-white/5 text-muted-foreground border-border/30"
                    )}>
                      ÍNDICE DE RE-EMPRÉSTIMO (ROLAGEM): {formatPct(alertMetrics.rolloverRate)}
                    </span>
                  </div>
                </div>
              )}

              {activeAlertTab === "mensal" && (
                <div className="space-y-4 animate-fade-in">
                  <p className="text-sm text-justify text-foreground/90 leading-relaxed font-sans">
                    Com ritmo de antecipações atual, o volume projetado de novos recebíveis antecipados para os próximos 30 dias é de{" "}
                    <strong className="text-primary-glow font-mono text-base">{formatBRL(alertMetrics.monthlyAnticipationVolume)}</strong>. 
                    Deste montante, o custo financeiro direto de juros e taxas consumirá cerca de{" "}
                    <strong className="text-cost-red font-mono text-base">{formatBRL(alertMetrics.projectedInterest30d)}</strong> de caixa líquido.
                  </p>
                  <p className="text-sm text-justify text-foreground/90 leading-relaxed font-sans">
                    O grau de comprometimento da receita mensal está em{" "}
                    <strong className={cn("font-mono text-base", alertMetrics.riskColor)}>{formatPct(alertMetrics.cashCommitmentPct)}</strong>.
                    {alertMetrics.cashCommitmentPct >= 60 ? (
                      <span> Este nível é considerado <strong className="text-cost-red">Crítico</strong>, o que significa que mais da metade do faturamento projetado já está pré-comprometido antes mesmo de entrar, criando um ciclo contínuo de dependência financeira.</span>
                    ) : alertMetrics.cashCommitmentPct >= 25 ? (
                      <span> Este nível requer <strong className="text-factoring-amber">Atenção</strong>. Embora administrável, recomenda-se alongar prazos com fornecedores para reduzir o ritmo de antecipações diárias.</span>
                    ) : (
                      <span> Este nível é considerado <strong className="text-net-green">Saudável</strong>. As antecipações estão alinhadas à capacidade operacional de curto prazo sem pressionar o fluxo de caixa futuro.</span>
                    )}
                  </p>
                  <div className="flex flex-wrap gap-2 pt-2">
                    <span className="inline-flex items-center rounded-full bg-white/5 px-2.5 py-0.5 font-mono text-[9px] tracking-wider text-muted-foreground border border-border/30">
                      JUROS PROJETADOS (30D): {formatBRL(alertMetrics.projectedInterest30d)}
                    </span>
                    <span className="inline-flex items-center rounded-full bg-white/5 px-2.5 py-0.5 font-mono text-[9px] tracking-wider text-muted-foreground border border-border/30">
                      COMPROMETIMENTO: {formatPct(alertMetrics.cashCommitmentPct)}
                    </span>
                  </div>
                </div>
              )}

              {activeAlertTab === "anual" && (
                <div className="space-y-4 animate-fade-in">
                  <p className="text-sm text-justify text-foreground/90 leading-relaxed font-sans">
                    A projeção em escala anual mantendo a atual taxa efetiva indica um pagamento acumulado de juros de{" "}
                    <strong className="text-cost-red font-mono text-base">{formatBRL(alertMetrics.projectedInterest1y)}</strong> ao ano.
                    Esta é a quantia que deixará de entrar diretamente no caixa líquido da sua empresa.
                  </p>
                  <p className="text-sm text-justify text-foreground/90 leading-relaxed font-sans">
                    Por outro lado, o uso do MykaCash em comparação com as taxas tradicionais de mercado (Factoring) está gerando uma economia anual projetada de{" "}
                    <strong className="text-net-green font-mono text-base">{formatBRL(alertMetrics.annualSavingsProjected)}</strong>. 
                    Isto demonstra o impacto positivo da gestão interna de crédito e taxas de repasse.
                  </p>
                  <div className="flex flex-wrap gap-2 pt-2 font-mono text-[9px] tracking-wider">
                    <span className="inline-flex items-center rounded-full bg-cost-red/10 px-2.5 py-0.5 text-cost-red border border-cost-red/20">
                      CUSTO DE ANTECIPAÇÃO ANUAL PROJETADO: {formatBRL(alertMetrics.projectedInterest1y)}
                    </span>
                    <span className="inline-flex items-center rounded-full bg-net-green/10 px-2.5 py-0.5 text-net-green border border-net-green/20">
                      ECONOMIA ANUAL GERADA: {formatBRL(alertMetrics.annualSavingsProjected)}
                    </span>
                  </div>
                </div>
              )}

              {/* Dica Esperta do Consultor */}
              <div
                key={`advisor-${opsCount}-${alertMetrics.scoreNumeric}`}
                className={cn(
                  "mt-4 p-3 rounded-lg border flex items-start gap-2.5 animate-fade-in",
                  advisorRecommendation.tone === "up" && "border-net-green/40 bg-net-green/5",
                  advisorRecommendation.tone === "warn" && "border-factoring-amber/40 bg-factoring-amber/5",
                  advisorRecommendation.tone === "down" && "border-cost-red/40 bg-cost-red/5",
                  advisorRecommendation.tone === "neutral" && "border-border/40 bg-muted/20",
                )}
              >
                <span className="text-xs animate-pulse drop-shadow-[0_0_6px_rgba(250,204,21,0.8)]">💡</span>
                <div className="space-y-0.5">
                  <div className="font-mono text-[9px] tracking-wider text-muted-foreground uppercase">
                    Recomendação do Consultor AI · {advisorRecommendation.headline}
                  </div>
                  <p className="text-xs text-justify text-muted-foreground leading-normal font-sans">
                    {advisorRecommendation.body}
                  </p>
                </div>
              </div>

            </div>

            {/* Direita: Placa de Diagnóstico/Score Card */}
            <div className="md:col-span-4 flex flex-col justify-between rounded-xl border border-border/50 bg-background/30 p-6 shadow-panel items-center text-center">
              <div className="space-y-2">
                <div className="font-mono text-xs tracking-widest text-muted-foreground uppercase">DIAGNÓSTICO DE RISCO</div>
                <div className={cn("inline-flex items-center rounded-full px-3 py-1 font-mono text-xs tracking-widest font-bold", alertMetrics.riskColor, alertMetrics.riskBg)}>
                  {alertMetrics.riskLevel}
                </div>
              </div>

              {/* Placa do Score */}
              <div className="my-4">
                <div className="font-mono text-xs tracking-widest text-muted-foreground uppercase">SCORE DE SAÚDE</div>
                <div className={cn("font-display text-6xl font-extrabold tracking-tight mt-2", alertMetrics.scoreColor)}>
                  {alertMetrics.healthScore}
                </div>
                <div className="font-mono text-[10px] tracking-widest text-muted-foreground mt-2">MYKA FINANCIAL SCORE</div>
              </div>

              {/* Pequeno gráfico de progresso (comprometimento de receita) */}
              <div className="w-full space-y-2">
                <div className="flex justify-between font-mono text-[10px] tracking-widest text-muted-foreground">
                  <span>RECEITA FUTURA COMPROMETIDA</span>
                  <span>{formatPct(alertMetrics.cashCommitmentPct)}</span>
                </div>
                <div className="h-1.5 w-full bg-muted/60 rounded-full overflow-hidden">
                  <div 
                    className={cn(
                      "h-full rounded-full transition-all duration-500",
                      alertMetrics.cashCommitmentPct >= 60 
                        ? "bg-cost-red" 
                        : alertMetrics.cashCommitmentPct >= 25 
                        ? "bg-factoring-amber" 
                        : "bg-net-green"
                    )}
                    style={{ width: `${Math.min(100, alertMetrics.cashCommitmentPct)}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
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
                        REG {r.opNumber ? `${String(r.opNumber).padStart(4, "0")}${r.parcelLabel === "ÚNICA" ? "" : String.fromCharCode(96 + (parseInt(r.parcelLabel) || 0))}` : "—"} · NF {r.invoiceNumber}{r.parcelLabel === "ÚNICA" ? "" : String.fromCharCode(96 + (parseInt(r.parcelLabel) || 0))}
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
                  <th className="px-1.5 py-2 text-center font-medium">REGISTRO</th>
                  <th className="px-1.5 py-2 text-center font-medium">STATUS</th>
                  <SortableTh label="CLIENTE" sKey="clientName" />
                  <SortableTh label="NF" sKey="invoiceNumber" />
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
                    const canManage = isAdmin || (r.isAuthor && r.withinEditWindow);
                    return (
                      <tr
                        key={r.key}
                        className={
                          "group/row border-t border-border/40 font-mono tabular-nums text-center transition-colors " +
                          rowClass(r)
                        }
                      >
                        <td className="px-1.5 py-2 text-muted-foreground">{r.opNumber ? `${String(r.opNumber).padStart(4, "0")}${r.parcelLabel === "ÚNICA" ? "" : String.fromCharCode(96 + (parseInt(r.parcelLabel) || 0))}` : "—"}</td>
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
                        <td className="px-1.5 py-2">{r.invoiceNumber}{r.parcelLabel === "ÚNICA" ? "" : String.fromCharCode(96 + (parseInt(r.parcelLabel) || 0))}</td>
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
        <p className="font-mono text-[10px] tracking-[0.35em] text-muted-foreground">MYKACA$H · VERSÃO 2.6</p>
      </footer>

      {/* Settlement Date Dialog */}
      <Dialog open={!!settlingRow} onOpenChange={(o) => !o && setSettlingRow(null)}>
        <DialogContent className="max-w-md bg-background/95 backdrop-blur-xl border-border/50">
          <DialogHeader>
            <DialogTitle className="font-display">Confirmar Liquidação</DialogTitle>
            <DialogDescription className="font-mono text-[10px] tracking-wider uppercase">
              Selecione a data em que o valor entrou no banco
            </DialogDescription>
          </DialogHeader>
          <div className="py-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="settlement-date" className="text-xs font-mono tracking-widest uppercase text-muted-foreground">Data de Liquidação</Label>
              <Input
                id="settlement-date"
                type="date"
                className="bg-background/50 border-border/40 font-mono"
                value={settlementDate}
                onChange={(e) => setSettlementDate(e.target.value)}
              />
              <p className="text-[10px] font-mono text-muted-foreground/70 italic">
                Padrão: Data de Vencimento da parcela.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSettlingRow(null)} className="font-mono text-[10px] tracking-widest">
              CANCELAR
            </Button>
            <Button onClick={confirmSettlement} className="bg-primary text-primary-foreground font-mono text-[10px] tracking-widest">
              CONFIRMAR LIQUIDAÇÃO
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Historico;
