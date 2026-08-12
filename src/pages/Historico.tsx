// v2 - filtros fixos na base
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { AppHeader } from "@/components/AppHeader";
import { PageNav } from "@/components/PageNav";
import VaporizeTextCycle from "@/components/ui/vapour-text-effect";
import { RegistrationSection } from "@/components/RegistrationSection";
import { Button } from "@/components/ui/button";
import { DateField } from "@/components/DateField";
import { supabase } from "@/integrations/supabase/client";
import { calculate, formatBRL, formatPct, FACTORING_MONTHLY_RATE_PCT, type Installment } from "@/lib/calc";
import { toast } from "sonner";
import { playSound } from "@/lib/sounds";
import { CheckCircle2, Circle, Pencil, Trash2, Plus, X, ArrowUp, ArrowDown, ArrowUpDown, SlidersHorizontal, ChevronDown, ChevronRight, Search, AlertTriangle, AlertOctagon, Calendar, Coins, User } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useIsMobile } from "@/hooks/use-mobile";
import { logOperationAction } from "@/lib/auditLogger";
import { cn, getMobileXAxisTicks } from "@/lib/utils";
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

const MONTHS_PT = [
  "JANEIRO",
  "FEVEREIRO",
  "MARÇO",
  "ABRIL",
  "MAIO",
  "JUNHO",
  "JULHO",
  "AGOSTO",
  "SETEMBRO",
  "OUTUBRO",
  "NOVEMBRO",
  "DEZEMBRO"
];

type SettledEntry = string | { id: string; date: string; settled_at?: string };
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
  updated_at?: string;
  created_by: string | null;
  clients?: { name: string } | null;
  profiles?: { display_name: string | null; username: string | null } | null;
  ordem?: number | null;
  is_additional?: boolean | null;
  parent_invoice_id?: string | null;
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

let globalSplashShown = false;

const Historico = () => {
  const { user, isAdmin } = useAuth();
  const [period, setPeriod] = useState<Period>("total");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("todas");
  const [showFuture, setShowFuture] = useState<boolean>(false);
  const [from, setFrom] = useState<string>(todayISO());
  const [to, setTo] = useState<string>(todayISO());
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const isInitialLoading = loading && invoices.length === 0;
  const [now, setNow] = useState<number>(Date.now());
  const isMobile = useIsMobile();
  const [settlingRow, setSettlingRow] = useState<any | null>(null);
  const [settlementDate, setSettlementDate] = useState<string>("");
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState<boolean>(false);
  const [manualTransactions, setManualTransactions] = useState<any[]>([]);
  const [overdueAlertOpen, setOverdueAlertOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [negativeBalanceAlertOpen, setNegativeBalanceAlertOpen] = useState(false);
  const { pathname } = useLocation();
  const [showSplash, setShowSplash] = useState(!globalSplashShown);
  const [splashFade, setSplashFade] = useState(false);
  const [fontLoaded, setFontLoaded] = useState(false);
  const [aiInsights, setAiInsights] = useState<{
    dailySpeedText: string;
    monthlyProjectionText: string;
    annualVisionText: string;
  } | null>(null);
  const [loadingInsights, setLoadingInsights] = useState(false);

  useEffect(() => {
    if (typeof document !== "undefined" && "fonts" in document) {
      document.fonts.ready.then(() => {
        setFontLoaded(true);
      }).catch(() => {
        setFontLoaded(true);
      });
    } else {
      setFontLoaded(true);
    }
  }, []);



  useEffect(() => {
    if (!showSplash) return;

    const minDelay = new Promise((r) => setTimeout(r, 3600));
    const dataLoaded = new Promise((r) => {
      const check = () => {
        if (!loading) {
          r(true);
        } else {
          setTimeout(check, 100);
        }
      };
      check();
    });

    Promise.all([minDelay, dataLoaded]).then(() => {
      globalSplashShown = true;
      setSplashFade(true);
      setTimeout(() => {
        setShowSplash(false);
      }, 700);
    });
  }, [loading, showSplash]);

  const [overdueConfirmOpen, setOverdueConfirmOpen] = useState(false);
  const [pendingSettlementData, setPendingSettlementData] = useState<{
    row: any;
    delayDays: number;
    valueNew: number;
    adjustment: number;
    settlementDate: string;
  } | null>(null);

  const yesterdayStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return localISO(d);
  }, []);
  const showAnalytics = pathname === "/analises";
  const showHistory = pathname === "/";
  const [initialBalance, setInitialBalance] = useState(() => {
    const saved = localStorage.getItem("mykacash_initial_balance");
    return saved ? parseFloat(saved) : 0;
  });

  // tick every 30s so the 5-minute edit window updates
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const load = async () => {
    setLoading(true);
    const [invoicesRes, manualRes] = await Promise.all([
      supabase
        .from("invoices")
        .select(
          "id, invoice_number, invoice_value, operation_date, monthly_rate, factoring_monthly_rate, installments, settled_installments, client_id, created_at, updated_at, created_by, ordem, is_additional, parent_invoice_id, clients(name), profiles:created_by(display_name, username)"
        )
        .order("operation_date", { ascending: false }),
      supabase
        .from("account_transactions")
        .select("*")
        .order("date", { ascending: false })
    ]);

    if (invoicesRes.error) {
      toast.error("Erro ao carregar histórico");
      setLoading(false);
      return;
    }
    
    // Batch state updates to prevent UI flashing negative balance
    setInvoices((invoicesRes.data ?? []) as any);
    setManualTransactions(manualRes.data || []);
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
      settlementDate: string | null;
      overdue: boolean;
      settledAt: string | null;
      updatedAt: string | null;
      createdBy: string;
      createdAt: string;
      isAuthor: boolean;
      withinEditWindow: boolean;
      isAdditional: boolean;
    };
    const out: Row[] = [];
    for (const inv of invoices) {
      const installments = Array.isArray(inv.installments) ? inv.installments : [];
      const settledEntries: SettledEntry[] = Array.isArray(inv.settled_installments)
        ? (inv.settled_installments as any)
        : [];
      const settledMap = new Map<string, string | null>();
      const settledAtMap = new Map<string, string | null>();
      settledEntries.forEach((e) => {
        settledMap.set(settledIdOf(e), settledDateOf(e));
        if (typeof e !== "string" && e.settled_at) {
          settledAtMap.set(e.id, e.settled_at);
        }
      });
      const factoringRate = Number(inv.factoring_monthly_rate ?? FACTORING_MONTHLY_RATE_PCT);
      const result = calculate({
        invoiceValue: Number(inv.invoice_value) || 0,
        operationDate: inv.operation_date,
        monthlyRate: Number(inv.monthly_rate) || 0,
        installments: installments as Installment[],
        skipMinFloor: !!(inv as any).is_additional,
      });
      const showIdx = result.installmentCalcs.length > 1;
      const isAdditional = !!(inv as any).is_additional;
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
        const settlementDate = settled ? (settledDate ?? i.dueDate) : null;
        const overdue = !settled && i.dueDate < todayStr;
        const settledAt = settled ? settledAtMap.get(i.id) ?? null : null;
        const updatedAt = (inv as any).updated_at || inv.created_at;
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
          settlementDate,
          settledAt,
          updatedAt,
          overdue,
          createdBy,
          createdAt: inv.created_at,
          isAuthor,
          withinEditWindow,
          isAdditional,
        });
      });
    }
    return out;
  }, [invoices, todayStr, now, user]);
  
  const resumoDoDiaRows = useMemo(() => {
    const out: Array<(typeof rows)[number] & { actionType: "INICIADA" | "EDITADA" | "LIQUIDADA" }> = [];
    
    for (const r of rows) {
      const isInitiated = r.createdAt ? localISO(new Date(r.createdAt)) === todayStr : false;
      const isLiquidated = r.settled && r.settledAt ? localISO(new Date(r.settledAt)) === todayStr : false;
      
      if (isLiquidated) {
        out.push({ ...r, actionType: "LIQUIDADA" });
      } else if (isInitiated) {
        out.push({ ...r, actionType: "INICIADA" });
      } else if (r.updatedAt && !r.settled) {
        const isEdited = localISO(new Date(r.updatedAt)) === todayStr;
        if (isEdited) {
          out.push({ ...r, actionType: "EDITADA" });
        }
      }
    }
    return out;
  }, [rows, todayStr]);

  const overdueRows = useMemo(
    () => rows.filter((r) => !r.settled && r.overdue),
    [rows]
  );

  useEffect(() => {
    if (loading || !user || showSplash) return;
    if (pathname !== "/") return;
    if (overdueRows.length === 0) return;
    const key = `mykacash_overdue_alert_shown:${user.id}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
    setOverdueAlertOpen(true);
    playSound("overdue");
  }, [loading, user, overdueRows.length, pathname, showSplash]);



  const currentAccountBalance = useMemo(() => {
    let curr = initialBalance;
    manualTransactions.forEach(t => {
      curr += t.type === "deposit" ? Number(t.amount) : -Number(t.amount);
    });
    rows.forEach(r => {
      curr -= r.presentValue;
      if (r.settled) {
        curr += r.value;
      }
    });
    return curr;
  }, [rows, manualTransactions, initialBalance]);

  useEffect(() => {
    if (loading || !user) return;
    if (currentAccountBalance < 0) {
      const lastBal = sessionStorage.getItem("mykacash_last_balance");
      const currentBalStr = String(currentAccountBalance);
      if (lastBal !== currentBalStr) {
        sessionStorage.setItem("mykacash_last_balance", currentBalStr);
        setNegativeBalanceAlertOpen(true);
        playSound("overdue");
      }
    }
  }, [loading, currentAccountBalance, user]);

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
    let baseRows = [];
    if (statusFilter === "liquidadas") {
      baseRows = rows.filter((r) => r.settled && r.settledDate && inRange(r.settledDate));
    } else if (statusFilter === "andamento") {
      baseRows = rows.filter(
        (r) => !r.settled && r.operationDate <= range.to && r.dueDate >= range.from
      );
    } else if (statusFilter === "a_vencer") {
      baseRows = rows.filter((r) => !r.settled && inRange(r.dueDate));
    } else if (statusFilter === "todas") {
      // Para "todas", incluímos tudo que começou até o fim do período.
      // A lógica de carryOver e eventos cuidará de abater o que já foi liquidado.
      baseRows = rows.filter((r) => r.operationDate <= range.to);
    } else if (statusFilter === "vencidas") {
      baseRows = rows.filter((r) => !r.settled && r.overdue && inRange(r.dueDate));
    } else {
      const base = rows.filter((r) => inRange(r.operationDate));
      baseRows = base.filter((r) => !r.settled); 
    }

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase().trim();
      baseRows = baseRows.filter(
        (r) =>
          r.clientName.toLowerCase().includes(term) ||
          r.invoiceNumber.toLowerCase().includes(term) ||
          (r.opNumber && String(r.opNumber).includes(term)) ||
          r.createdBy.toLowerCase().includes(term) ||
          formatBRL(r.value).includes(term) ||
          formatBRL(r.presentValue).includes(term)
      );
    }

    // Ordenação padrão: data de abertura mais recente primeiro, depois por número de registro decrescente
    baseRows.sort((a, b) => {
      const dateCmp = b.operationDate.localeCompare(a.operationDate);
      if (dateCmp !== 0) return dateCmp;
      return (b.opNumber ?? 0) - (a.opNumber ?? 0);
    });

    return baseRows;
  }, [rows, statusFilter, range.from, range.to, searchTerm]);

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
        if (r.isAdditional) continue;
        allEvents.push({ date: r.dueDate.slice(0, 10), delta: -r.value });
      }
    } else if (statusFilter === "liquidadas") {
      for (const r of filteredRows) {
        if (r.isAdditional) continue;
        if (r.settled) {
          // No gráfico de liquidadas, usamos a data real de liquidação se >= jun/2026, senão no vencimento
          const rawDate = (r.settledDate && r.settledDate >= "2026-06-01") ? r.settledDate : r.dueDate;
          const setDate = (period === "data") ? rawDate : rawDate.slice(0, 10);
          allEvents.push({ date: setDate, delta: r.value });
        }
      }
    } else {
      // Para TODAS, INICIADAS, ANDAMENTO e VENCIDAS:
      // Gráfico de SALDO EM ABERTO: Início (+) e Liquidação (-)
      for (const r of filteredRows) {
        if (r.isAdditional) continue;
        // As operações entram no gráfico na DATA DE OPERAÇÃO.
        const evDate = (period === "data") ? r.createdAt : r.operationDate.slice(0, 10);
          
        allEvents.push({ date: evDate, delta: r.value });
        
        if (r.settled) {
          // Liquidada: Abate do saldo na data real de liquidação se >= jun/2026, senão no vencimento
          const rawDate = (r.settledDate && r.settledDate >= "2026-06-01") ? r.settledDate : r.dueDate;
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

    const accountEvents: { date: string; delta: number }[] = [];
    manualTransactions.forEach(t => {
      accountEvents.push({
        date: t.date.slice(0, 10),
        delta: t.type === "deposit" ? Number(t.amount) : -Number(t.amount),
      });
    });
    rows.forEach(r => {
      if (r.isAdditional) {
        if (r.settled) {
          const inDate = r.settledDate || r.dueDate;
          accountEvents.push({ date: inDate.slice(0, 10), delta: r.value - r.presentValue });
        }
      } else {
        accountEvents.push({ date: r.operationDate.slice(0, 10), delta: -r.presentValue });
        if (r.settled) {
          const inDate = r.settledDate || r.dueDate;
          accountEvents.push({ date: inDate.slice(0, 10), delta: r.value });
        }
      }
    });
    accountEvents.sort((a, b) => a.date.localeCompare(b.date));
    const dailyAccount: Record<string, number> = {};
    let currAcc = initialBalance;
    accountEvents.forEach(e => {
      currAcc += e.delta;
      dailyAccount[e.date] = currAcc;
    });
    const getAccountBalance = (targetDate: string) => {
      const sortedDates = Object.keys(dailyAccount).sort();
      let lastBal = initialBalance;
      for (const d of sortedDates) {
        if (d > targetDate) break;
        lastBal = dailyAccount[d];
      }
      return lastBal;
    };

    if (allEvents.length === 0)
      return [] as { date: string; label: string; labelShort: string; saldo: number | null; saldoFuturo?: number; saldoConta?: number }[];

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

    if (period !== "data") {
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

    const series: { date: string; label: string; labelShort: string; saldo: number | null; saldoFuturo?: number; saldoConta?: number }[] = [];

    const allDatesSorted = allEvents.map((e) => e.date).sort();
    const firstHistoricalDate = allDatesSorted[0];
    const includesFirst = firstHistoricalDate >= range.from && firstHistoricalDate <= range.to;

    if (statusFilter === "liquidadas") {
      // Sempre começa em zero — o gráfico mostra apenas saídas (liquidações)
      const anchor = sortedDates[0] ?? range.from;
      const baseDate = new Date(anchor + "T00:00:00");
      baseDate.setDate(baseDate.getDate() - 1);
      const baseline = localISO(baseDate);
      series.push({ date: baseline, label: fmtDate(baseline), labelShort: fmtDayMonth(baseline), saldo: 0, saldoConta: getAccountBalance(baseline) });
    } else if (period === "total" && includesFirst && statusFilter !== "a_vencer") {
      // Começa em zero UM DIA ANTES da primeira operação histórica
      const d = new Date(sortedDates[0] + "T00:00:00");
      d.setDate(d.getDate() - 1);
      const baseline = localISO(d);
      series.push({ date: baseline, label: fmtDate(baseline), labelShort: fmtDayMonth(baseline), saldo: 0, saldoConta: getAccountBalance(baseline) });
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
        saldoConta: getAccountBalance(anchor),
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
            saldoConta: getAccountBalance(firstStr),
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
        series[series.length - 1].saldoConta = getAccountBalance(d);
      } else {
        series.push({
          date: d,
          label: (period === "data") ? `${fmtDate(d.slice(0, 10))} ${fmtTime(d)}` : fmtDate(d),
          labelShort: (period === "data") ? fmtTime(d) : fmtDayMonth(d),
          saldo: useFuture ? null : currentVal,
          saldoFuturo: useFuture ? currentVal : undefined,
          saldoConta: getAccountBalance(d),
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
          saldoConta: getAccountBalance(todayStr),
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
            saldoConta: getAccountBalance(todayStr),
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
              saldoConta: getAccountBalance(todayStr),
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

    // Calcular dias para liquidação
    const isBalanceFilter = ["todas", "iniciadas", "andamento", "vencidas"].includes(statusFilter);
    if (isBalanceFilter) {
      for (const s of series) {
        let maxExit = "";
        for (const r of filteredRows) {
          const evDate = (period === "data") ? r.createdAt : r.operationDate.slice(0, 10);
          let setDate = "";
          if (r.settled) {
            const rawDate = (r.settledDate && r.settledDate >= "2026-06-01") ? r.settledDate : r.dueDate;
            setDate = (period === "data") ? rawDate : rawDate.slice(0, 10);
          } else {
            const rawDate = r.dueDate;
            setDate = (period === "data") ? rawDate : rawDate.slice(0, 10);
          }

          let isIncluded = false;
          if (evDate <= s.date) {
            if (r.settled) {
              if (setDate > s.date) isIncluded = true;
            } else if (r.dueDate > todayStr) {
              if (setDate > s.date) isIncluded = true;
            } else {
              isIncluded = true;
            }
          }

          if (isIncluded) {
            if (setDate > maxExit) maxExit = setDate;
          }
        }

        let days = 0;
        if (maxExit && maxExit > s.date) {
          const d1 = new Date(s.date.slice(0, 10) + "T00:00:00").getTime();
          const d2 = new Date(maxExit.slice(0, 10) + "T00:00:00").getTime();
          days = Math.round((d2 - d1) / 86400000);
        }
        (s as any).daysToClearRaw = days;
      }

      const maxSaldo = series.length > 0 ? Math.max(1, ...series.map(s => Math.max(s.saldo || 0, s.saldoFuturo || 0))) : 1;
      const maxDays = series.length > 0 ? Math.max(1, ...series.map(s => (s as any).daysToClearRaw || 0)) : 1;
      const scale = maxDays > 0 ? (maxSaldo / maxDays) : 0;

      for (const s of series) {
        if ((s as any).daysToClearRaw !== undefined) {
          (s as any).diasProporcional = (s as any).daysToClearRaw * scale;
        }
      }
    }

    // Calcular a evolução do score para cada ponto do gráfico
    const getScoreAtDate = (dStr: string) => {
      const rowsUpToDate = rows.filter(r => r.operationDate <= dStr);
      if (rowsUpToDate.length === 0) return 100;

      const g = rowsUpToDate.reduce(
        (accStats, r) => {
          const isSettledByDate = r.settled && r.settledDate && r.settledDate <= dStr;
          return {
            value: accStats.value + r.value,
            cost: accStats.cost + r.cost,
            factoring: accStats.factoring + r.factoringCost,
            settled: accStats.settled + (isSettledByDate ? r.value : 0),
            open: accStats.open + (isSettledByDate ? 0 : r.value),
          };
        },
        { value: 0, cost: 0, factoring: 0, settled: 0, open: 0 }
      );

      const effective = g.value > 0 ? (g.cost / g.value) * 100 : 0;
      const savings = Math.max(0, g.factoring - g.cost);
      
      const firstDate = dataBounds.from;
      const bDays = countBusinessDays(firstDate, dStr);
      const dailySpeed = g.value / bDays;

      const totalDebt = g.open;
      const totalSettled = g.settled;
      const totalBorrowed = g.value;

      const liquidationRate = totalBorrowed > 0 ? (totalSettled / totalBorrowed) * 100 : 0;
      const rolloverRate = Math.max(0, 100 - liquidationRate);

      const monthlyAnticipationVolume = dailySpeed * 22;
      const cashCommitmentPct = monthlyAnticipationVolume > 0 ? (totalDebt / monthlyAnticipationVolume) * 100 : 0;

      const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));
      const penCommit = clamp((cashCommitmentPct / 80) * 45, 0, 45);
      const penRoll   = clamp((rolloverRate / 100) * 30, 0, 30);
      const penRate   = clamp((effective / 6) * 25, 0, 25);
      const scoreNumeric = Math.round(clamp(100 - penCommit - penRoll - penRate));

      return scoreNumeric;
    };

    const getScoreLetter = (scoreNumeric: number) => {
      if (scoreNumeric < 25) {
        return scoreNumeric >= 17 ? "D+" : scoreNumeric >= 8 ? "D" : "D-";
      }
      if (scoreNumeric < 50) {
        return scoreNumeric >= 42 ? "C+" : scoreNumeric >= 33 ? "C" : "C-";
      }
      if (scoreNumeric < 75) {
        return scoreNumeric >= 67 ? "B+" : scoreNumeric >= 58 ? "B" : "B-";
      }
      return scoreNumeric >= 90 ? "A+" : scoreNumeric >= 82 ? "A" : "A-";
    };

    for (const s of series) {
      const d = s.date === "agora" ? todayStr : s.date;
      const scoreVal = getScoreAtDate(d);
      (s as any).score = scoreVal;
      (s as any).scoreLetter = getScoreLetter(scoreVal);
    }
    
    return series;
  }, [filteredRows, statusFilter, range.from, range.to, todayStr, period]);

  const xAxisTicks = useMemo(() => {
    if (chartData.length === 0) return undefined;
    const dates = chartData.map((d: any) => d.date);
    const first = dates[0];
    const last = dates[dates.length - 1];
    
    if (isMobile) {
      const monthTicks = new Set<string>();
      for (let i = 1; i < dates.length - 1; i++) {
        const prevM = dates[i - 1].slice(5, 7);
        const currM = dates[i].slice(5, 7);
        if (prevM !== currM && dates[i] !== "agora" && dates[i] !== first && dates[i] !== last) {
          monthTicks.add(dates[i]);
        }
      }
      
      const middleTicks = Array.from(monthTicks).sort();
      return [first, ...middleTicks, last].filter((val, index, self) => self.indexOf(val) === index);
    } else {
      // Desktop: 2 intervalos por semana (a cada ~3.5 dias), ancorados harmonicamente nas viradas de mês
      const boundaries: number[] = [];
      for (let i = 1; i < dates.length; i++) {
        if (dates[i - 1].substring(0, 7) !== dates[i].substring(0, 7)) {
          boundaries.push(i);
        }
      }

      const ticks: string[] = [];
      const segments: { start: number; end: number }[] = [];

      if (boundaries.length === 0) {
        segments.push({ start: 0, end: dates.length - 1 });
      } else {
        segments.push({ start: 0, end: boundaries[0] - 1 });
        for (let j = 1; j < boundaries.length; j++) {
          segments.push({ start: boundaries[j - 1], end: boundaries[j] - 1 });
        }
        segments.push({ start: boundaries[boundaries.length - 1], end: dates.length - 1 });
      }

      for (const seg of segments) {
        const L = seg.end - seg.start + 1;
        ticks.push(dates[seg.start]);
        
        if (L > 1) {
          const numIntervals = Math.round(L / 3.5);
          if (numIntervals > 1) {
            for (let k = 1; k < numIntervals; k++) {
              const tickIdx = seg.start + Math.round((k * L) / numIntervals);
              if (tickIdx <= seg.end) {
                ticks.push(dates[tickIdx]);
              }
            }
          }
        }
      }

      if (last === "agora") ticks.push("agora");

      return ticks
        .filter((val, index, self) => self.indexOf(val) === index)
        .sort((a, b) => {
          if (a === "agora") return 1;
          if (b === "agora") return -1;
          return a.localeCompare(b);
        });
    }
  }, [chartData, isMobile]);

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
      // Se vai liquidar, pergunta a data (padrão é o dia atual)
      setSettlementDate(todayStr);
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
      // Registrar log da liquidação/desliquidação
      const inv = invoices.find((i) => i.id === invoiceId);
      if (inv) {
        const opNumStr = inv.ordem ? String(inv.ordem).padStart(4, "0") : "—";
        const clientName = inv.clients?.name ?? "—";
        const invoiceNumber = inv.invoice_number;
        const wasSettled = next.length > (Array.isArray(inv.settled_installments) ? inv.settled_installments.length : 0);
        const logAction = wasSettled ? "SETTLE" : "UNSETTLE";
        const logDetails = wasSettled
          ? `Liquidou a operação (Registro: ${opNumStr}, Cliente: ${clientName}, NF: ${invoiceNumber}, Valor Liquidado: ${formatBRL(inv.invoice_value)})`
          : `Removeu a liquidação da operação (Registro: ${opNumStr}, Cliente: ${clientName}, NF: ${invoiceNumber}, Valor Liquidado: ${formatBRL(inv.invoice_value)})`;
        await logOperationAction(logAction, opNumStr, clientName, invoiceNumber, logDetails, inv.invoice_value);
      }

      toast.success(successMsg);
      load();
    }
  };

  const confirmSettlement = async () => {
    if (!settlingRow) return;
    const inv = invoices.find((i) => i.id === settlingRow.invoiceId);
    if (!inv) return;

    // Validação da data de liquidação (máximo 1 dia anterior à data atual)
    if (settlementDate < yesterdayStr) {
      toast.error("A data de liquidação não pode ser anterior a ontem (máximo 1 dia de atraso permitido para configuração retroativa).");
      return;
    }

    const diffDaysHelper = (from: string, to: string): number => {
      const a = new Date(from + "T00:00:00");
      const b = new Date(to + "T00:00:00");
      return Math.max(0, Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24)));
    };

    const delayDays = diffDaysHelper(settlingRow.dueDate, settlementDate);

    if (delayDays > 5) {
      // Encargo adicional: taxa fixa de 3%/mês sobre os dias em atraso
      const r = 0.03;
      const valueNew = settlingRow.value * Math.pow(1 + r, delayDays / 30);
      const adjustment = valueNew - settlingRow.value;

      setPendingSettlementData({
        row: settlingRow,
        delayDays,
        valueNew,
        adjustment,
        settlementDate
      });
      setSettlingRow(null);
      setOverdueConfirmOpen(true);
      return;
    }

    const current: SettledEntry[] = Array.isArray(inv.settled_installments)
      ? (inv.settled_installments as any)
      : [];
    
    const next: SettledEntry[] = [...current, { id: settlingRow.installmentId, date: settlementDate, settled_at: new Date().toISOString() }];
    await saveSettlement(inv.id, next, "Parcela marcada como liquidada");
    setSettlingRow(null);
  };

  const executeSettlementWithAdjustment = async () => {
    if (!pendingSettlementData) return;
    const { row, delayDays, settlementDate } = pendingSettlementData;
    const inv = invoices.find((i) => i.id === row.invoiceId);
    if (!inv) return;

    // 1) Liquida a operação original pelo valor e data originais (sem editar a parcela).
    const currentSettled: SettledEntry[] = Array.isArray(inv.settled_installments)
      ? (inv.settled_installments as any)
      : [];
    const nextSettled: SettledEntry[] = [
      ...currentSettled,
      { id: row.installmentId, date: settlementDate, settled_at: new Date().toISOString() },
    ];
    await saveSettlement(inv.id, nextSettled, "Parcela marcada como liquidada");

    // 2) Cria uma NOVA operação "ADICIONAL" que cobre o período extra
    //    (do vencimento original até a data efetiva de liquidação),
    //    taxa 3%/mês, sem piso de 1,5%.
    const ADDITIONAL_MONTHLY_RATE = 3;
    const rAdd = ADDITIONAL_MONTHLY_RATE / 100;
    // Valor de face na maturidade = valor original * (1 + 3%)^(delay/30)
    const faceValue = Math.round(row.value * Math.pow(1 + rAdd, delayDays / 30) * 100) / 100;
    const newInstallmentId =
      (typeof crypto !== "undefined" && "randomUUID" in crypto)
        ? (crypto as any).randomUUID()
        : `ins_${Date.now()}`;

    const additionalInsert: any = {
      client_id: inv.client_id,
      invoice_number: inv.invoice_number,
      invoice_value: faceValue,
      operation_date: row.dueDate, // data inicial = vencimento original
      monthly_rate: ADDITIONAL_MONTHLY_RATE,
      factoring_monthly_rate: inv.factoring_monthly_rate ?? FACTORING_MONTHLY_RATE_PCT,
      installments: [
        { id: newInstallmentId, value: faceValue, dueDate: settlementDate },
      ],
      // A adicional nasce já liquidada — o encargo é pago junto com a original.
      settled_installments: [
        { id: newInstallmentId, date: settlementDate, settled_at: new Date().toISOString() },
      ],
      created_by: user?.id ?? null,
      is_additional: true,
      parent_invoice_id: inv.id,
    };

    const { data: newInv, error: insertErr } = await supabase
      .from("invoices")
      .insert(additionalInsert)
      .select("id, ordem")
      .single();

    if (insertErr) {
      console.error("Erro ao criar operação adicional:", insertErr);
      toast.error("Liquidação registrada, mas não foi possível criar a operação adicional.");
    } else {
      const newOpStr = newInv?.ordem ? String(newInv.ordem).padStart(4, "0") : "—";
      const origOpStr = inv.ordem ? String(inv.ordem).padStart(4, "0") : "—";
      const adjustment = Math.round((faceValue - row.value) * 100) / 100;
      await logOperationAction(
        "ADDITIONAL",
        newOpStr,
        inv.clients?.name ?? "—",
        inv.invoice_number,
        `Operação ADICIONAL aberta e liquidada por atraso de ${delayDays} dias na operação ${origOpStr}. Taxa 3%/mês. Encargo: ${formatBRL(adjustment)}`,
        faceValue,
      );
    }

    // Fechar modais
    setOverdueConfirmOpen(false);
    setPendingSettlementData(null);
    load();
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

      // Registrar log da remoção
      const opNumStr = inv.ordem ? String(inv.ordem).padStart(4, "0") : "—";
      const clientName = inv.clients?.name ?? "—";
      const invoiceNumber = inv.invoice_number;
      await logOperationAction(
        "DELETE",
        opNumStr,
        clientName,
        invoiceNumber,
        `Deletou a operação (Registro: ${opNumStr}, Cliente: ${clientName}, NF: ${invoiceNumber}, Valor: ${formatBRL(inv.invoice_value)})`,
        inv.invoice_value
      );

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

  // Hover state for registro action buttons
  const [regHoverKey, setRegHoverKey] = useState<string | null>(null);

  // Sorting state
  type SortKey =
    | "clientName"
    | "invoiceNumber"
    | "parcelLabel"
    | "operationDate"
    | "dueDate"
    | "settlementDate"
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
      let primary: number;
      if (typeof av === "number" && typeof bv === "number") {
        primary = (av - bv) * dir;
      } else {
        const as = String(av ?? "").toLowerCase();
        const bs = String(bv ?? "").toLowerCase();
        primary = as.localeCompare(bs, "pt-BR", { numeric: true }) * dir;
      }
      if (primary !== 0) return primary;
      // Desempate: número de registro decrescente (mais recente no topo)
      return (b.opNumber ?? 0) - (a.opNumber ?? 0);
    });
    return arr;
  }, [filteredRows, sortKey, sortDir]);

  const [collapsedMonths, setCollapsedMonths] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const keys: Record<string, boolean> = {};
    for (const r of sortedRows) {
      const key = r.operationDate.substring(0, 7);
      keys[key] = false;
    }
    setCollapsedMonths(keys);
  }, [period, statusFilter, showFuture, from, to]);

  const isMonthOpenByDefault = (monthRows: typeof sortedRows) => {
    return monthRows.some(r => !r.settled);
  };

  const isMonthOpen = (monthKey: string, monthRows: typeof sortedRows) => {
    if (collapsedMonths[monthKey] !== undefined) {
      return !collapsedMonths[monthKey];
    }
    return isMonthOpenByDefault(monthRows);
  };

  const toggleMonth = (monthKey: string, monthRows: typeof sortedRows) => {
    setCollapsedMonths(prev => ({
      ...prev,
      [monthKey]: isMonthOpen(monthKey, monthRows)
    }));
  };

  const groupedByMonth = useMemo(() => {
    const groups: { [key: string]: typeof sortedRows } = {};
    for (const r of sortedRows) {
      const key = r.operationDate.substring(0, 7);
      if (!groups[key]) groups[key] = [];
      groups[key].push(r);
    }
    return Object.keys(groups)
      .sort((a, b) => b.localeCompare(a))
      .map(key => {
        const [year, month] = key.split("-");
        const monthName = MONTHS_PT[parseInt(month, 10) - 1] || month;
        return {
          key,
          label: `${monthName} / ${year}`,
          rows: groups[key]
        };
      });
  }, [sortedRows]);

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
      <th className={"px-1.5 py-2 text-center font-medium whitespace-nowrap " + className}>
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

  // Row coloring
  const rowClass = (r: (typeof rows)[number]) => {
    if (r.isAdditional) return "bg-purple-500/10 hover:bg-purple-500/15 text-purple-400";
    if (r.settled) return "bg-[hsl(var(--factoring-amber)/0.22)] hover:bg-[hsl(var(--factoring-amber)/0.28)]";
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
        <span className="font-mono text-[9px] md:text-xs tracking-[0.15em] md:tracking-[0.25em] text-muted-foreground/70 whitespace-nowrap">
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
                <span className="font-mono text-[10px] md:text-xs tracking-[0.25em] text-muted-foreground">DATA</span>
                <DateField value={from} onChange={(v) => { setFrom(v); setTo(v); }} />
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px] md:text-xs tracking-[0.25em] text-muted-foreground">DE</span>
                  <DateField value={from} onChange={setFrom} />
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px] md:text-xs tracking-[0.25em] text-muted-foreground">ATÉ</span>
                  <DateField value={to} onChange={setTo} />
                </div>
              </>
            )}
          </div>
        )}

        {/* Mobile toggle */}
        <button
          onClick={() => setMobileFiltersOpen((v) => !v)}
          className="sm:hidden inline-flex items-center gap-2 rounded-full border border-border/50 bg-background/60 px-3 py-1 font-mono text-[10px] tracking-[0.2em] text-muted-foreground hover:text-foreground transition-all"
        >
          <SlidersHorizontal className="h-3 w-3" />
          {mobileFiltersOpen ? "OCULTAR FILTROS" : "MOSTRAR FILTROS"}
        </button>

        {/* Filter rows */}
        <div className={cn("flex flex-wrap items-center justify-center gap-4 sm:gap-6", !mobileFiltersOpen && "hidden sm:flex")}>
          {/* Period pills */}
          <div className="flex flex-col items-center gap-1.5">
            <span className="font-mono text-[10px] md:text-[9px] tracking-[0.2em] text-muted-foreground/60 uppercase">PERÍODO DE TEMPO</span>
            <div className="inline-flex flex-wrap justify-center rounded-full border border-border/50 bg-background/60 p-0.5 gap-0.5 shadow-panel">
              {periodOptions.map((opt) => {
                const active = period === opt.id;
                return (
                  <button
                    key={opt.id}
                    onClick={() => setPeriod(opt.id)}
                    className={
                      "inline-flex items-center rounded-full px-3 py-1 font-mono text-[10px] md:text-[10px] tracking-[0.25em] transition-all whitespace-nowrap " +
                      (active
                        ? "animate-color-cycle text-primary-foreground"
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
            <span className="font-mono text-[10px] md:text-[9px] tracking-[0.2em] text-muted-foreground/60 uppercase">STATUS DAS OPERAÇÕES</span>
            <div className="inline-flex flex-wrap justify-center rounded-full border border-border/50 bg-background/60 p-0.5 gap-0.5 shadow-panel">
              {statusOptions.map((opt) => {
                const active = statusFilter === opt.id;
                return (
                  <button
                    key={opt.id}
                    onClick={() => setStatusFilter(opt.id)}
                    className={
                      "inline-flex items-center rounded-full px-3 py-1 font-mono text-[10px] md:text-[10px] tracking-[0.25em] transition-all whitespace-nowrap " +
                      (active
                        ? "animate-color-cycle text-primary-foreground"
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

  const renderResumoDoDia = () => {
    if (resumoDoDiaRows.length === 0) {
      return (
        <section className="rounded-2xl border border-border/60 bg-gradient-card p-6 md:p-8 shadow-card animate-fade-up mb-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
              <h2 className="font-mono text-sm sm:text-base md:text-lg tracking-[0.2em] font-bold uppercase">Resumo do Dia</h2>
            </div>
            <span className="font-mono text-xs lg:text-sm tracking-[0.3em] text-muted-foreground">
              SEM OPERAÇÕES HOJE
            </span>
          </div>
        </section>
      );
    }

    return (
      <section className="rounded-2xl border border-border/60 bg-gradient-card p-6 md:p-8 shadow-card animate-fade-up mb-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
            <h2 className="font-mono text-sm sm:text-base md:text-lg tracking-[0.2em] font-bold uppercase">Resumo do Dia</h2>
          </div>
          <span className="font-mono text-xs lg:text-sm tracking-[0.3em] text-muted-foreground">
            {resumoDoDiaRows.length} {resumoDoDiaRows.length === 1 ? "OPERAÇÃO" : "OPERAÇÕES"}
          </span>
        </div>

        <div className="space-y-4">
            {/* Mobile cards */}
            <div className="space-y-2 md:hidden">
              {resumoDoDiaRows.map((r) => {
                const canManage = isAdmin || (r.isAuthor && r.withinEditWindow);
                return (
                  <div
                    key={`resumo-${r.key}`}
                    className={cn(
                      "group/card rounded-lg border px-3 py-1.5 relative shadow-sm backdrop-blur-sm transition-all",
                      r.isAdditional
                        ? "bg-purple-500/10 border-purple-500/25 text-purple-400"
                        : r.settled
                        ? "bg-factoring-amber/10 border-factoring-amber/25 text-factoring-amber-foreground"
                        : r.overdue
                        ? "bg-cost-red/10 border-cost-red/25 text-cost-red-foreground"
                        : "bg-net-green/15 border-net-green/25 text-net-green-foreground"
                    )}
                  >
                    {/* Row 0: Action Badge */}
                    <div className="mb-1 flex justify-between items-center">
                      <span className={cn(
                        "rounded-full px-2 py-0.5 font-mono text-[8px] tracking-wider font-bold border",
                        r.isAdditional
                          ? "bg-purple-500/20 text-purple-400 border-purple-500/30"
                          : r.actionType === "INICIADA" && "bg-primary/20 text-primary border-primary/30",
                        !r.isAdditional && r.actionType === "EDITADA" && "bg-blue-500/20 text-blue-400 border-blue-500/30",
                        !r.isAdditional && r.actionType === "LIQUIDADA" && "bg-factoring-amber/20 text-factoring-amber border-factoring-amber/30"
                      )}>
                        {r.isAdditional ? "ADICIONAL" : r.actionType}
                      </span>
                    </div>

                    {/* Row 1: Client Name & Status Button */}
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-bold truncate text-foreground flex-1">{r.clientName}</span>
                      <button
                        type="button"
                        onClick={() => toggleSettlement(r)}
                        title={r.settled ? "Tocar para desfazer a liquidação" : "Tocar para marcar como LIQUIDADA"}
                        className={cn(
                          "rounded-full px-2.5 py-0.5 font-mono text-[9px] tracking-wider font-bold transition-all shrink-0 active:scale-95",
                          r.isAdditional
                            ? "bg-purple-500/20 text-purple-400 border border-purple-500/30 hover:bg-purple-500/30"
                            : r.settled
                            ? "bg-factoring-amber/20 text-factoring-amber border border-factoring-amber/35 hover:bg-factoring-amber/30"
                            : r.overdue
                            ? "bg-cost-red/20 text-cost-red border border-cost-red/35 hover:bg-cost-red/30"
                            : "bg-net-green/15 text-net-green border border-net-green/30 hover:bg-net-green/25"
                        )}
                      >
                        {r.isAdditional ? "ADICIONAL" : r.settled ? "LIQUIDADA" : r.overdue ? "VENCIDA" : "ANDAMENTO"}
                      </button>
                    </div>

                    {/* Row 1.5: Registry & NF */}
                    <div className="mt-0.5 font-mono text-[10px] text-muted-foreground/80">
                      {r.opNumber ? `REG: ${String(r.opNumber).padStart(4, "0")}${r.parcelLabel === "ÚNICA" ? "" : String.fromCharCode(96 + (parseInt(r.parcelLabel) || 0))}` : "REG: —"} · NF: {r.invoiceNumber}
                    </div>

                    {/* Row 2: Dates Grid */}
                    <div className="mt-1.5 grid grid-cols-3 gap-2 border-t border-border/10 pt-1 font-mono text-[10px] text-muted-foreground">
                      <div className="flex flex-col">
                        <span className="text-[9px] uppercase tracking-wider text-muted-foreground/60 mb-0.5">Abertura</span>
                        <span className="text-foreground/90 font-semibold">{fmtDateShort(r.operationDate)}</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[9px] uppercase tracking-wider text-muted-foreground/60 mb-0.5">Vencimento</span>
                        <span className="text-foreground/90 font-semibold">{fmtDateShort(r.dueDate)}</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[9px] uppercase tracking-wider text-muted-foreground/60 mb-0.5">Liquidação</span>
                        <span className="text-foreground/90 font-semibold">{r.settlementDate ? fmtDateShort(r.settlementDate) : "—"}</span>
                      </div>
                    </div>

                    {/* Row 3: Values & Actions */}
                    <div className="mt-1.5 grid grid-cols-3 gap-2 border-t border-border/10 pt-1">
                      {!r.isAdditional ? (
                        <>
                          <div className="flex flex-col font-mono text-[10px] tabular-nums text-muted-foreground">
                            <span className="text-[8px] uppercase tracking-wider block text-muted-foreground/50 mb-0.5">Bruto</span>
                            <span className="text-factoring-amber font-bold text-[10px] sm:text-xs">{formatBRL(r.value)}</span>
                          </div>
                          <div className="flex flex-col font-mono text-[10px] tabular-nums text-muted-foreground">
                            <span className="text-[8px] uppercase tracking-wider block text-muted-foreground/50 mb-0.5">Líquido</span>
                            <span className="text-net-green font-bold text-[10px] sm:text-xs">{formatBRL(r.presentValue)}</span>
                          </div>
                          <div className="flex flex-col font-mono text-[10px] tabular-nums text-muted-foreground">
                            <span className="text-[8px] uppercase tracking-wider block text-muted-foreground/50 mb-0.5">Custo</span>
                            <span className="text-cost-red font-bold text-[10px] sm:text-xs">{formatBRL(r.cost)}</span>
                          </div>
                        </>
                      ) : (
                        <div className="flex flex-col font-mono text-[10px] tabular-nums text-muted-foreground col-span-3">
                          <span className="text-[8px] uppercase tracking-wider block text-muted-foreground/50 mb-0.5">Custo</span>
                          <span className="text-cost-red font-bold text-[10px] sm:text-xs">{formatBRL(r.value - r.presentValue)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop table */}
            <div className="hidden md:block overflow-visible">
              <table className="w-full table-auto text-xs lg:text-sm">
                <thead className="bg-muted/40 font-mono tracking-widest">
                  <tr className="text-muted-foreground whitespace-nowrap">
                    <th className="px-1.5 py-2 text-center font-medium">REGISTRO</th>
                    <th className="px-1.5 py-2 text-center font-medium">STATUS</th>
                    <th className="px-1.5 py-2 text-left font-medium">CLIENTE</th>
                    <th className="px-1.5 py-2 text-center font-medium">NF</th>
                    <th className="px-1.5 py-2 text-center font-medium">ABERTURA</th>
                    <th className="px-1.5 py-2 text-center font-medium">VENCIMENTO</th>
                    <th className="px-1.5 py-2 text-center font-medium">LIQUIDAÇÃO</th>
                    <th className="px-1.5 py-2 text-center font-medium">DIAS</th>
                    <th className="px-1.5 py-2 text-center font-medium">TAXA EFET.</th>
                    <th className="px-1.5 py-2 text-center font-medium">BRUTO (R$)</th>
                    <th className="px-1.5 py-2 text-center font-medium">LÍQUIDO (R$)</th>
                    <th className="px-1.5 py-2 text-center font-medium">CUSTO (R$)</th>
                    <th className="px-1.5 py-2 text-center font-medium">AUTOR</th>
                  </tr>
                </thead>
                <tbody>
                  {resumoDoDiaRows.map((r) => {
                    const canManage = isAdmin || (r.isAuthor && r.withinEditWindow);
                    return (
                      <tr
                        key={`resumo-tr-${r.key}`}
                        className={cn(
                          "group/row border-t border-border/40 font-mono tabular-nums text-center transition-colors h-9",
                          rowClass(r)
                        )}
                      >
                        <td
                          className="px-1.5 py-2 text-muted-foreground relative"
                          onMouseEnter={() => canManage && setRegHoverKey(r.key)}
                          onMouseLeave={() => setRegHoverKey((k) => k === r.key ? null : k)}
                        >
                          <div className="flex items-center justify-center">
                            {regHoverKey === r.key && canManage ? (
                              <div className="flex items-center gap-0.5 bg-background/95 backdrop-blur-sm border border-border/50 rounded-md p-0.5 shadow-lg">
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
                            ) : (
                              r.opNumber ? `${String(r.opNumber).padStart(4, "0")}${r.parcelLabel === "ÚNICA" ? "" : String.fromCharCode(96 + (parseInt(r.parcelLabel) || 0))}` : "—"
                            )}
                          </div>
                        </td>

                        <td className="px-2 py-2">
                          <div className="inline-flex items-center justify-center">
                            <button
                              type="button"
                              onClick={() => toggleSettlement(r)}
                              title={
                                r.settled
                                  ? "Clique para desfazer a liquidação"
                                  : "Clique para marcar como LIQUIDADA"
                              }
                              className={cn(
                                "group status-pill relative inline-flex items-center justify-center h-5 w-[92px] whitespace-nowrap rounded-full px-2 text-[10px] tracking-widest transition-all cursor-pointer",
                                r.isAdditional
                                  ? "bg-purple-500/20 text-purple-400 hover:bg-purple-500/30"
                                  : r.settled
                                  ? "bg-factoring-amber/20 text-factoring-amber hover:bg-factoring-amber/30"
                                  : r.overdue
                                  ? "bg-cost-red/20 text-cost-red hover:bg-factoring-amber/30 hover:text-factoring-amber"
                                  : "bg-net-green/15 text-net-green hover:bg-factoring-amber/30 hover:text-factoring-amber"
                              )}
                            >
                              <span className="group-hover:hidden">
                                {r.isAdditional
                                  ? "ADICIONAL"
                                  : r.settled
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
                          </div>
                        </td>
                        <td className="px-2 py-2 max-w-[160px] truncate" title={r.clientName}>
                          {r.clientName}
                        </td>
                        <td className="px-1.5 py-2">{r.invoiceNumber}{r.parcelLabel === "ÚNICA" ? "" : String.fromCharCode(96 + (parseInt(r.parcelLabel) || 0))}</td>
                        <td className="px-1.5 py-2">{fmtDateShort(r.operationDate)}</td>
                        <td className="px-1.5 py-2">{fmtDateShort(r.dueDate)}</td>
                        <td className="px-1.5 py-2">{r.settlementDate ? fmtDateShort(r.settlementDate) : "—"}</td>
                        <td className="px-1.5 py-2">{r.days}</td>
                        <td className="px-1.5 py-2">{formatPct(r.effectivePct)}</td>
                        <td className="px-1.5 py-2 text-factoring-amber font-bold">{r.isAdditional ? "—" : formatBRL(r.value)}</td>
                        <td className="px-1.5 py-2 text-net-green font-bold">{r.isAdditional ? "—" : formatBRL(r.presentValue)}</td>
                        <td className="px-1.5 py-2 text-cost-red font-bold">{formatBRL(r.cost)}</td>
                        <td className="px-1.5 py-2 text-muted-foreground truncate max-w-[100px]" title={r.createdBy}>{r.createdBy}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
        </div>
      </section>
    );
  };

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
    const rolloverRate = totalBorrowed > 0
      ? Math.max(0, 100 - liquidationRate)
      : 0;

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

    let riskLevel: "BAIXO" | "MODERADO" | "ALTO" | "CRÍTICO" = "BAIXO";
    let riskColor = "text-net-green";
    let riskBg = "bg-net-green/10 border-net-green/20";
    let riskBorder = "border-net-green/30";
    let healthScore = "A+";
    let scoreColor = "text-net-green";
    let barColor = "bg-net-green";
    let cardBg = "bg-net-green/[0.04]";
    let cardBorder = "border-net-green/20";

    if (scoreNumeric < 25) {
      riskLevel = "CRÍTICO";
      riskColor = "text-cost-red";
      riskBg = "bg-cost-red/10 border-cost-red/20";
      riskBorder = "border-cost-red/30";
      healthScore = scoreNumeric >= 17 ? "D+" : scoreNumeric >= 8 ? "D" : "D-";
      scoreColor = "text-cost-red animate-pulse-glow";
      barColor = "bg-cost-red";
      cardBg = "bg-cost-red/[0.04]";
      cardBorder = "border-cost-red/20";
    } else if (scoreNumeric < 50) {
      riskLevel = "ALTO";
      riskColor = "text-factoring-amber";
      riskBg = "bg-factoring-amber/10 border-factoring-amber/20";
      riskBorder = "border-factoring-amber/30";
      healthScore = scoreNumeric >= 42 ? "C+" : scoreNumeric >= 33 ? "C" : "C-";
      scoreColor = "text-factoring-amber";
      barColor = "bg-factoring-amber";
      cardBg = "bg-factoring-amber/[0.04]";
      cardBorder = "border-factoring-amber/20";
    } else if (scoreNumeric < 75) {
      riskLevel = "MODERADO";
      riskColor = "text-yellow-500";
      riskBg = "bg-yellow-500/10 border-yellow-500/20";
      riskBorder = "border-yellow-500/30";
      healthScore = scoreNumeric >= 67 ? "B+" : scoreNumeric >= 58 ? "B" : "B-";
      scoreColor = "text-yellow-500";
      barColor = "bg-yellow-500";
      cardBg = "bg-yellow-500/[0.04]";
      cardBorder = "border-yellow-500/20";
    } else {
      riskLevel = "BAIXO";
      healthScore = scoreNumeric >= 90 ? "A+" : scoreNumeric >= 82 ? "A" : "A-";
    }

    return {
      dailySpeed, effectiveRate, totalDebt, totalSettled, totalBorrowed,
      liquidationRate, rolloverRate, monthlyAnticipationVolume,
      cashCommitmentPct, daysToClear, projectedInterest30d,
      projectedInterest1y, annualSavingsProjected,
      riskLevel, riskColor, riskBg, riskBorder, healthScore, scoreColor, scoreNumeric, barColor, cardBg, cardBorder,
    };
  }, [globalStats]);

  // === Consultor AI: recomendação adaptativa que muda forma e conteúdo a cada nova operação ou liquidação ===
  const opsCount = rows.length;
  const settledCount = rows.reduce((n, r) => n + (r.settled ? 1 : 0), 0);
  const eventCount = opsCount + settledCount;

  // Encontrar o evento mais recente (abertura ou liquidação)
  const latestCreatedRow = rows.reduce<any>((latest, r) => {
    if (!latest) return r;
    const tLatest = latest.createdAt ? new Date(latest.createdAt).getTime() : 0;
    const tr = r.createdAt ? new Date(r.createdAt).getTime() : 0;
    return tr > tLatest ? r : latest;
  }, null);

  const latestSettledRow = rows.reduce<any>((latest, r) => {
    if (!r.settled || !r.settledAt) return latest;
    if (!latest) return r;
    const tLatest = latest.settledAt ? new Date(latest.settledAt).getTime() : 0;
    const tr = new Date(r.settledAt).getTime();
    return tr > tLatest ? r : latest;
  }, null);

  const latestCreatedTime = latestCreatedRow?.createdAt ? new Date(latestCreatedRow.createdAt).getTime() : 0;
  const latestSettledTime = latestSettledRow?.settledAt ? new Date(latestSettledRow.settledAt).getTime() : 0;

  const isLatestEventSettlement = latestSettledTime > latestCreatedTime;

  const activeRowForLabel = isLatestEventSettlement ? latestSettledRow : latestCreatedRow;
  const latestOpNumber = rows.reduce((max, r) => {
    const n = Number(r.opNumber) || 0;
    return n > max ? n : max;
  }, 0);

  const opLabel = activeRowForLabel?.opNumber
    ? String(activeRowForLabel.opNumber).padStart(4, "0")
    : (latestOpNumber > 0 ? String(latestOpNumber).padStart(4, "0") : String(opsCount).padStart(4, "0"));

  const advisorRecommendation = useMemo(() => {
    const {
      cashCommitmentPct, rolloverRate, effectiveRate, daysToClear,
      totalDebt, totalBorrowed, totalSettled, dailySpeed,
      projectedInterest30d, annualSavingsProjected, scoreNumeric, healthScore, riskLevel,
    } = alertMetrics;

    if (opsCount === 0) {
      return {
        tone: "neutral" as const,
        headline: "Aguardando primeiro lançamento",
        body: "Cadastre uma operação para iniciarmos o diagnóstico adaptativo. A cada novo registro ou liquidação a recomendação será recalculada considerando comprometimento de receita, rolagem, taxa efetiva e velocidade diária.",
      };
    }

    // Tom derivado do MESMO scoreNumeric usado no quadro de risco,
    // garantindo consistência entre a placa (BAIXO/MODERADO/ALTO/CRÍTICO)
    // e o texto do Consultor AI.
    const tone: "up" | "warn" | "alert" | "down" =
      scoreNumeric >= 75 ? "up"
      : scoreNumeric >= 50 ? "warn"
      : scoreNumeric >= 25 ? "alert"
      : "down";

    const commitTier = cashCommitmentPct >= 60 ? 3 : cashCommitmentPct >= 25 ? 2 : 1;
    const rollTier   = rolloverRate >= 70 ? 3 : rolloverRate >= 40 ? 2 : 1;
    const rateTier   = effectiveRate >= 4 ? 3 : effectiveRate >= 2 ? 2 : 1;
    const speedTier  = dailySpeed > 0 && daysToClear > 45 ? 3 : daysToClear > 20 ? 2 : 1;

    const tiers = [
      { key: "commit", tier: commitTier, value: cashCommitmentPct },
      { key: "roll",   tier: rollTier,   value: rolloverRate },
      { key: "rate",   tier: rateTier,   value: effectiveRate },
      { key: "speed",  tier: speedTier,  value: daysToClear },
    ];
    const dominant = [...tiers].sort((a, b) => b.tier - a.tier || b.value - a.value)[0];

    const pick = <T,>(arr: T[]): T => arr[eventCount % arr.length];

    // Variáveis dinâmicas baseadas no tipo de evento mais recente (abertura ou liquidação)
    const eventAction = isLatestEventSettlement ? "liquidada" : "aberta";
    const eventPrefix = isLatestEventSettlement ? "a liquidação da operação" : "a abertura da operação";
    const eventLancement = isLatestEventSettlement ? "a liquidação do lançamento" : "a abertura da operação";
    const eventRegistry = isLatestEventSettlement ? "a liquidação do registro" : "a abertura do registro";

    const openings: Record<typeof tone, string[]> = {
      up: [
        `Operação ${opLabel} ${eventAction} — risco ${riskLevel} (score ${scoreNumeric}/100, nota ${healthScore}).`,
        `Bom trabalho. Após ${eventRegistry} ${opLabel}, o risco segue ${riskLevel} e os indicadores continuam equilibrados (${healthScore}).`,
        `Cenário confortável após ${eventLancement} ${opLabel}: ${formatPct(rolloverRate)} de rolagem e ${formatPct(cashCommitmentPct)} de receita comprometida — risco ${riskLevel}.`,
      ],
      warn: [
        `Diagnóstico atualizado após ${eventPrefix} ${opLabel}: risco ${riskLevel} (score ${scoreNumeric}, ${healthScore}).`,
        `${isLatestEventSettlement ? 'A liquidação' : 'A abertura'} ${opLabel} mantém o risco em ${riskLevel} — exposição em ${formatBRL(totalDebt)} contra ${formatBRL(totalBorrowed)} captados.`,
        `Após ${eventRegistry} ${opLabel}, risco ${riskLevel}: ${formatPct(cashCommitmentPct)} da receita futura comprometida e taxa efetiva média em ${formatPct(effectiveRate)}.`,
      ],
      alert: [
        `Atenção: após ${eventPrefix} ${opLabel} o risco subiu para ${riskLevel} (score ${scoreNumeric}, ${healthScore}).`,
        `${isLatestEventSettlement ? 'A liquidação' : 'A abertura'} ${opLabel} eleva o risco a ${riskLevel} — ${formatPct(rolloverRate)} de rolagem e ${formatPct(cashCommitmentPct)} de comprometimento da receita.`,
        `Sinal amarelo forte após ${eventRegistry} ${opLabel}: risco ${riskLevel}, ${formatBRL(totalDebt)} em aberto e ~${Math.round(daysToClear)} dias úteis para zerar a posição.`,
      ],
      down: [
        `Alerta crítico após ${eventPrefix} ${opLabel}: risco ${riskLevel} (score ${scoreNumeric}, ${healthScore}) e ${formatPct(rolloverRate)} de rolagem indicam dependência crescente de novas captações.`,
        `Cenário ${riskLevel} após ${eventRegistry} ${opLabel} — receita comprometida em ${formatPct(cashCommitmentPct)} e ${Math.round(daysToClear)} dias úteis necessários para zerar a posição no ritmo atual.`,
        `${isLatestEventSettlement ? 'A liquidação' : 'A abertura'} ${opLabel} intensifica a pressão (risco ${riskLevel}): ${formatBRL(totalDebt)} em aberto contra apenas ${formatBRL(totalSettled)} liquidados.`,
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
        `Composição saudável entre captação e liquidação após ${eventRegistry} ${opLabel}. A economia projetada anual frente ao factoring soma ${formatBRL(annualSavingsProjected)}.`,
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
      alert: [
        `Suspenda novas antecipações até liquidar pelo menos ${formatBRL(totalDebt * 0.4)} do saldo aberto — isso devolve o risco à faixa moderada.`,
        `Reduza o ritmo para no máximo ${formatBRL(dailySpeed * 0.5)}/dia útil e priorize títulos curtos (≤10 dias) para derrubar a taxa efetiva de ${formatPct(effectiveRate)}.`,
        "Renegocie spread com o banco antes da próxima captação e evite rolagem — o objetivo é liquidar mais rápido do que captar nas próximas 2 semanas.",
      ],
      down: [
        `Freie novas antecipações por pelo menos ${Math.max(5, Math.round(daysToClear / 3))} dias úteis e direcione todo o fluxo recebido à liquidação dos títulos abertos.`,
        "Renegociação é prioridade: leve à mesa o histórico e peça redução de spread ou troca por uma linha de capital de giro mais barata para os títulos mais longos.",
        `Estabeleça um teto de antecipação semanal abaixo de ${formatBRL(dailySpeed * 5 * 0.5)} até a rolagem cair para menos de 40%.`,
      ],
    };

    const headline =
      tone === "down" ? "Risco crítico"
      : tone === "alert" ? "Risco alto"
      : tone === "warn" ? "Risco moderado"
      : "Saúde financeira positiva";

    return {
      tone,
      headline,
      body: `${pick(openings[tone])} ${diagnosis} ${pick(actions[tone])}`,
    };
  }, [opsCount, settledCount, eventCount, opLabel, alertMetrics, isLatestEventSettlement]);

  useEffect(() => {
    if (invoices.length === 0) return;
    
    setLoadingInsights(true);
    const delayDebounce = setTimeout(async () => {
      try {
        const { data, error } = await supabase.functions.invoke("financial-insights", {
          body: {
            alertMetrics: {
              scoreNumeric: alertMetrics.scoreNumeric,
              healthScore: alertMetrics.healthScore,
              riskLevel: alertMetrics.riskLevel,
              totalDebt: formatBRL(alertMetrics.totalDebt),
              dailySpeed: formatBRL(alertMetrics.dailySpeed),
              daysToClear: Math.ceil(alertMetrics.daysToClear),
              rolloverRate: Math.round(alertMetrics.rolloverRate),
              totalBorrowed: formatBRL(alertMetrics.totalBorrowed),
              totalSettled: formatBRL(alertMetrics.totalSettled),
              effectiveRate: alertMetrics.effectiveRate.toFixed(2),
              monthlyAnticipationVolume: formatBRL(alertMetrics.monthlyAnticipationVolume),
              projectedInterest30d: formatBRL(alertMetrics.projectedInterest30d),
              cashCommitmentPct: Math.round(alertMetrics.cashCommitmentPct),
              projectedInterest1y: formatBRL(alertMetrics.projectedInterest1y),
              annualSavingsProjected: formatBRL(alertMetrics.annualSavingsProjected),
            }
          }
        });

        if (error) throw error;
        if (data && !data.error) {
          setAiInsights(data);
        } else {
          throw new Error(data?.error || "Invalid response");
        }
      } catch (err) {
        console.error("Erro ao carregar insights de IA:", err);
        setAiInsights(null);
      } finally {
        setLoadingInsights(false);
      }
    }, 1000);

    return () => clearTimeout(delayDebounce);
  }, [
    alertMetrics.scoreNumeric,
    alertMetrics.totalDebt,
    alertMetrics.dailySpeed,
    alertMetrics.daysToClear,
    alertMetrics.rolloverRate,
    alertMetrics.monthlyAnticipationVolume,
    alertMetrics.projectedInterest30d,
    alertMetrics.cashCommitmentPct,
    alertMetrics.projectedInterest1y,
    alertMetrics.annualSavingsProjected,
    invoices.length
  ]);




  return (
    <div className="min-h-screen relative">
      {showSplash && (
        <>
          <style>{`html, body { overflow: hidden !important; }`}</style>
          <div className={cn(
            "fixed inset-0 z-[100] flex items-center justify-center bg-background/95 backdrop-blur-md transition-opacity duration-700 ease-out",
            splashFade ? "opacity-0 pointer-events-none" : "opacity-100"
          )}>
            <div className="w-full max-w-[600px] h-[200px] flex items-center justify-center">
              {fontLoaded && (
                <VaporizeTextCycle
                  texts={["MYKACA$H"]}
                  font={{
                    fontFamily: '"Allerta Stencil", "Space Grotesk", system-ui, sans-serif',
                    fontSize: "52px",
                    fontWeight: 800,
                  }}
                  color="gradient"
                  spread={4}
                  density={6}
                  animation={{
                    vaporizeDuration: 2.2,
                    fadeInDuration: 1.0,
                    waitDuration: 0.6,
                  }}
                  direction="left-to-right"
                  alignment="center"
                  loop={false}
                />
              )}
            </div>
          </div>
        </>
      )}

      <AppHeader />
      <main className="mx-auto w-full max-w-[1600px] px-2 md:px-4 lg:px-6 py-4 md:py-6 pb-20 space-y-8">
        <PageNav />

        {isInitialLoading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <span className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            <div className="font-mono text-xs tracking-widest text-muted-foreground uppercase animate-pulse">
              Carregando dados...
            </div>
          </div>
        ) : (
          <>
            {/* Summary panels — reflect selected period */}
            {showHistory && (<>
        <section className="grid gap-4 md:grid-cols-3 animate-fade-up">
          <div className="relative overflow-hidden rounded-xl bg-gradient-net p-4 text-net-green-foreground panel-glow-net">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,255,255,0.25),transparent_60%)]" />
            <div className="relative">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="font-mono text-[11px] tracking-[0.3em] opacity-80">VALOR LÍQUIDO</div>
                  <div className="mt-1 font-display text-xl md:text-2xl font-bold tabular-nums whitespace-nowrap">
                    {formatBRL(totals.presentValue)}
                  </div>
                </div>
                <div>
                  <div className="font-mono text-[11px] tracking-[0.25em] opacity-70 text-right">MÉDIA DIÁRIA</div>
                  <div className="mt-1 font-display text-sm md:text-base font-semibold tabular-nums text-right opacity-90 whitespace-nowrap">
                    {formatBRL(dailyAvgNet)}
                  </div>
                </div>
              </div>
              <div className="mt-3 h-px bg-white/20" />
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <div className="font-mono text-[11px] tracking-[0.3em] opacity-80">VALOR BRUTO</div>
                  <div className="mt-1 font-display text-xl md:text-2xl font-bold tabular-nums whitespace-nowrap">
                    {formatBRL(totals.value)}
                  </div>
                </div>
                <div>
                  <div className="font-mono text-[11px] tracking-[0.25em] opacity-70 text-right">MÉDIA DIÁRIA</div>
                  <div className="mt-1 font-display text-sm md:text-base font-semibold tabular-nums text-right opacity-90 whitespace-nowrap">
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
                  <div className="font-mono text-[11px] tracking-[0.3em] opacity-80">CUSTO</div>
                  <div className="mt-1 font-display text-xl md:text-2xl font-bold tabular-nums whitespace-nowrap">
                    {formatBRL(totals.cost)}
                  </div>
                </div>
                <div>
                  <div className="font-mono text-[11px] tracking-[0.3em] opacity-80 text-right">TAXA EFETIVA</div>
                  <div className="mt-1 font-display text-sm md:text-base font-semibold tabular-nums text-right whitespace-nowrap">
                    {formatPct(totalEffective)}
                  </div>
                </div>
              </div>
              <div className="mt-3 h-px bg-white/20" />
              <div className="grid grid-cols-2 gap-3 mt-3">
                <div>
                  <div className="font-mono text-[11px] tracking-[0.3em] opacity-80">ECONOMIA FACTORING</div>
                  <div className="mt-1 font-display text-xl md:text-2xl font-bold tabular-nums whitespace-nowrap">
                    {formatBRL(factoringSavings)}
                  </div>
                </div>
                <div>
                  <div className="font-mono text-[11px] tracking-[0.3em] opacity-80 text-right">TAXA EFETIVA</div>
                  <div className="mt-1 font-display text-sm md:text-base font-semibold tabular-nums text-right whitespace-nowrap">
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
                  <div className="font-mono text-[11px] tracking-[0.3em] opacity-90">VALOR EM ABERTO</div>
                  <div className="mt-1 font-display text-xl md:text-2xl font-bold tabular-nums whitespace-nowrap">
                    {formatBRL(openPresent)}
                  </div>
                </div>
                <div>
                  <div className="font-mono text-[11px] tracking-[0.25em] opacity-70 text-right">MÉDIA DIÁRIA</div>
                  <div className="mt-1 font-display text-sm md:text-base font-semibold tabular-nums text-right opacity-90 whitespace-nowrap">
                    {formatBRL(dailyAvgOpen)}
                  </div>
                </div>
              </div>
              <div className="mt-3 h-px bg-white/25" />
              <div className="mt-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="font-mono text-[11px] tracking-[0.3em] opacity-90">VALOR LIQUIDADO</div>
                    <div className="mt-1 font-display text-xl md:text-2xl font-bold tabular-nums whitespace-nowrap">
                      {formatBRL(settledPresent)}
                    </div>
                  </div>
                  <div>
                    <div className="font-mono text-[11px] tracking-[0.25em] opacity-70 text-right">MÉDIA DIÁRIA</div>
                    <div className="mt-1 font-display text-sm md:text-base font-semibold tabular-nums text-right opacity-90 whitespace-nowrap">
                      {formatBRL(dailyAvgSettled)}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
        </>)}

        {showAnalytics && (
        /* Score Evolution Chart */
        <section className="rounded-2xl border border-border/60 bg-gradient-card p-6 md:p-8 shadow-card animate-fade-up">
          <div className="grid gap-6 md:grid-cols-12 items-stretch">
            {/* Left: Score chart */}
            <div className="md:col-span-8 lg:col-span-9 flex flex-col justify-between">
              <div>
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                    <h2 className="font-mono text-sm sm:text-base md:text-lg tracking-[0.2em] font-bold uppercase">
                      SCORE FINANCEIRO
                    </h2>
                  </div>
                  <span 
                    className="font-mono text-[9px] sm:text-xs lg:text-sm tracking-[0.3em] text-muted-foreground text-right leading-relaxed"
                    style={{ marginRight: 12, textAlign: "right" }}
                  >
                    PERÍODO:<br className="sm:hidden" />
                    <span className="hidden sm:inline"> </span>
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
                      const gradId = "scoreGrad-" + chartGradId;
                      const monthBoundaries: string[] = [];
                      for (let i = 1; i < chartData.length; i++) {
                        const prevMonth = chartData[i - 1].date.slice(5, 7);
                        const currMonth = chartData[i].date.slice(5, 7);
                        if (prevMonth !== currMonth) {
                          monthBoundaries.push(chartData[i].date);
                        }
                      }
                      const maxScore = Math.max(1, ...chartData.map((d: any) => d.score ?? 0));
                      const minScore = Math.min(maxScore, ...chartData.map((d: any) => d.score ?? 0));
                      const lineRange = maxScore - minScore;
                      const clamp = (val: number) => Math.max(0, Math.min(1, val));
                      
                      // Area stops: 0 to maxScore
                      const areaStopGreen = clamp((maxScore - 75) / maxScore);
                      const areaStopYellow = clamp((maxScore - 50) / maxScore);
                      const areaStopOrange = clamp((maxScore - 25) / maxScore);

                      // Line stops: minScore to maxScore
                      const lineStopGreen = lineRange > 0
                        ? clamp((maxScore - 75) / lineRange)
                        : (maxScore >= 75 ? 1 : 0);
                      const lineStopYellow = lineRange > 0
                        ? clamp((maxScore - 50) / lineRange)
                        : (maxScore >= 50 ? 1 : 0);
                      const lineStopOrange = lineRange > 0
                        ? clamp((maxScore - 25) / lineRange)
                        : (maxScore >= 25 ? 1 : 0);

                      return (
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={chartData} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
                            <defs>
                              <linearGradient id={`areaGradScore-${gradId}`} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="hsl(var(--net-green))" stopOpacity={0.4} />
                                <stop offset={`${areaStopGreen * 100}%`} stopColor="hsl(var(--net-green))" stopOpacity={0.4} />
                                <stop offset={`${areaStopGreen * 100}%`} stopColor="#eab308" stopOpacity={0.4} />
                                <stop offset={`${areaStopYellow * 100}%`} stopColor="#eab308" stopOpacity={0.4} />
                                <stop offset={`${areaStopYellow * 100}%`} stopColor="hsl(var(--factoring-amber))" stopOpacity={0.4} />
                                <stop offset={`${areaStopOrange * 100}%`} stopColor="hsl(var(--factoring-amber))" stopOpacity={0.4} />
                                <stop offset={`${areaStopOrange * 100}%`} stopColor="hsl(var(--cost-red))" stopOpacity={0.4} />
                                <stop offset="100%" stopColor="hsl(var(--cost-red))" stopOpacity={0.4} />
                              </linearGradient>
                              <linearGradient id={`lineGradScore-${gradId}`} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="hsl(var(--net-green))" stopOpacity={1} />
                                <stop offset={`${lineStopGreen * 100}%`} stopColor="hsl(var(--net-green))" stopOpacity={1} />
                                <stop offset={`${lineStopGreen * 100}%`} stopColor="#eab308" stopOpacity={1} />
                                <stop offset={`${lineStopYellow * 100}%`} stopColor="#eab308" stopOpacity={1} />
                                <stop offset={`${lineStopYellow * 100}%`} stopColor="hsl(var(--factoring-amber))" stopOpacity={1} />
                                <stop offset={`${lineStopOrange * 100}%`} stopColor="hsl(var(--factoring-amber))" stopOpacity={1} />
                                <stop offset={`${lineStopOrange * 100}%`} stopColor="hsl(var(--cost-red))" stopOpacity={1} />
                                <stop offset="100%" stopColor="hsl(var(--cost-red))" stopOpacity={1} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="4 4" stroke="hsl(var(--muted-foreground))" opacity={0.4} vertical={true} horizontal={true} />
                            {monthBoundaries.map((dateKey) => (
                              <ReferenceLine
                                key={dateKey}
                                x={dateKey}
                                yAxisId="right"
                                stroke="hsl(var(--muted-foreground))"
                                strokeDasharray="4 4"
                                strokeWidth={2}
                                opacity={0.6}
                              />
                            ))}
                            <XAxis
                              dataKey="date"
                              hide={isMobile}
                              interval={0}
                              ticks={xAxisTicks}
                              tickFormatter={(val) => {
                                if (val === "agora") return "agora";
                                const parts = val.split("-");
                                if (parts.length === 3) {
                                  if (isMobile) {
                                    const isFirst = xAxisTicks && xAxisTicks[0] === val;
                                    const isLast = xAxisTicks && xAxisTicks[xAxisTicks.length - 1] === val;
                                    if (isFirst || isLast) {
                                      return `${parts[2]}/${parts[1]}`; // "DD/MM"
                                    }
                                    const monthIdx = parseInt(parts[1], 10) - 1;
                                    const monthsShort = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
                                    return monthsShort[monthIdx] || val;
                                  }
                                  return parts[2];
                                }
                                return val;
                              }}
                              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                              stroke="hsl(var(--border))"
                            />
                            <YAxis
                              yAxisId="left"
                              width={30}
                              domain={[0, 100]}
                              axisLine={false}
                              tickLine={false}
                              tickMargin={4}
                              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                              stroke="hsl(var(--border))"
                              tickFormatter={(v) => `${v}`}
                            />
                            <YAxis
                              yAxisId="right"
                              orientation="right"
                              width={45}
                              domain={[0, 100]}
                              axisLine={false}
                              tickLine={false}
                              tickMargin={4}
                              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                              stroke="hsl(var(--border))"
                              tickFormatter={(v) => `${v}`}
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
                                        fontSize: 13,
                                      }}
                                    >
                                      <div style={{ color: "hsl(var(--foreground))", marginBottom: 4, fontWeight: 500 }}>
                                        {data.label} {data.date !== "agora" ? `- ${weekdayShortPt(data.date.slice(0, 10))}` : ""}
                                      </div>
                                      {(() => {
                                        const getScoreColorHex = (score: number) => {
                                          if (score < 25) return "hsl(var(--cost-red))";
                                          if (score < 50) return "hsl(var(--factoring-amber))";
                                          if (score < 75) return "#eab308";
                                          return "hsl(var(--net-green))";
                                        };
                                        return (
                                          <div style={{ color: getScoreColorHex(data.score), fontWeight: 600 }}>
                                            Score: {data.score} ({data.scoreLetter})
                                          </div>
                                        );
                                      })()}
                                    </div>
                                  );
                                }
                                return null;
                              }}
                            />
                            <Area
                              yAxisId="left"
                              type="monotone"
                              dataKey="score"
                              name="Score"
                              stroke={`url(#lineGradScore-${gradId})`}
                              strokeWidth={2.5}
                              fill={`url(#areaGradScore-${gradId})`}
                              isAnimationActive={true}
                              animationDuration={900}
                              animationEasing="ease-out"
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      );
                    })()
                  )}
                </div>
                {chartData.length > 0 && (() => {
                  const monthSegs: { key: string; label: string; count: number }[] = [];
                  for (const p of chartData) {
                    const [y, m] = p.date.split("-");
                    const key = `${y}-${m}`;
                    const label = isMobile
                      ? (["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"][parseInt(m, 10) - 1] || m)
                      : (MONTHS_PT[parseInt(m, 10) - 1] || m);
                    const last = monthSegs[monthSegs.length - 1];
                    if (last && last.key === key) last.count += 1;
                    else monthSegs.push({ key, label, count: 1 });
                  }
                  const segs: { year: string; count: number }[] = [];
                  for (const p of chartData) {
                    const y = yearOf(p.date);
                    const last = segs[segs.length - 1];
                    if (last && last.year === y) last.count += 1;
                    else segs.push({ year: y, count: 1 });
                  }
                  const total = chartData.length;
                  return (
                    <>
                      <div className="mt-1 flex bg-muted/40 rounded-sm" style={{ marginLeft: isMobile ? 0 : 30, marginRight: isMobile ? 0 : 45 }}>
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
                      <div className="mt-1 flex" style={{ marginLeft: 30, marginRight: 45 }}>
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
              </div>
            </div>

            {/* Right: Placa de Diagnóstico/Score Card */}
            <div className={cn("md:col-span-4 lg:col-span-3 flex flex-col justify-between rounded-xl border p-6 shadow-panel items-center text-center backdrop-blur-sm transition-all duration-300", alertMetrics.cardBorder, alertMetrics.cardBg)}>
              <div className="space-y-2">
                <div className="font-mono text-xs tracking-widest text-muted-foreground uppercase">DIAGNÓSTICO DE RISCO</div>
                <div className={cn("inline-flex items-center rounded-full px-3 py-1 font-mono text-xs tracking-widest font-bold", alertMetrics.riskColor, alertMetrics.riskBg)}>
                  {alertMetrics.riskLevel}
                </div>
              </div>

              {/* Placa do Score */}
              <div className="my-4">
                <div className="font-mono text-xs tracking-widest text-muted-foreground uppercase">SCORE DE SAÚDE</div>
                <div className={cn("font-display text-6xl font-extrabold tracking-tight mt-2 flex items-baseline gap-2", alertMetrics.scoreColor)}>
                  <span>{alertMetrics.scoreNumeric}</span>
                  <span className="text-4xl opacity-80">({alertMetrics.healthScore})</span>
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
                      alertMetrics.barColor
                    )}
                    style={{ width: `${Math.min(100, alertMetrics.cashCommitmentPct)}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </section>
        )}

        {showHistory && (
        /* Chart */
        <section className="rounded-2xl border border-border/60 bg-gradient-card p-6 md:p-8 shadow-card animate-fade-up">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="h-2 w-2 rounded-full animate-color-cycle" />
              <h2 className="font-mono text-sm sm:text-base md:text-lg tracking-[0.2em] font-bold uppercase">
                Gráfico Evolutivo
              </h2>
            </div>
            <span 
              className="font-mono text-[9px] sm:text-xs lg:text-sm tracking-[0.3em] text-muted-foreground text-right leading-relaxed"
              style={{ marginRight: 12, textAlign: "right" }}
            >
              PERÍODO:<br className="sm:hidden" />
              <span className="hidden sm:inline"> </span>
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
                        hide={isMobile}
                        interval={0}
                        ticks={xAxisTicks}
                        tickFormatter={(val) => {
                          if (val === "agora") return "agora";
                          const parts = val.split("-");
                          if (parts.length === 3) {
                            if (isMobile) {
                              const isFirst = xAxisTicks && xAxisTicks[0] === val;
                              const isLast = xAxisTicks && xAxisTicks[xAxisTicks.length - 1] === val;
                              if (isFirst || isLast) {
                                return `${parts[2]}/${parts[1]}`; // "DD/MM"
                              }
                              const monthIdx = parseInt(parts[1], 10) - 1;
                              const monthsShort = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
                              return monthsShort[monthIdx] || val;
                            }
                            return parts[2];
                          }
                          return val;
                        }}
                        tick={isMobile ? false : { fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                        stroke="hsl(var(--border))"
                      />
                      <YAxis
                        yAxisId="left"
                        hide={isMobile}
                        width={isMobile ? 0 : 60}
                        axisLine={false}
                        tickLine={false}
                        tickMargin={4}
                        tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                        stroke="hsl(var(--border))"
                        tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}K`}
                      />
                      <YAxis
                        yAxisId="right"
                        orientation="right"
                        hide={isMobile}
                        width={isMobile ? 0 : 45}
                        axisLine={false}
                        tickLine={false}
                        tickMargin={4}
                        tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                        stroke="hsl(var(--border))"
                        tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}K`}
                      />
                      <Tooltip
                        cursor={{ strokeWidth: 0, stroke: "transparent", fill: "transparent" }}
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const data = payload[0].payload;
                            // Encontrar o payload real de "saldo" para manter o comportamento anterior,
                            // evitando mostrar o "diasProporcional" como valor financeiro.
                            const saldoVal = payload.find(p => p.dataKey === "saldo" || p.dataKey === "saldoFuturo")?.value ?? payload[0].value;
                            return (
                              <div
                                style={{
                                  background: "hsl(var(--popover))",
                                  border: "1px solid hsl(var(--border))",
                                  borderRadius: 8,
                                  padding: "8px 12px",
                                  fontFamily: "JetBrains Mono, monospace",
                                  fontSize: 13,
                                }}
                              >
                                <div style={{ color: "hsl(var(--foreground))", marginBottom: 4, fontWeight: 500 }}>
                                  {data.label} {data.date !== "agora" ? `- ${weekdayShortPt(data.date.slice(0, 10))}` : ""}
                                </div>
                                <div style={{ color: "hsl(var(--foreground))" }}>
                                  Saldo Aberto: {formatBRL(saldoVal as number)}
                                </div>
                                {data.saldoConta !== undefined && (
                                  <div style={{ color: "hsl(var(--muted-foreground))", marginTop: 4, fontSize: 12 }}>
                                    Saldo Conta: {formatBRL(data.saldoConta)}
                                  </div>
                                )}
                                {data.daysToClearRaw !== undefined && data.daysToClearRaw > 0 && (
                                  <div style={{ color: "hsl(var(--primary))", marginTop: 4, fontSize: 12 }}>
                                    Liquidação: {data.daysToClearRaw} dias
                                  </div>
                                )}
                                {data.score !== undefined && (() => {
                                  const getScoreColorHex = (score: number) => {
                                    if (score < 25) return "hsl(var(--cost-red))";
                                    if (score < 50) return "hsl(var(--factoring-amber))";
                                    if (score < 75) return "#eab308";
                                    return "hsl(var(--net-green))";
                                  };
                                  return (
                                    <div style={{ color: getScoreColorHex(data.score), marginTop: 4, fontSize: 12 }}>
                                      Score: {data.score} ({data.scoreLetter})
                                    </div>
                                  );
                                })()}
                              </div>
                            );
                          }
                          return null;
                        }}
                      />

                      {monthBoundaries.map((dateKey) => {
                        const parts = dateKey.split("-");
                        const labelText = parts.length === 3 ? `${parts[2]}/${parts[1]}` : dateKey;
                        return (
                          <ReferenceLine
                            key={dateKey}
                            x={dateKey}
                            yAxisId="left"
                            stroke="hsl(var(--muted-foreground))"
                            strokeDasharray="4 4"
                            strokeWidth={2.5}
                            opacity={0.9}
                            label={isMobile ? undefined : {
                              value: labelText,
                              position: "insideTopLeft",
                              fill: "hsl(var(--muted-foreground))",
                              fontSize: 9,
                              fontFamily: "monospace",
                              offset: 5
                            }}
                          />
                        );
                      })}

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
                      {["todas", "iniciadas", "andamento", "vencidas"].includes(statusFilter) && (
                        <Area
                          yAxisId="left"
                          type="monotone"
                          dataKey="diasProporcional"
                          name="Esticamento de Prazo"
                          stroke="hsl(var(--primary))"
                          strokeWidth={2}
                          strokeDasharray="4 4"
                          fill="transparent"
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
            // Agrupa meses consecutivos
            const monthSegs: { key: string; label: string; count: number }[] = [];
            for (const p of chartData) {
              const [y, m] = p.date.split("-");
              const key = `${y}-${m}`;
              const label = isMobile
                ? (["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"][parseInt(m, 10) - 1] || m)
                : (MONTHS_PT[parseInt(m, 10) - 1] || m);
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
                <div className="mt-1 flex bg-muted/40 rounded-sm" style={{ marginLeft: isMobile ? 0 : 60, marginRight: isMobile ? 0 : 45 }}>
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
                <div className="mt-1 flex" style={{ marginLeft: isMobile ? 0 : 60, marginRight: isMobile ? 0 : 45 }}>
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
        )}

        {showAnalytics && (<>
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
              <h2 className="font-mono text-sm sm:text-base md:text-lg tracking-[0.2em] font-bold uppercase">
                Análise de Compromisso e Saúde Financeira
              </h2>
            </div>
          </div>

          <div className="w-full space-y-6 flex flex-col justify-between">
            <div className="space-y-6">
              {/* Diária & Velocidade */}
              <div className="space-y-3">
                <h3 className="font-mono text-sm tracking-wider text-primary font-bold uppercase">
                  Diária & Velocidade
                </h3>
                {loadingInsights ? (
                  <div className="space-y-2 animate-pulse py-1">
                    <div className="h-4 bg-white/5 rounded w-full"></div>
                    <div className="h-4 bg-white/5 rounded w-5/6"></div>
                    <div className="h-4 bg-white/5 rounded w-4/5"></div>
                  </div>
                ) : aiInsights?.dailySpeedText ? (
                  <p className="text-base text-justify text-foreground/90 leading-relaxed font-sans">
                    {aiInsights.dailySpeedText}
                  </p>
                ) : (
                  <>
                    <p className="text-base text-justify text-foreground/90 leading-relaxed font-sans">
                      A empresa está antecipando recebíveis a uma velocidade média de{" "}
                      <strong className="text-primary-glow font-mono text-base">{formatBRL(alertMetrics.dailySpeed)}/dia útil</strong>. 
                      Isso significa que seu fluxo de caixa futuro está sendo consumido de forma contínua para cobrir despesas de curto prazo.
                    </p>
                    <p className="text-base text-justify text-foreground/90 leading-relaxed font-sans">
                      Atualmente, o saldo bruto total já antecipado e em aberto é de{" "}
                      <strong className="text-cost-red font-mono text-base">{formatBRL(alertMetrics.totalDebt)}</strong>. 
                      Se a empresa parasse de realizar novas antecipações hoje, ela levaria aproximadamente{" "}
                      <strong className="text-foreground font-mono text-base">{Math.ceil(alertMetrics.daysToClear)} dias úteis</strong> para liquidar todo o saldo devedor pendente através dos recebimentos normais.
                    </p>
                    <p className="text-base text-justify text-foreground/90 leading-relaxed font-sans">
                      Adicionalmente, detectamos um comportamento de **Rolagem de Recebíveis (Re-empréstimo)**. Do volume total captado no período (<strong>{formatBRL(alertMetrics.totalBorrowed)}</strong>), apenas <strong>{formatPct(alertMetrics.liquidationRate)}</strong> foi liquidado de fato (<strong>{formatBRL(alertMetrics.totalSettled)}</strong>). Isso significa que <strong>{formatPct(alertMetrics.rolloverRate)}</strong> do capital está sendo re-emprestado de imediato, gerando um acúmulo acelerado de juros e dependência de novas antecipações para pagar títulos antigos.
                    </p>
                  </>
                )}
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

              <hr className="border-border/30" />

              {/* Projeção Mensal */}
              <div className="space-y-3">
                <h3 className="font-mono text-sm tracking-wider text-primary font-bold uppercase">
                  Projeção Mensal
                </h3>
                {loadingInsights ? (
                  <div className="space-y-2 animate-pulse py-1">
                    <div className="h-4 bg-white/5 rounded w-full"></div>
                    <div className="h-4 bg-white/5 rounded w-4/5"></div>
                  </div>
                ) : aiInsights?.monthlyProjectionText ? (
                  <p className="text-base text-justify text-foreground/90 leading-relaxed font-sans">
                    {aiInsights.monthlyProjectionText}
                  </p>
                ) : (
                  <>
                    <p className="text-base text-justify text-foreground/90 leading-relaxed font-sans">
                      Com ritmo de antecipações atual, o volume projetado de novos recebíveis antecipados para os próximos 30 dias é de{" "}
                      <strong className="text-primary-glow font-mono text-base">{formatBRL(alertMetrics.monthlyAnticipationVolume)}</strong>. 
                      Deste montante, o custo financeiro direto de juros e taxas consumirá cerca de{" "}
                      <strong className="text-cost-red font-mono text-base">{formatBRL(alertMetrics.projectedInterest30d)}</strong> de caixa líquido.
                    </p>
                    <p className="text-base text-justify text-foreground/90 leading-relaxed font-sans">
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
                  </>
                )}
                <div className="flex flex-wrap gap-2 pt-2">
                  <span className="inline-flex items-center rounded-full bg-white/5 px-2.5 py-0.5 font-mono text-[9px] tracking-wider text-muted-foreground border border-border/30">
                    JUROS PROJETADOS (30D): {formatBRL(alertMetrics.projectedInterest30d)}
                  </span>
                  <span className="inline-flex items-center rounded-full bg-white/5 px-2.5 py-0.5 font-mono text-[9px] tracking-wider text-muted-foreground border border-border/30">
                    COMPROMETIMENTO: {formatPct(alertMetrics.cashCommitmentPct)}
                  </span>
                </div>
              </div>

              <hr className="border-border/30" />

              {/* Visão Anual */}
              <div className="space-y-3">
                <h3 className="font-mono text-sm tracking-wider text-primary font-bold uppercase">
                  Visão Anual
                </h3>
                {loadingInsights ? (
                  <div className="space-y-2 animate-pulse py-1">
                    <div className="h-4 bg-white/5 rounded w-full"></div>
                    <div className="h-4 bg-white/5 rounded w-3/4"></div>
                  </div>
                ) : aiInsights?.annualVisionText ? (
                  <p className="text-base text-justify text-foreground/90 leading-relaxed font-sans">
                    {aiInsights.annualVisionText}
                  </p>
                ) : (
                  <>
                    <p className="text-base text-justify text-foreground/90 leading-relaxed font-sans">
                      A projeção em escala anual mantendo a atual taxa efetiva indica um pagamento acumulado de juros de{" "}
                      <strong className="text-cost-red font-mono text-base">{formatBRL(alertMetrics.projectedInterest1y)}</strong> ao ano.
                      Esta é a quantia que deixará de entrar diretamente no caixa líquido da sua empresa.
                    </p>
                    <p className="text-base text-justify text-foreground/90 leading-relaxed font-sans">
                      Por outro lado, o uso do MykaCash em comparação com as taxas tradicionais de mercado (Factoring) está gerando uma economia anual projetada de{" "}
                      <strong className="text-net-green font-mono text-base">{formatBRL(alertMetrics.annualSavingsProjected)}</strong>. 
                      Isto demonstra o impacto positivo da gestão interna de crédito e taxas de repasse.
                    </p>
                  </>
                )}
                <div className="flex flex-wrap gap-2 pt-2 font-mono text-[9px] tracking-wider">
                  <span className="inline-flex items-center rounded-full bg-cost-red/10 px-2.5 py-0.5 text-cost-red border border-cost-red/20">
                    CUSTO DE ANTECIPAÇÃO ANUAL PROJETADO: {formatBRL(alertMetrics.projectedInterest1y)}
                  </span>
                  <span className="inline-flex items-center rounded-full bg-net-green/10 px-2.5 py-0.5 text-net-green border border-net-green/20">
                    ECONOMIA ANUAL GERADA: {formatBRL(alertMetrics.annualSavingsProjected)}
                  </span>
                </div>
              </div>
            </div>

            {/* Dica Esperta do Consultor */}
            <div
              key={`advisor-${eventCount}-${alertMetrics.scoreNumeric}`}
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
                <p className="text-sm text-justify text-muted-foreground leading-normal font-sans">
                  {advisorRecommendation.body}
                </p>
              </div>
            </div>
          </div>
        </section>
        </>)}

        {showHistory && (<>
        {/* Secondary filters (Middle) */}
        {renderFilters()}

        {/* Resumo do Dia */}
        {renderResumoDoDia()}

        {/* Table */}
        <section className="rounded-2xl border border-border/60 bg-gradient-card p-6 md:p-8 shadow-card animate-fade-up">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
              <div className="flex items-center gap-3">
                <span className="h-2 w-2 rounded-full animate-color-cycle" />
                <h2 className="font-mono text-sm sm:text-base md:text-lg tracking-[0.2em] font-bold uppercase">Histórico de Operações</h2>
              </div>
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Buscar operações..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 h-8 bg-background/50 border-border/40 font-mono text-[11px]"
                />
              </div>
            </div>
            <span className="font-mono text-xs lg:text-sm tracking-[0.3em] text-muted-foreground hidden md:inline">
              {invoices.length} {invoices.length === 1 ? "OPERAÇÃO" : "OPERAÇÕES"} · {filteredRows.length}{" "}
              {filteredRows.length === 1 ? "PARCELA" : "PARCELAS"}
            </span>
          </div>

          {isInitialLoading ? (
            <div className="py-12 text-center font-mono text-xs tracking-widest text-muted-foreground">
              CARREGANDO...
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="py-12 text-center font-mono text-xs tracking-widest text-muted-foreground">
              NENHUMA ABERTURA NO PERÍODO
            </div>
          ) : (
            <div className="space-y-4">
              {groupedByMonth.map((month) => {
                const isOpen = isMonthOpen(month.key, month.rows);
                const monthTotals = month.rows.reduce(
                  (a, r) => ({
                    value: a.value + (r.isAdditional ? 0 : r.value),
                    presentValue: a.presentValue + (r.isAdditional ? 0 : r.presentValue),
                    cost: a.cost + r.cost,
                  }),
                  { value: 0, presentValue: 0, cost: 0 }
                );
                const totalValue = month.rows.reduce((sum, r) => sum + (r.isAdditional ? 0 : r.value), 0) || 1;
                const monthEffective = month.rows.reduce((sum, r) => sum + r.effectivePct * (r.isAdditional ? 0 : r.value), 0) / totalValue;

                return (
                  <div key={month.key} className="border border-border/40 rounded-xl overflow-hidden bg-background/20 backdrop-blur-sm shadow-sm transition-all duration-300">
                    {/* Month Header Button */}
                    <button
                      type="button"
                      onClick={() => toggleMonth(month.key, month.rows)}
                      className={cn(
                        "w-full flex flex-wrap items-center justify-between p-4 bg-muted/5 hover:bg-muted/10 transition-all text-left select-none group gap-3",
                        isOpen && "border-b border-border/40"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-muted-foreground transition-transform duration-200 group-hover:text-foreground">
                          {isOpen ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </span>
                        <span className="font-display text-sm font-bold tracking-wider uppercase text-foreground">
                          {month.label}
                        </span>
                        <span className="text-xs text-muted-foreground font-mono bg-muted/30 border border-border/20 px-2 py-0.5 rounded-full shrink-0">
                          {month.rows.length} {month.rows.length === 1 ? "parcela" : "parcelas"}
                        </span>
                      </div>

                      <div className="font-mono text-xs md:text-sm flex flex-wrap gap-x-4 gap-y-1 items-center ml-auto">
                        <span className="text-muted-foreground">
                          Bruto: <span className="font-bold text-factoring-amber">{formatBRL(monthTotals.value)}</span>
                        </span>
                        <span className="text-muted-foreground">
                          Líquido: <span className="font-bold text-net-green">{formatBRL(monthTotals.presentValue)}</span>
                        </span>
                        <span className="text-muted-foreground">
                          Custo: <span className="font-bold text-cost-red">{formatBRL(monthTotals.cost)}</span>
                        </span>
                        <span className="text-muted-foreground">
                          Taxa Efetiva: <span className="font-bold text-white">{formatPct(monthEffective)}</span>
                        </span>
                      </div>
                    </button>

                    {/* Month Content */}
                    {isOpen && (
                      <div className="animate-fade-in p-2 md:p-0">
                        {/* Mobile cards */}
                        <div className="space-y-2 md:hidden">
                          {month.rows.map((r) => {
                            const canManage = isAdmin || (r.isAuthor && r.withinEditWindow);
                            return (
                              <div
                                key={r.key}
                                className={cn(
                                  "group/card rounded-lg border px-3 py-1.5 relative shadow-sm backdrop-blur-sm transition-all",
                                  r.isAdditional
                                    ? "bg-purple-500/10 border-purple-500/25 text-purple-400"
                                    : r.settled
                                    ? "bg-factoring-amber/10 border-factoring-amber/25 text-factoring-amber-foreground"
                                    : r.overdue
                                    ? "bg-cost-red/10 border-cost-red/25 text-cost-red-foreground"
                                    : "bg-net-green/15 border-net-green/25 text-net-green-foreground"
                                )}
                              >
                                {/* Row 1: Client Name & Status Button */}
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-sm font-bold truncate text-foreground flex-1">{r.clientName}</span>
                                  <button
                                    type="button"
                                    onClick={() => toggleSettlement(r)}
                                    title={r.settled ? "Tocar para desfazer a liquidação" : "Tocar para marcar como LIQUIDADA"}
                                    className={cn(
                                      "rounded-full px-2.5 py-0.5 font-mono text-[9px] tracking-wider font-bold transition-all shrink-0 active:scale-95",
                                      r.isAdditional
                                        ? "bg-purple-500/20 text-purple-400 border border-purple-500/30 hover:bg-purple-500/30"
                                        : r.settled
                                        ? "bg-factoring-amber/20 text-factoring-amber border border-factoring-amber/35 hover:bg-factoring-amber/30"
                                        : r.overdue
                                        ? "bg-cost-red/20 text-cost-red border border-cost-red/35 hover:bg-cost-red/30"
                                        : "bg-net-green/15 text-net-green border border-net-green/30 hover:bg-net-green/25"
                                    )}
                                  >
                                    {r.isAdditional ? "ADICIONAL" : r.settled ? "LIQUIDADA" : r.overdue ? "VENCIDA" : "ANDAMENTO"}
                                  </button>
                                </div>

                                {/* Row 1.5: Registry & NF */}
                                <div className="mt-0.5 font-mono text-[10px] text-muted-foreground/80">
                                  {r.opNumber ? `REG: ${String(r.opNumber).padStart(4, "0")}${r.parcelLabel === "ÚNICA" ? "" : String.fromCharCode(96 + (parseInt(r.parcelLabel) || 0))}` : "REG: —"} · NF: {r.invoiceNumber}
                                </div>

                                {/* Row 2: Dates Grid */}
                                <div className="mt-1.5 grid grid-cols-3 gap-2 border-t border-border/10 pt-1 font-mono text-[10px] text-muted-foreground">
                                  <div className="flex flex-col">
                                    <span className="text-[9px] uppercase tracking-wider text-muted-foreground/60 mb-0.5">Abertura</span>
                                    <span className="text-foreground/90 font-semibold">{fmtDateShort(r.operationDate)}</span>
                                  </div>
                                  <div className="flex flex-col">
                                    <span className="text-[9px] uppercase tracking-wider text-muted-foreground/60 mb-0.5">Vencimento</span>
                                    <span className="text-foreground/90 font-semibold">{fmtDateShort(r.dueDate)}</span>
                                  </div>
                                  <div className="flex flex-col">
                                    <span className="text-[9px] uppercase tracking-wider text-muted-foreground/60 mb-0.5">Liquidação</span>
                                    <span className="text-foreground/90 font-semibold">{r.settlementDate ? fmtDateShort(r.settlementDate) : "—"}</span>
                                  </div>
                                </div>

                                {/* Row 3: Values & Actions */}
                                <div className="mt-1.5 grid grid-cols-3 gap-2 border-t border-border/10 pt-1">
                                  {!r.isAdditional ? (
                                    <>
                                      <div className="flex flex-col font-mono text-[10px] tabular-nums text-muted-foreground">
                                        <span className="text-[8px] uppercase tracking-wider block text-muted-foreground/50 mb-0.5">Bruto</span>
                                        <span className="text-factoring-amber font-bold text-[10px] sm:text-xs">{formatBRL(r.value)}</span>
                                      </div>
                                      <div className="flex flex-col font-mono text-[10px] tabular-nums text-muted-foreground">
                                        <span className="text-[8px] uppercase tracking-wider block text-muted-foreground/50 mb-0.5">Líquido</span>
                                        <span className="text-net-green font-bold text-[10px] sm:text-xs">{formatBRL(r.presentValue)}</span>
                                      </div>
                                      <div className="flex flex-col font-mono text-[10px] tabular-nums text-muted-foreground">
                                        <span className="text-[8px] uppercase tracking-wider block text-muted-foreground/50 mb-0.5">Custo</span>
                                        <span className="text-cost-red font-bold text-[10px] sm:text-xs">{formatBRL(r.cost)}</span>
                                      </div>
                                    </>
                                  ) : (
                                    <div className="flex flex-col font-mono text-[10px] tabular-nums text-muted-foreground col-span-3">
                                      <span className="text-[8px] uppercase tracking-wider block text-muted-foreground/50 mb-0.5">Custo</span>
                                      <span className="text-cost-red font-bold text-[10px] sm:text-xs">{formatBRL(r.value - r.presentValue)}</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* Desktop table */}
                        <div className="hidden md:block overflow-visible">
                          <table className="w-full table-auto text-xs lg:text-sm">
                            <thead className="bg-muted/40 font-mono tracking-widest">
                              <tr className="text-muted-foreground whitespace-nowrap">
                                <th className="px-1.5 py-2 text-center font-medium">REGISTRO</th>
                                <th className="px-1.5 py-2 text-center font-medium">STATUS</th>
                                <SortableTh label="CLIENTE" sKey="clientName" />
                                <SortableTh label="NF" sKey="invoiceNumber" />
                                <SortableTh label="ABERTURA" sKey="operationDate" />
                                <SortableTh label="VENCIMENTO" sKey="dueDate" />
                                <SortableTh label="LIQUIDAÇÃO" sKey="settlementDate" />
                                <SortableTh label="DIAS" sKey="days" />
                                <SortableTh label="TAXA EFET." sKey="effectivePct" />
                                <SortableTh label="BRUTO (R$)" sKey="value" />
                                <SortableTh label="LÍQUIDO (R$)" sKey="presentValue" />
                                <SortableTh label="CUSTO (R$)" sKey="cost" />
                                <SortableTh label="AUTOR" sKey="createdBy" />
                              </tr>
                            </thead>
                            <tbody>
                              {month.rows.map((r) => {
                                const canManage = isAdmin || (r.isAuthor && r.withinEditWindow);
                                return (
                                  <tr
                                    key={r.key}
                                    className={cn(
                                      "group/row border-t border-border/40 font-mono tabular-nums text-center transition-colors h-9",
                                      rowClass(r)
                                    )}
                                  >
                                      <td
                                        className="px-1.5 py-2 text-muted-foreground relative"
                                        onMouseEnter={() => canManage && setRegHoverKey(r.key)}
                                        onMouseLeave={() => setRegHoverKey((k) => k === r.key ? null : k)}
                                      >
                                        <div className="flex items-center justify-center">
                                          {regHoverKey === r.key && canManage ? (
                                            <div className="flex items-center gap-0.5 bg-background/95 backdrop-blur-sm border border-border/50 rounded-md p-0.5 shadow-lg">
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
                                          ) : (
                                            r.opNumber ? `${String(r.opNumber).padStart(4, "0")}${r.parcelLabel === "ÚNICA" ? "" : String.fromCharCode(96 + (parseInt(r.parcelLabel) || 0))}` : "—"
                                          )}
                                        </div>
                                      </td>
                                    <td className="px-2 py-2">
                                      <div className="inline-flex items-center justify-center">
                                        <button
                                          type="button"
                                          onClick={() => toggleSettlement(r)}
                                          title={
                                            r.settled
                                              ? "Clique para desfazer a liquidação"
                                              : "Clique para marcar como LIQUIDADA"
                                          }
                                          className={cn(
                                            "group status-pill relative inline-flex items-center justify-center h-5 w-[92px] whitespace-nowrap rounded-full px-2 text-[10px] tracking-widest transition-all cursor-pointer",
                                            r.isAdditional
                                              ? "bg-purple-500/20 text-purple-400 hover:bg-purple-500/30"
                                              : r.settled
                                              ? "bg-factoring-amber/20 text-factoring-amber hover:bg-factoring-amber/30"
                                              : r.overdue
                                              ? "bg-cost-red/20 text-cost-red hover:bg-factoring-amber/30 hover:text-factoring-amber"
                                              : "bg-net-green/15 text-net-green hover:bg-factoring-amber/30 hover:text-factoring-amber"
                                          )}
                                        >
                                          <span className="group-hover:hidden">
                                            {r.isAdditional
                                              ? "ADICIONAL"
                                              : r.settled
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
                                      </div>
                                    </td>
                                    <td className="px-2 py-2 max-w-[160px] truncate" title={r.clientName}>
                                      {r.clientName}
                                    </td>
                                    <td className="px-1.5 py-2">{r.invoiceNumber}{r.parcelLabel === "ÚNICA" ? "" : String.fromCharCode(96 + (parseInt(r.parcelLabel) || 0))}</td>
                                    <td className="px-1.5 py-2">{fmtDateShort(r.operationDate)}</td>
                                    <td className="px-1.5 py-2">{fmtDateShort(r.dueDate)}</td>
                                    <td className="px-1.5 py-2">{r.settlementDate ? fmtDateShort(r.settlementDate) : "—"}</td>
                                    <td className="px-1.5 py-2">{r.days}</td>
                                    <td className="px-1.5 py-2">{formatPct(r.effectivePct)}</td>
                                    <td className="px-1.5 py-2 text-factoring-amber">{r.isAdditional ? "—" : formatBRLNum(r.value)}</td>
                                    <td className="px-1.5 py-2 text-net-green">{r.isAdditional ? "—" : formatBRLNum(r.presentValue)}</td>
                                    <td className="px-1.5 py-2 text-cost-red">{formatBRLNum(r.cost)}</td>
                                    <td className="px-2 py-2 max-w-[120px] truncate" title={r.createdBy}>
                                      {r.createdBy}
                                    </td>
                                  </tr>
                                );
                              })}

                              <tr className="border-t-2 border-primary-glow/40 bg-primary-glow/[0.07] font-mono tabular-nums text-center font-semibold">
                                <td className="px-2 py-2">—</td>
                                <td className="px-2 py-2">—</td>
                                <td className="px-2 py-2 tracking-widest text-primary-glow">SUBTOTAL</td>
                                <td className="px-2 py-2">—</td>
                                <td className="px-2 py-2">—</td>
                                <td className="px-2 py-2">—</td>
                                <td className="px-2 py-2">—</td>
                                <td className="px-2 py-2">—</td>
                                <td className="px-1.5 py-2 text-center font-medium text-factoring-amber text-muted-foreground">{formatPct(monthEffective)}</td>
                                <td className="px-1.5 py-2 text-factoring-amber">{formatBRLNum(monthTotals.value)}</td>
                                <td className="px-1.5 py-2 text-net-green">{formatBRLNum(monthTotals.presentValue)}</td>
                                <td className="px-1.5 py-2 text-cost-red">{formatBRLNum(monthTotals.cost)}</td>
                                <td className="px-2 py-2">—</td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Overall Total Summary Bar */}
              <div className="flex flex-wrap justify-between items-center bg-muted/40 border border-border/60 rounded-xl p-4 font-mono text-xs md:text-sm shadow-sm">
                <span className="font-bold tracking-wider text-primary-glow uppercase">TOTAL GERAL DO PERÍODO</span>
                <div className="flex flex-wrap gap-x-6 gap-y-2">
                  <span>Bruto: <strong className="text-factoring-amber">{formatBRL(totals.value)}</strong></span>
                  <span>Líquido: <strong className="text-net-green">{formatBRL(totals.presentValue)}</strong></span>
                  <span>Custo: <strong className="text-cost-red">{formatBRL(totals.cost)}</strong></span>
                  <span className="hidden sm:inline">Taxa Efetiva: <strong className="text-white">{formatPct(totalEffective)}</strong></span>
                </div>
              </div>
            </div>
          )}
        </section>
        </>)}
          </>
        )}

        <footer className="border-t border-border/40 py-2 text-center mt-3">
          <p className="font-mono text-[10px] tracking-[0.35em] text-muted-foreground">MYKACA$H · VERSÃO 3.1</p>
        </footer>
      </main>

      {/* Fixed bottom filter bar */}
      {showHistory && renderFiltersBar()}

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
                min={yesterdayStr}
                onChange={(e) => setSettlementDate(e.target.value)}
              />
              <p className="text-[10px] font-mono text-muted-foreground/70 italic">
                Padrão: Data do dia atual. Permitido retroagir no máximo 1 dia (ontem).
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

      {/* Overdue Interest Adjustment Confirmation Dialog */}
      <Dialog open={overdueConfirmOpen} onOpenChange={(o) => {
        if (!o) {
          setOverdueConfirmOpen(false);
          setPendingSettlementData(null);
        }
      }}>
        <DialogContent className="max-w-xl bg-background/95 backdrop-blur-xl border-[hsl(var(--cost-red)/0.4)] shadow-[0_0_50px_hsl(var(--cost-red)/0.2)]">
          <DialogHeader>
            <DialogTitle className="font-display text-[hsl(var(--cost-red))] flex items-center gap-2 text-lg">
              <AlertTriangle className="h-5 w-5 animate-pulse" />
              Aviso de Correção de Juros: Atraso Excedido
            </DialogTitle>
            <DialogDescription className="font-mono text-[10px] tracking-wider uppercase">
              A tolerância de 5 dias de atraso foi ultrapassada
            </DialogDescription>
          </DialogHeader>

          {pendingSettlementData && (
            <div className="py-4 space-y-4">
              <div className="rounded-lg bg-[hsl(var(--cost-red)/0.04)] border border-[hsl(var(--cost-red)/0.2)] p-4 space-y-2.5">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-mono text-muted-foreground uppercase">Cliente:</span>
                  <span className="font-bold text-foreground">{pendingSettlementData.row.clientName}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="font-mono text-muted-foreground uppercase">Operação:</span>
                  <span className="font-mono text-foreground">OP #{String(pendingSettlementData.row.opNumber).padStart(3, "0")} · NF {pendingSettlementData.row.invoiceNumber}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="font-mono text-muted-foreground uppercase">Parcela:</span>
                  <span className="font-mono text-foreground">{pendingSettlementData.row.parcelLabel}</span>
                </div>
                <div className="h-px bg-[hsl(var(--cost-red)/0.15)] my-2" />
                <div className="flex justify-between items-center text-xs">
                  <span className="font-mono text-muted-foreground uppercase">Vencimento Original:</span>
                  <span className="font-mono text-foreground">{pendingSettlementData.row.dueDate.split("-").reverse().join("/")}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="font-mono text-muted-foreground uppercase">Data de Liquidação:</span>
                  <span className="font-mono text-foreground">{pendingSettlementData.settlementDate.split("-").reverse().join("/")}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="font-mono text-muted-foreground uppercase">Tempo de Atraso:</span>
                  <span className="font-mono font-bold text-[hsl(var(--cost-red))] bg-[hsl(var(--cost-red)/0.1)] px-2 py-0.5 rounded-full">{pendingSettlementData.delayDays} dias</span>
                </div>
              </div>

              <div className="border border-border/40 rounded-lg overflow-hidden bg-card/20">
                <div className="bg-muted/10 px-4 py-2 border-b border-border/40 font-mono text-[9px] tracking-wider text-muted-foreground uppercase">
                  DEMONSTRATIVO DE VALORES
                </div>
                <div className="p-4 space-y-3 font-mono text-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground uppercase">Valor Bruto Original:</span>
                    <span className="text-foreground font-semibold">{formatBRL(pendingSettlementData.row.value)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[hsl(var(--cost-red))] font-bold uppercase">Encargo Adicional (3%/mês):</span>
                    <span className="text-[hsl(var(--cost-red))] font-bold">+{formatBRL(pendingSettlementData.adjustment)}</span>
                  </div>
                  <div className="h-px bg-border/40 my-1" />
                  <div className="flex justify-between items-center text-sm font-bold">
                    <span className="text-foreground uppercase">Valor da Nova Op. Adicional:</span>
                    <span className="text-foreground text-base tracking-tight">{formatBRL(pendingSettlementData.valueNew)}</span>
                  </div>
                </div>
              </div>

              <div className="p-3 bg-[hsl(var(--cost-red)/0.06)] border border-[hsl(var(--cost-red)/0.2)] rounded-lg text-[10px] text-muted-foreground leading-relaxed flex items-start gap-2">
                <AlertTriangle className="h-4.5 w-4.5 text-[hsl(var(--cost-red))] shrink-0 mt-0.5" />
                <p>
                  <strong>Atenção:</strong> A operação original será liquidada pelo valor e vencimento originais. Uma nova operação <strong>ADICIONAL</strong> será gerada automaticamente cobrindo o período do vencimento até a data da liquidação, com taxa de 3%/mês e sem o piso de 1,5%.
                </p>
              </div>
            </div>
          )}

          <DialogFooter className="flex-col sm:flex-row gap-2 mt-2">
            <Button
              variant="outline"
              onClick={() => {
                setOverdueConfirmOpen(false);
                setPendingSettlementData(null);
              }}
              className="font-mono text-[10px] tracking-widest"
            >
              CANCELAR LIQUIDAÇÃO
            </Button>
            <Button
              onClick={executeSettlementWithAdjustment}
              className="bg-[hsl(var(--cost-red))] text-white hover:bg-[hsl(var(--cost-red)/0.9)] font-mono text-[10px] tracking-widest gap-1.5"
            >
              CONFIRMAR E AJUSTAR VALOR
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Overdue Operations Alert (shown once per login session) */}
      <Dialog open={overdueAlertOpen} onOpenChange={setOverdueAlertOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col bg-background/95 backdrop-blur-xl border-[hsl(var(--cost-red)/0.5)] shadow-[0_0_40px_hsl(var(--cost-red)/0.25)] [&>button]:hidden">
          <DialogHeader>
            <DialogTitle className="font-display text-[hsl(var(--cost-red))] text-2xl tracking-wide">
              ⚠ OPERAÇÕES VENCIDAS
            </DialogTitle>
            <DialogDescription className="font-mono text-[10px] tracking-wider uppercase">
              {overdueRows.length} {overdueRows.length === 1 ? "parcela vencida" : "parcelas vencidas"} · Total em aberto: <span className="text-foreground font-bold">{formatBRL(overdueRows.reduce((s, r) => s + r.value, 0))}</span>
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto py-2 space-y-2 pr-1">
            {overdueRows
              .slice()
              .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
              .map((r) => {
                const daysLate = Math.floor(
                  (new Date(todayStr + "T00:00:00").getTime() -
                    new Date(r.dueDate + "T00:00:00").getTime()) /
                    86400000
                );
                const isUnder5Days = daysLate < 5;
                const borderClass = isUnder5Days ? "border-[hsl(var(--factoring-amber)/0.3)]" : "border-[hsl(var(--cost-red)/0.3)]";
                const bgClass = isUnder5Days ? "bg-[hsl(var(--factoring-amber)/0.06)]" : "bg-[hsl(var(--cost-red)/0.06)]";
                const textClass = isUnder5Days ? "text-[hsl(var(--factoring-amber))]" : "text-[hsl(var(--cost-red))]";
                return (
                  <div
                    key={r.key}
                    className={`rounded-lg border ${borderClass} ${bgClass} p-3`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-display font-bold text-sm truncate">
                          {r.clientName}
                        </div>
                        <div className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
                          OP #{String(r.opNumber).padStart(3, "0")} · NOTA FISCAL {r.invoiceNumber} · PARC {r.parcelLabel}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className={`font-display font-bold text-base ${textClass}`}>
                          {formatBRL(r.value)}
                        </div>
                        <div className={`font-mono text-[10px] tracking-wider uppercase ${textClass}`}>
                          {daysLate} {daysLate === 1 ? "dia" : "dias"} em atraso
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => setOverdueAlertOpen(false)}
              className="font-mono text-[10px] tracking-widest"
            >
              FECHAR
            </Button>
            <Button
              onClick={() => {
                setStatusFilter("vencidas");
                setPeriod("total");
                setOverdueAlertOpen(false);
              }}
              className="bg-[hsl(var(--cost-red))] text-white hover:bg-[hsl(var(--cost-red)/0.9)] font-mono text-[10px] tracking-widest"
            >
              VER VENCIDAS
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={negativeBalanceAlertOpen} onOpenChange={setNegativeBalanceAlertOpen}>
        <DialogContent className="max-w-md bg-background/95 backdrop-blur-xl border-cost-red/40">
          <DialogHeader>
            <DialogTitle className="font-display text-cost-red flex items-center gap-2">
              ⚠️ ALERTA: Saldo de Conta Negativo
            </DialogTitle>
            <DialogDescription className="font-mono text-[10px] tracking-wider uppercase text-cost-red/80">
              Operação gerou inconsistência de caixa
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-3 font-mono text-xs">
            <p className="text-foreground">
              O saldo atual projetado da conta está negativo:{" "}
              <strong className="text-cost-red text-sm">{formatBRL(currentAccountBalance)}</strong>
            </p>
            <p className="text-muted-foreground leading-relaxed">
              Isso indica que há operações em aberto (não liquidadas) registradas no sistema sem saldo suficiente em conta para cobri-las.
            </p>
            <div className="p-3 rounded-lg bg-cost-red/10 border border-cost-red/20 text-cost-red text-[11px] leading-relaxed">
              <strong>Importante:</strong> Verifique as operações pendentes e marque-as como liquidadas assim que o crédito entrar no banco, ou registre os aportes/depósitos correspondentes no Painel Financeiro para regularizar o caixa.
            </div>
          </div>
          <DialogFooter>
            <Button
              className="bg-cost-red hover:bg-cost-red/90 text-white font-mono text-[10px] tracking-widest w-full"
              onClick={() => setNegativeBalanceAlertOpen(false)}
            >
              ENTENDIDO
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>

  );
};

export default Historico;
