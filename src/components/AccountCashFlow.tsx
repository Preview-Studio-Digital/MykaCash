import React, { useState, useEffect, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { calculate, formatBRL, type Installment } from "@/lib/calc";
import { playSound } from "@/lib/sounds";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { getMobileXAxisTicks } from "@/lib/utils";
import { DateField } from "@/components/DateField";
import { 
  Plus, 
  ArrowUpCircle, 
  ArrowDownCircle, 
  Wallet, 
  TrendingUp, 
  History,
  Filter,
  Calendar as CalendarIcon,
  Search,
  Download,
  Pencil,
  Trash2,
  ChevronDown,
  ChevronRight
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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

type TransactionType = "deposit" | "withdrawal" | "operation_out" | "installment_in";

interface UnifiedTransaction {
  id: string;
  type: TransactionType;
  amount: number;
  date: string;
  description: string;
  reference_id?: string;
  balanceAfter?: number;
  created_at?: string;
}

type Period = "total" | "dia" | "semana" | "mes" | "periodo";

const localISO = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const todayISO = () => localISO(new Date());

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

export const AccountCashFlow = () => {
  const [transactions, setTransactions] = useState<UnifiedTransaction[]>([]);
  const [manualTransactions, setManualTransactions] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filters
  const [period, setPeriod] = useState<Period>("total");
  const [fromDate, setFromDate] = useState(todayISO());
  const [toDate, setToDate] = useState(todayISO());
  const [searchTerm, setSearchTerm] = useState("");
  
  // Form State
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formType, setFormType] = useState<"deposit" | "withdrawal">("deposit");
  const [formAmount, setFormAmount] = useState("");
  const [formDate, setFormDate] = useState(todayISO());
  const [formDescription, setFormDescription] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [initialBalance, setInitialBalance] = useState(() => {
    const saved = localStorage.getItem("mykacash_initial_balance");
    return saved ? parseFloat(saved) : 0;
  });
  const [negativeBalanceAlertOpen, setNegativeBalanceAlertOpen] = useState(false);
  const isMobile = useIsMobile();

  const saveInitialBalance = (val: number) => {
    setInitialBalance(val);
    localStorage.setItem("mykacash_initial_balance", val.toString());
    toast.success("Saldo inicial atualizado!");
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [invoicesRes, manualRes] = await Promise.all([
        supabase
          .from("invoices")
          .select("*, clients(name)")
          .order("operation_date", { ascending: false }),
        supabase
          .from("account_transactions")
          .select("*")
          .order("date", { ascending: false })
      ]);

      if (invoicesRes.error) {
        console.error("Error loading invoices:", invoicesRes.error);
        toast.error("Erro ao carregar operações registradas");
      } else {
        setInvoices(invoicesRes.data || []);
      }

      if (manualRes.error) {
        if (manualRes.error.code === 'PGRST116' || manualRes.error.message?.includes('not found')) {
          console.warn("Table 'account_transactions' not found. It might need to be created in Supabase.");
          setManualTransactions([]);
        } else {
          console.error("Error loading manual transactions:", manualRes.error);
        }
      } else {
        setManualTransactions(manualRes.data || []);
      }
    } catch (error: any) {
      console.error("Critical error loading data:", error);
      toast.error("Erro ao carregar dados financeiros");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const unifiedData = useMemo(() => {
    const data: UnifiedTransaction[] = [];

    // 1. Manual Transactions
    manualTransactions.forEach(t => {
      data.push({
        id: t.id,
        type: t.type,
        amount: Number(t.amount),
        date: t.date,
        description: t.description || (t.type === 'deposit' ? 'Depósito Manual' : 'Saque Manual'),
        created_at: t.created_at
      });
    });

    // 2. Operations and Installments
    invoices.forEach(inv => {
      const installments = Array.isArray(inv.installments) ? inv.installments : [];
      
      const calc = calculate({
        invoiceValue: Number(inv.invoice_value) || 0,
        operationDate: inv.operation_date,
        monthlyRate: Number(inv.monthly_rate) || 0,
        installments: installments as Installment[]
      });

      // Saída: Valor Líquido da Operação
      if (inv.operation_date) {
        if (calc.installmentCalcs.length > 0) {
          calc.installmentCalcs.forEach((inst, idx) => {
            const multi = calc.installmentCalcs.length > 1;
            const letter = multi ? String.fromCharCode(96 + (idx + 1)) : "";
            data.push({
              id: `op-out-${inv.id}-${inst.id}`,
              type: "operation_out",
              amount: inst.presentValue,
              date: inv.operation_date,
              description: `REG ${inv.ordem ? `${String(inv.ordem).padStart(4, "0")}${letter}` : "—"} · Saída: ${inv.clients?.name || 'Cliente'} - NF ${inv.invoice_number || 'S/N'}${letter}`,
              reference_id: inv.id,
              created_at: inv.created_at
            });
          });
        } else {
          data.push({
            id: `op-out-${inv.id}`,
            type: "operation_out",
            amount: calc.netValue,
            date: inv.operation_date,
            description: `REG ${inv.ordem ? `${String(inv.ordem).padStart(4, "0")}` : "—"} · Saída: ${inv.clients?.name || 'Cliente'} - NF ${inv.invoice_number || 'S/N'}`,
            reference_id: inv.id,
            created_at: inv.created_at
          });
        }
      }

      // Entradas: Parcelas Liquidadas
      const settledEntries: any[] = Array.isArray(inv.settled_installments) ? inv.settled_installments : [];
      const settledMap = new Map<string, string | null>();
      settledEntries.forEach((e) => {
        const id = typeof e === 'string' ? e : e.id;
        const date = typeof e === 'string' ? null : e.date;
        settledMap.set(id, date);
      });

      calc.installmentCalcs.forEach((inst, idx) => {
        if (settledMap.has(inst.id)) {
          const actualSettledDate = settledMap.get(inst.id) || inst.dueDate;
          const multi = calc.installmentCalcs.length > 1;
          const letter = multi ? String.fromCharCode(96 + (idx + 1)) : "";
          data.push({
            id: `inst-in-${inst.id}`,
            type: "installment_in",
            amount: inst.value,
            date: actualSettledDate, 
            description: `REG ${inv.ordem ? `${String(inv.ordem).padStart(4, "0")}${letter}` : "—"} · Entrada: ${inv.clients?.name || 'Cliente'} - NF ${inv.invoice_number || 'S/N'}${letter}`,
            reference_id: inv.id,
            created_at: inv.created_at // Using invoice created_at as fallback for sorting
          });
        }
      });
    });

    // Entradas (depósitos/parcelas recebidas) sempre antes das saídas no mesmo dia
    const inflowPriority = (t: UnifiedTransaction) =>
      (t.type === "deposit" || t.type === "installment_in") ? 0 : 1;

    // Calculate cumulative balance
    const sortedAsc = [...data].sort((a, b) => {
      const dateCompare = a.date.localeCompare(b.date);
      if (dateCompare !== 0) return dateCompare;
      const flowCompare = inflowPriority(a) - inflowPriority(b);
      if (flowCompare !== 0) return flowCompare;
      const timeCompare = (a.created_at || "").localeCompare(b.created_at || "");
      if (timeCompare !== 0) return timeCompare;
      return a.description.localeCompare(b.description);
    });

    let current = initialBalance;
    const withBalance = sortedAsc.map(t => {
      const delta = (t.type === "deposit" || t.type === "installment_in") ? t.amount : -t.amount;
      current += delta;
      return { ...t, balanceAfter: current };
    });

    return withBalance.sort((a, b) => {
      const dateCompare = b.date.localeCompare(a.date);
      if (dateCompare !== 0) return dateCompare;
      const flowCompare = inflowPriority(b) - inflowPriority(a);
      if (flowCompare !== 0) return flowCompare;
      const timeCompare = (b.created_at || "").localeCompare(a.created_at || "");
      if (timeCompare !== 0) return timeCompare;
      return b.description.localeCompare(a.description);
    });
  }, [manualTransactions, invoices, initialBalance]);


  const filteredData = useMemo(() => {
    let data = unifiedData;
    const today = todayISO();
    if (period === "total") {
      data = data.filter(t => t.date <= today);
    } else {
      let start = fromDate;
      let end = toDate;

      if (period === "dia") {
        start = fromDate;
        end = fromDate;
      } else if (period === "semana") {
        const d = new Date(fromDate + "T00:00:00");
        const day = d.getDay();
        const diff = day === 0 ? -6 : 1 - day;
        d.setDate(d.getDate() + diff);
        start = localISO(d);
        d.setDate(d.getDate() + 6);
        end = localISO(d);
      } else if (period === "mes") {
        const d = new Date(fromDate + "T00:00:00");
        d.setDate(1);
        start = localISO(d);
        const nextMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0);
        end = localISO(nextMonth);
      }
      data = data.filter(t => t.date >= start && t.date <= end);
    }

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase().trim();
      data = data.filter(
        t =>
          t.description.toLowerCase().includes(term) ||
          t.type.toLowerCase().includes(term) ||
          formatBRL(t.amount).toLowerCase().includes(term) ||
          t.date.includes(term)
      );
    }

    return data;
  }, [unifiedData, period, fromDate, toDate, searchTerm]);

  const [collapsedMonths, setCollapsedMonths] = useState<Record<string, boolean>>({});

  const currentMonthKey = useMemo(() => localISO(new Date()).substring(0, 7), []);

  const isMonthOpen = (monthKey: string) => {
    if (collapsedMonths[monthKey] !== undefined) {
      return !collapsedMonths[monthKey];
    }
    return monthKey === currentMonthKey;
  };

  const toggleMonth = (monthKey: string) => {
    setCollapsedMonths(prev => ({
      ...prev,
      [monthKey]: isMonthOpen(monthKey)
    }));
  };

  const groupedByMonth = useMemo(() => {
    const groups: { [key: string]: UnifiedTransaction[] } = {};
    for (const t of filteredData) {
      const key = t.date.substring(0, 7); // "YYYY-MM"
      if (!groups[key]) groups[key] = [];
      groups[key].push(t);
    }
    return Object.keys(groups)
      .sort((a, b) => b.localeCompare(a))
      .map(key => {
        const [year, month] = key.split("-");
        const monthName = MONTHS_PT[parseInt(month, 10) - 1] || month;
        return {
          key,
          label: `${monthName} / ${year}`,
          transactions: groups[key]
        };
      });
  }, [filteredData]);



  const stats = useMemo(() => {

    // Period specific filter range
    let start = "1900-01-01";
    let end = "2100-12-31";
    if (period !== "total") {
      if (period === "dia") {
        start = fromDate;
        end = fromDate;
      } else if (period === "semana") {
        const d = new Date(fromDate + "T00:00:00");
        const day = d.getDay();
        const diff = day === 0 ? -6 : 1 - day;
        d.setDate(d.getDate() + diff);
        start = localISO(d);
        d.setDate(d.getDate() + 6);
        end = localISO(d);
      } else if (period === "mes") {
        const d = new Date(fromDate + "T00:00:00");
        d.setDate(1);
        start = localISO(d);
        const nextMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0);
        end = localISO(nextMonth);
      } else if (period === "periodo") {
        start = fromDate;
        end = toDate;
      }
    }

    const periodDeposits = filteredData.reduce((acc, t) => {
      if (t.type === "deposit") return acc + t.amount;
      return acc;
    }, 0);

    const periodWithdrawals = filteredData.reduce((acc, t) => {
      if (t.type === "withdrawal") return acc + t.amount;
      return acc;
    }, 0);

    const periodBalance = filteredData.reduce((acc, t) => {
      if (t.type === "deposit" || t.type === "installment_in") return acc + t.amount;
      return acc - t.amount;
    }, 0);

    let periodProfit = 0;
    let periodOpen = 0;

    invoices.forEach(inv => {
      const installments = Array.isArray(inv.installments) ? inv.installments : [];
      const calc = calculate({
        invoiceValue: Number(inv.invoice_value) || 0,
        operationDate: inv.operation_date,
        monthlyRate: Number(inv.monthly_rate) || 0,
        installments: installments as Installment[]
      });

      // Profit for operations started in period
      if (inv.operation_date >= start && inv.operation_date <= end) {
        periodProfit += calc.operationCost;
      }

      // Open installments due in period
      const settledEntries = Array.isArray(inv.settled_installments) ? inv.settled_installments : [];
      const settledIds = new Set(settledEntries.map((e: any) => typeof e === 'string' ? e : e.id));

      calc.installmentCalcs.forEach(inst => {
        if (inst.dueDate >= start && inst.dueDate <= end && !settledIds.has(inst.id)) {
          periodOpen += inst.value;
        }
      });
    });

    const today = todayISO();
    const cumulativeBalance = unifiedData.reduce((acc, t) => {
      if (t.date <= today) {
        if (t.type === "deposit" || t.type === "installment_in") return acc + t.amount;
        return acc - t.amount;
      }
      return acc;
    }, 0);

    return {
      cumulativeBalance,
      periodDeposits,
      periodWithdrawals,
      periodProfit,
      periodOpen
    };
  }, [unifiedData, filteredData, invoices, period, fromDate, toDate, initialBalance]);

  // Update cumulativeBalance to include initialBalance
  const statsWithInitial = useMemo(() => {
    return {
      ...stats,
      cumulativeBalance: stats.cumulativeBalance + initialBalance
    };
  }, [stats, initialBalance]);

  useEffect(() => {
    if (loading) return;
    const currentBalance = statsWithInitial.cumulativeBalance;
    if (currentBalance < 0) {
      const lastBal = sessionStorage.getItem("mykacash_last_balance");
      const currentBalStr = String(currentBalance);
      if (lastBal !== currentBalStr) {
        sessionStorage.setItem("mykacash_last_balance", currentBalStr);
        setNegativeBalanceAlertOpen(true);
        playSound("overdue");
      }
    }
  }, [loading, statsWithInitial.cumulativeBalance]);

  const chartData = useMemo(() => {
    if (unifiedData.length === 0) return [];

    const today = todayISO();
    const visibleTransactions = period === "total"
      ? unifiedData.filter((t) => t.date <= today)
      : unifiedData;

    if (visibleTransactions.length === 0) return [];

    const sortedAll = [...visibleTransactions].sort((a, b) => a.date.localeCompare(b.date));
    const firstDate = sortedAll[0].date;
    
    // Create baseline point (0 balance) one day before the first record
    const d = new Date(firstDate + "T00:00:00");
    d.setDate(d.getDate() - 1);
    const baselineDate = localISO(d);

    let current = 0;
    const dailyBalances: Record<string, number> = {
      [baselineDate]: 0
    };

    sortedAll.forEach(t => {
      const delta = (t.type === "deposit" || t.type === "installment_in") ? t.amount : -t.amount;
      current += delta;
      dailyBalances[t.date] = current;
    });

    // Ensure today is included in the balance map
    const sortedDates = Object.keys(dailyBalances).sort();
    if (sortedDates.length > 0) {
      const lastDate = sortedDates[sortedDates.length - 1];
      // If the last transaction was before today, carry the balance to today
      if (lastDate < today) {
        dailyBalances[today] = dailyBalances[lastDate];
      }
    } else {
      // If no transactions at all, today is 0
      dailyBalances[today] = 0;
    }

    // Filter by selected range, capped by today
    let start = fromDate;
    let end = today; // Default end to today as per request "até o dia de hoje"

    if (period === "total") {
      start = baselineDate;
      end = today;
    } else if (period === "dia") {
      start = fromDate;
      end = fromDate;
    } else if (period === "semana") {
      const d = new Date(fromDate + "T00:00:00");
      const day = d.getDay();
      const diff = day === 0 ? -6 : 1 - day;
      d.setDate(d.getDate() + diff);
      start = localISO(d);
      
      const lastDay = new Date(d);
      lastDay.setDate(lastDay.getDate() + 6);
      const weekEnd = localISO(lastDay);
      end = weekEnd < today ? weekEnd : today; // Cap at today
    } else if (period === "mes") {
      const d = new Date(fromDate + "T00:00:00");
      d.setDate(1);
      start = localISO(d);
      
      const nextMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      const monthEnd = localISO(nextMonth);
      end = monthEnd < today ? monthEnd : today; // Cap at today
    } else if (period === "periodo") {
      end = toDate < today ? toDate : today; // Cap at today
    }

    const result: any[] = [];
    Object.keys(dailyBalances)
      .sort()
      .forEach(date => {
        if (date >= start && date <= end) {
          result.push({
            date: new Date(date + "T00:00:00").toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
            balance: dailyBalances[date],
            rawDate: date
          });
        }
      });

    return result;
  }, [unifiedData, period, fromDate, toDate]);

  // Gradient offset for positive/negative colors
  const gradientOffset = useMemo(() => {
    const dataMax = Math.max(...chartData.map((i) => i.balance));
    const dataMin = Math.min(...chartData.map((i) => i.balance));

    if (dataMax <= 0) return 0;
    if (dataMin >= 0) return 1;

    return dataMax / (dataMax - dataMin);
  }, [chartData]);

  const handleSaveTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const payload = {
        type: formType,
        amount: parseFloat(formAmount),
        date: formDate,
        description: formDescription,
        created_by: (await supabase.auth.getUser()).data.user?.id
      };

      let error;
      if (editingId) {
        const res = await supabase.from("account_transactions").update(payload).eq("id", editingId);
        error = res.error;
      } else {
        const res = await supabase.from("account_transactions").insert(payload);
        error = res.error;
      }

      if (error) throw error;

      toast.success(editingId ? "Movimentação atualizada!" : "Movimentação registrada!");
      setIsDialogOpen(false);
      setEditingId(null);
      setFormAmount("");
      setFormDescription("");
      loadData();
    } catch (error: any) {
      toast.error("Erro ao salvar movimentação: " + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const reportRef = useRef<HTMLDivElement>(null);

  const handleExport = async () => {
    if (filteredData.length === 0) {
      toast.error("Não há dados para exportar no período selecionado.");
      return;
    }

    const node = reportRef.current;
    if (!node) return;

    toast.info("Preparando documento para impressão...");

    // Create a new window for printing
    const printWindow = window.open('', '_blank', 'width=1200,height=800');
    if (!printWindow) {
      toast.error("Por favor, permita pop-ups para exportar o PDF.");
      return;
    }

    const htmlContent = `
      <html>
        <head>
          <title>Relatório Financeiro - MYKACA$H</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
            @page {
              size: A4;
              margin: 20mm;
            }
            body {
              font-family: 'Inter', sans-serif;
              background: white;
              color: black;
              margin: 0;
              padding: 0;
            }
            .container {
              width: 100%;
            }
            .header {
              text-align: center;
              border-bottom: 2px solid #e2e8f0;
              padding-bottom: 20px;
              margin-bottom: 30px;
            }
            .header-small {
              font-size: 10px;
              letter-spacing: 0.3em;
              color: #64748b;
              font-weight: bold;
              margin-bottom: 5px;
            }
            .header-title {
              font-size: 24px;
              font-weight: bold;
              margin: 10px 0;
            }
            .header-meta {
              font-size: 10px;
              color: #94a3b8;
              letter-spacing: 0.1em;
            }
            .stats-grid {
              display: grid;
              grid-template-columns: repeat(3, 1fr);
              gap: 20px;
              margin-bottom: 40px;
            }
            .stat-card {
              border: 1px solid #e2e8f0;
              border-radius: 12px;
              padding: 15px;
              text-align: center;
            }
            .stat-label {
              font-size: 9px;
              color: #64748b;
              text-transform: uppercase;
              letter-spacing: 0.1em;
              margin-bottom: 5px;
            }
            .stat-value {
              font-size: 16px;
              font-weight: bold;
            }
            .table-container {
              width: 100%;
              border-collapse: collapse;
              margin-top: 20px;
            }
            .table-container th {
              background: #f8fafc;
              border-bottom: 2px solid #e2e8f0;
              padding: 12px;
              font-size: 10px;
              text-transform: uppercase;
              letter-spacing: 0.1em;
              color: #475569;
            }
            .table-container td {
              border-bottom: 1px solid #f1f5f9;
              padding: 12px;
              font-size: 11px;
              text-align: center;
            }
            .type-badge {
              font-weight: bold;
              font-size: 9px;
              text-transform: uppercase;
            }
            .text-green { color: #16a34a; }
            .text-red { color: #dc2626; }
            .footer {
              margin-top: 50px;
              padding-top: 20px;
              border-top: 1px solid #e2e8f0;
              text-align: center;
              font-size: 9px;
              color: #94a3b8;
              letter-spacing: 0.2em;
            }
            .page-break {
              page-break-before: always;
            }
            tr {
              page-break-inside: avoid;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="header-small">MYKACA$H · SISTEMA FINANCEIRO</div>
              <div class="header-title">RELATÓRIO DE MOVIMENTAÇÕES</div>
              <div class="header-meta">
                PERÍODO: ${period.toUpperCase()} | GERADO EM: ${new Date().toLocaleDateString('pt-BR')}
              </div>
            </div>

            <div class="stats-grid">
              <div class="stat-card">
                <div class="stat-label">Total Entradas</div>
                <div class="stat-value text-green">${formatBRL(stats.periodDeposits)}</div>
              </div>
              <div class="stat-card">
                <div class="stat-label">Total Saídas</div>
                <div class="stat-value text-red">${formatBRL(stats.periodWithdrawals)}</div>
              </div>
              <div class="stat-card">
                <div class="stat-label">Saldo Final</div>
                <div class="stat-value">${formatBRL(stats.cumulativeBalance)}</div>
              </div>
            </div>

            <h4 style="font-size: 14px; margin-bottom: 10px;">Detalhamento das Operações</h4>
            <table class="table-container">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Descrição</th>
                  <th>Tipo</th>
                  <th>Valor</th>
                  <th>Saldo</th>
                </tr>
              </thead>
              <tbody>
                ${filteredData.map(t => `
                  <tr>
                    <td>${new Date(t.date + "T00:00:00").toLocaleDateString('pt-BR')}</td>
                    <td style="text-align: left;">${t.description}</td>
                    <td>
                      <span class="type-badge ${ (t.type === 'deposit' || t.type === 'installment_in') ? 'text-green' : 'text-red' }">
                        ${t.type === 'deposit' ? 'Depósito' : t.type === 'withdrawal' ? 'Saque' : t.type === 'installment_in' ? 'Entrada' : 'Saída'}
                      </span>
                    </td>
                    <td class="stat-value ${ (t.type === 'deposit' || t.type === 'installment_in') ? 'text-green' : 'text-red' }">
                      ${(t.type === 'deposit' || t.type === 'installment_in') ? '+' : '-'} ${formatBRL(t.amount)}
                    </td>
                    <td class="stat-value" style="color: ${ (t.balanceAfter || 0) >= 0 ? '#16a34a' : '#dc2626' }">
                      ${formatBRL(t.balanceAfter || 0)}
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>

            <div class="footer">
              DOCUMENTO GERADO PELO SISTEMA MYKACA$H · ${new Date().getFullYear()}
            </div>
          </div>
          <script>
            window.onload = function() {
              window.print();
              // Optionally close window after print
              // window.onafterprint = function() { window.close(); };
            };
          </script>
        </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
    toast.success("Documento pronto para exportação!");
  };

  const handleDeleteTransaction = async (id: string) => {
    try {
      const { error } = await supabase.from("account_transactions").delete().eq("id", id);
      if (error) throw error;
      toast.success("Movimentação excluída!");
      loadData();
    } catch (error: any) {
      toast.error("Erro ao excluir movimentação: " + error.message);
    }
  };

  const openEdit = (t: UnifiedTransaction) => {
    if (t.type !== 'deposit' && t.type !== 'withdrawal') return;
    setEditingId(t.id);
    setFormType(t.type as any);
    setFormAmount(t.amount.toString());
    setFormDate(t.date);
    setFormDescription(t.description);
    setIsDialogOpen(true);
  };

  const monthBoundaries = useMemo(() => {
    const boundaries: string[] = [];
    if (chartData.length > 0) {
      for (let i = 1; i < chartData.length; i++) {
        const prevM = chartData[i - 1].rawDate.substring(0, 7);
        const currM = chartData[i].rawDate.substring(0, 7);
        if (prevM !== currM) {
          boundaries.push(chartData[i].rawDate);
        }
      }
    }
    return boundaries;
  }, [chartData]);

  const mobileTicks = useMemo(() => {
    if (!isMobile || chartData.length === 0) return undefined;
    return getMobileXAxisTicks(chartData.map((d) => d.rawDate));
  }, [isMobile, chartData]);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Stats Cards */}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 animate-fade-up">
        <div className="relative group overflow-hidden rounded-2xl border border-net-green/20 bg-gradient-to-br from-card to-card/50 p-6 shadow-[0_0_20px_-5px_hsl(var(--net-green)/0.3)] transition-all hover:shadow-[0_0_40px_-2px_hsl(var(--net-green)/0.6)]">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <ArrowUpCircle className="h-12 w-12 text-net-green" />
          </div>
          <p className="text-xs font-mono tracking-widest text-muted-foreground uppercase">Valor Depositado</p>
          <h3 className="text-2xl font-bold mt-2 text-net-green">
            {loading ? <span className="opacity-40">—</span> : formatBRL(stats.periodDeposits)}
          </h3>
        </div>

        <div className="relative group overflow-hidden rounded-2xl border border-cost-red/20 bg-gradient-to-br from-card to-card/50 p-6 shadow-[0_0_20px_-5px_hsl(var(--cost-red)/0.3)] transition-all hover:shadow-[0_0_40px_-2px_hsl(var(--cost-red)/0.6)]">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <ArrowDownCircle className="h-12 w-12 text-cost-red" />
          </div>
          <p className="text-xs font-mono tracking-widest text-muted-foreground uppercase">Valor Sacado</p>
          <h3 className="text-2xl font-bold mt-2 text-cost-red">
            {loading ? <span className="opacity-40">—</span> : formatBRL(stats.periodWithdrawals)}
          </h3>
        </div>

        <div className="relative group overflow-hidden rounded-2xl border border-factoring-amber/20 bg-gradient-to-br from-card to-card/50 p-6 shadow-[0_0_20px_-5px_hsl(var(--factoring-amber)/0.3)] transition-all hover:shadow-[0_0_40px_-2px_hsl(var(--factoring-amber)/0.6)]">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <History className="h-12 w-12 text-factoring-amber" />
          </div>
          <p className="text-xs font-mono tracking-widest text-muted-foreground uppercase">Saldo Aberto</p>
          <h3 className="text-2xl font-bold mt-2 text-factoring-amber">
            {loading ? <span className="opacity-40">—</span> : formatBRL(stats.periodOpen)}
          </h3>
        </div>

        <div className="relative group overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-card to-card/50 p-6 shadow-[0_0_20px_-5px_hsl(var(--primary)/0.3)] transition-all hover:shadow-[0_0_40px_-2px_hsl(var(--primary)/0.6)]">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <TrendingUp className="h-12 w-12 text-primary" />
          </div>
          <p className="text-xs font-mono tracking-widest text-muted-foreground uppercase">Ganho Total</p>
          <h3 className="text-2xl font-bold mt-2 text-primary">
            {loading ? <span className="opacity-40">—</span> : formatBRL(stats.periodProfit)}
          </h3>
        </div>

        <div className={`relative group overflow-hidden rounded-2xl border bg-gradient-to-br from-card to-card/50 p-6 transition-all ${
          loading
            ? 'border-border/30'
            : 'border-net-green/20 shadow-[0_0_20px_-5px_hsl(var(--net-green)/0.3)] hover:shadow-[0_0_40px_-2px_hsl(var(--net-green)/0.6)]'
        }`}>
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <Wallet className={`h-12 w-12 ${loading ? 'text-muted-foreground' : 'text-net-green'}`} />
          </div>
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-mono tracking-widest text-muted-foreground uppercase">Saldo em conta</p>
              <h3 className={`text-2xl font-bold mt-2 ${loading ? 'text-muted-foreground' : 'text-net-green'}`}>
                {loading ? <span className="opacity-40">—</span> : formatBRL(statsWithInitial.cumulativeBalance)}
              </h3>
            </div>
          </div>
        </div>

      </div>

      {/* Chart Section */}
      <section className="rounded-2xl border border-border/40 bg-card/30 backdrop-blur-sm p-6 shadow-panel">
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
          <div className="flex items-center gap-3">
            <span className="h-2 w-2 rounded-full animate-color-cycle" />
            <h4 className="font-mono text-sm sm:text-base md:text-lg tracking-[0.2em] font-bold uppercase">Evolução do Saldo</h4>
          </div>

          {/* Filters Bar */}
          <div className="flex flex-wrap md:flex-nowrap items-center justify-end gap-2">
            <Select value={period} onValueChange={(v: any) => setPeriod(v)}>
              <SelectTrigger className="w-[140px] h-9 bg-background/50 border-border/40">
                <SelectValue placeholder="Período" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="total">Total</SelectItem>
                <SelectItem value="dia">Dia</SelectItem>
                <SelectItem value="semana">Semana</SelectItem>
                <SelectItem value="mes">Mês</SelectItem>
                <SelectItem value="periodo">Intervalo</SelectItem>
              </SelectContent>
            </Select>

            {period === 'dia' && (
              <DateField 
                className="h-9 w-[130px] [&>input]:bg-background/50 [&>input]:border-border/40 [&>input]:h-9 text-xs" 
                value={fromDate}
                onChange={setFromDate}
              />
            )}
            
            {period === 'periodo' && (
              <div className="flex items-center gap-2">
                <DateField 
                  className="h-9 w-[130px] [&>input]:bg-background/50 [&>input]:border-border/40 [&>input]:h-9 text-xs" 
                  value={fromDate}
                  onChange={setFromDate}
                />
                <span className="text-muted-foreground text-[10px] font-mono shrink-0">ATÉ</span>
                <DateField 
                  className="h-9 w-[130px] [&>input]:bg-background/50 [&>input]:border-border/40 [&>input]:h-9 text-xs" 
                  value={toDate}
                  onChange={setToDate}
                />
              </div>
            )}
          </div>
        </div>

        <div className="h-[300px] w-full">
          {chartData.length > 0 && (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="splitColor" x1="0" y1="0" x2="0" y2="1">
                  <stop offset={gradientOffset} stopColor="hsl(var(--net-green))" stopOpacity={0.3} />
                  <stop offset={gradientOffset} stopColor="hsl(var(--cost-red))" stopOpacity={0.3} />
                </linearGradient>
                <linearGradient id="strokeColor" x1="0" y1="0" x2="0" y2="1">
                  <stop offset={gradientOffset} stopColor="hsl(var(--net-green))" stopOpacity={1} />
                  <stop offset={gradientOffset} stopColor="hsl(var(--cost-red))" stopOpacity={1} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="4 4" stroke="hsl(var(--muted-foreground))" opacity={0.4} vertical={true} horizontal={true} />
              <XAxis 
                dataKey="rawDate" 
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                dy={10}
                interval={0}
                ticks={mobileTicks}
                tickFormatter={(val) => {
                  const parts = val.split("-");
                  if (parts.length === 3) return parts[2];
                  return val;
                }}
              />
              <YAxis 
                yAxisId="left"
                width={60}
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                tickFormatter={(v) => `R$${Math.abs(v) >= 1000 ? (v/1000).toFixed(0) + 'K' : v}`}
              />
              <YAxis 
                yAxisId="right"
                orientation="right"
                width={60}
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                tickFormatter={(v) => `R$${Math.abs(v) >= 1000 ? (v/1000).toFixed(0) + 'K' : v}`}
              />
              <Tooltip 
                cursor={false}
                contentStyle={{ 
                  backgroundColor: 'hsl(var(--background))', 
                  borderColor: 'hsl(var(--border)/0.5)',
                  borderRadius: '12px',
                  boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                  fontSize: '13px'
                }}
                labelFormatter={(value, payload) => {
                  if (payload && payload.length > 0) {
                    const rawDate = payload[0].payload.rawDate;
                    const d = new Date(rawDate + "T00:00:00");
                    const day = d.getDate();
                    const month = d.toLocaleDateString('pt-BR', { month: 'long' });
                    const weekday = d.toLocaleDateString('pt-BR', { weekday: 'long' }).toUpperCase().split('-')[0];
                    return `Data: ${day} de ${month} - ${weekday}`;
                  }
                  return value;
                }}
                formatter={(value: number) => [formatBRL(value), 'Saldo']}
              />
              
              {monthBoundaries.map((date) => (
                <ReferenceLine
                  key={date}
                  x={date}
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
                dataKey="balance" 
                stroke="url(#strokeColor)" 
                strokeWidth={3}
                fillOpacity={1} 
                fill="url(#splitColor)" 
                isAnimationActive={true}
                animationDuration={900}
                animationEasing="ease-out"
              />
              <Area 
                yAxisId="right"
                type="monotone" 
                dataKey="balance" 
                stroke="transparent" 
                fill="transparent" 
                isAnimationActive={true}
                animationDuration={900}
                animationEasing="ease-out"
              />
            </AreaChart>
          </ResponsiveContainer>
          )}
        </div>


        {chartData.length > 0 && (() => {
          const monthSegs: { key: string; label: string; count: number }[] = [];
          for (const p of chartData) {
            const [y, m] = p.rawDate.split("-");
            const key = `${y}-${m}`;
            const label = MONTHS_PT[parseInt(m, 10) - 1] || m;
            const last = monthSegs[monthSegs.length - 1];
            if (last && last.key === key) last.count += 1;
            else monthSegs.push({ key, label, count: 1 });
          }
          const total = chartData.length;
          // Agrupa anos consecutivos
          const yearSegs: { year: string; count: number }[] = [];
          for (const p of chartData) {
            const y = p.rawDate.substring(0, 4);
            const last = yearSegs[yearSegs.length - 1];
            if (last && last.year === y) last.count += 1;
            else yearSegs.push({ year: y, count: 1 });
          }

          return (
            <>
              <div className="mt-4 flex bg-muted/20 rounded-sm" style={{ marginLeft: 60, marginRight: 60 }}>
                {monthSegs.map((s, i) => (
                  <div
                    key={i}
                    className="text-center font-mono text-[9px] tracking-[0.2em] text-muted-foreground/70 py-1 overflow-hidden whitespace-nowrap border-x border-border/10 first:border-l-0 last:border-r-0"
                    style={{ flex: s.count / total }}
                  >
                    {s.label}
                  </div>
                ))}
              </div>
              <div className="mt-1 flex" style={{ marginLeft: 60, marginRight: 60 }}>
                {yearSegs.map((s, i) => (
                  <div
                    key={i}
                    className="text-center font-mono text-[10px] tracking-[0.25em] text-muted-foreground/50"
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

      {/* Transactions Table */}
      <section className="rounded-2xl border border-border/40 bg-card/30 backdrop-blur-sm overflow-hidden shadow-panel">
        <div className="p-4 md:p-6 border-b border-border/40 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="h-2 w-2 rounded-full animate-color-cycle" />
            <h4 className="font-mono text-sm sm:text-base md:text-lg tracking-[0.2em] font-bold uppercase">Histórico de Movimentações</h4>
          </div>
          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            {/* Search Input */}
            <div className="relative flex-1 md:w-64">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Buscar movimentações..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 h-9 bg-background/50 border-border/40 font-mono text-[11px]"
              />
            </div>

            <Dialog open={isDialogOpen} onOpenChange={(open) => {
              setIsDialogOpen(open);
              if (!open) {
                setEditingId(null);
                setFormAmount("");
                setFormDescription("");
              }
            }}>
              <DialogTrigger asChild>
                <Button className="flex-1 md:flex-none rounded-full px-3 md:px-6 h-9 font-mono text-[10px] md:text-[11px] tracking-[0.2em] md:tracking-[0.3em] animate-color-cycle text-primary-foreground transition-all gap-2 border-0 whitespace-nowrap">
                  <Plus className="h-3.5 w-3.5" /> <span className="hidden sm:inline">NOVA MOVIMENTAÇÃO</span><span className="sm:hidden">NOVA</span>
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[425px] bg-background/95 backdrop-blur-xl border-border/50">
                <DialogHeader>
                  <DialogTitle className="font-display">
                    {editingId ? "Editar Movimentação" : "Registrar Movimentação"}
                  </DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSaveTransaction} className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Tipo</Label>
                    <div className="flex gap-2">
                      <Button 
                        type="button"
                        variant={formType === 'deposit' ? 'default' : 'outline'}
                        className={`flex-1 gap-2 transition-all hover:text-white ${
                          formType === 'deposit' 
                            ? 'bg-net-green hover:bg-net-green/90 text-white' 
                            : 'hover:bg-net-green/80 hover:text-white hover:border-net-green'
                        }`}
                        onClick={() => setFormType('deposit')}
                      >
                        <ArrowUpCircle className="h-4 w-4" /> Depósito
                      </Button>
                      <Button 
                        type="button"
                        variant={formType === 'withdrawal' ? 'default' : 'outline'}
                        className={`flex-1 gap-2 transition-all hover:text-white ${
                          formType === 'withdrawal' 
                            ? 'bg-cost-red hover:bg-cost-red/90 text-white' 
                            : 'hover:bg-cost-red/80 hover:text-white hover:border-cost-red'
                        }`}
                        onClick={() => setFormType('withdrawal')}
                      >
                        <ArrowDownCircle className="h-4 w-4" /> Saque
                      </Button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="amount">Valor (R$)</Label>
                      <div className="relative">
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm text-muted-foreground">
                          R$
                        </span>
                        <Input 
                          id="amount" 
                          inputMode="numeric"
                          value={(() => {
                            const n = parseFloat(formAmount || "0");
                            return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                          })()} 
                          onChange={e => {
                            const digits = e.target.value.replace(/\D/g, "");
                            const n = digits ? parseInt(digits, 10) / 100 : 0;
                            setFormAmount(n.toString());
                          }} 
                          placeholder="0,00"
                          className="pl-10 font-mono"
                          required
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="date">Data</Label>
                      <DateField 
                        value={formDate} 
                        onChange={setFormDate} 
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="desc">Descrição</Label>
                    <Input 
                      id="desc" 
                      value={formDescription} 
                      onChange={e => setFormDescription(e.target.value)} 
                      placeholder="Ex: Reforço de caixa"
                    />
                  </div>
                  <DialogFooter className="pt-4">
                    <Button 
                      type="submit" 
                      disabled={isSubmitting} 
                      className={`w-full font-display tracking-wide shadow-lg transition-all ${
                        formType === 'deposit' 
                          ? 'bg-net-green hover:bg-net-green/90 shadow-net-green/20' 
                          : 'bg-cost-red hover:bg-cost-red/90 shadow-cost-red/20'
                      }`}
                    >
                      {isSubmitting ? "Salvando..." : (
                        editingId ? "Salvar Alterações" : (formType === 'deposit' ? "Confirmar Depósito" : "Confirmar Saque")
                      )}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
            <Button 
              className="flex-1 md:flex-none rounded-full px-3 md:px-6 h-9 font-mono text-[10px] md:text-[11px] tracking-[0.2em] md:tracking-[0.3em] bg-muted/50 text-muted-foreground shadow-[0_0_20px_rgba(0,0,0,0.2)] hover:bg-muted/80 hover:text-foreground transition-all gap-2 border border-border/40 whitespace-nowrap"
              onClick={handleExport}
            >
              <Download className="h-3.5 w-3.5" /> EXPORTAR
            </Button>

          </div>
        </div>

        {/* Divided by Month */}
        {groupedByMonth.length === 0 ? (
          <div className="h-32 flex items-center justify-center text-muted-foreground font-mono text-xs">
            Nenhuma movimentação encontrada para o período selecionado.
          </div>
        ) : (
          <div className="divide-y divide-border/20">
            {groupedByMonth.map((month) => {
              const isOpen = isMonthOpen(month.key);
              const balance = month.transactions[0]?.balanceAfter ?? 0;
              
              return (
                <div key={month.key} className="flex flex-col">
                  {/* Month Header Section */}
                  <button
                    onClick={() => toggleMonth(month.key)}
                    className={cn(
                      "w-full flex items-center justify-between p-4 bg-muted/5 hover:bg-muted/10 transition-all text-left select-none group",
                      isOpen && "border-b border-border/10"
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
                      <span className="font-mono text-xs md:text-sm font-bold tracking-wider uppercase text-foreground">
                        {month.label}
                      </span>
                      <span className="text-[9px] md:text-[10px] text-muted-foreground font-mono bg-muted/30 border border-border/20 px-2 py-0.5 rounded-full shrink-0">
                        {month.transactions.length} {month.transactions.length === 1 ? "lançamento" : "lançamentos"}
                      </span>
                    </div>
                    
                    <div className="font-mono text-[10px] md:text-xs flex gap-4 items-center">
                      <span className="text-muted-foreground">
                        Saldo do mês:{" "}
                        <span className={cn(
                          "font-bold",
                          balance >= 0 ? "text-net-green" : "text-cost-red"
                        )}>
                          {formatBRL(balance)}
                        </span>
                      </span>
                    </div>
                  </button>

                  {/* Month Transactions List */}
                  {isOpen && (
                    <div className="animate-fade-in">
                      {/* Mobile: condensed card list */}
                      <div className="md:hidden divide-y divide-border/20">
                        {month.transactions.map((t) => {
                          const isIn = t.type === 'deposit' || t.type === 'installment_in';
                          const bg =
                            t.type === 'deposit' ? 'bg-[#bef264]/5' :
                            t.type === 'withdrawal' ? 'bg-[#f472b6]/5' :
                            t.type === 'installment_in' ? 'bg-net-green/5' :
                            'bg-cost-red/5';
                          const amountColor = isIn ? 'text-net-green' : 'text-cost-red';
                          const balanceColor = (t.balanceAfter || 0) >= 0 ? 'text-net-green' : 'text-cost-red';
                          const dateStr = new Date(t.date + "T00:00:00").toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
                          return (
                            <div key={t.id} className={cn("px-3 py-2", bg)}>
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                  {isIn
                                    ? <ArrowUpCircle className={`h-4 w-4 shrink-0 ${amountColor}`} />
                                    : <ArrowDownCircle className={`h-4 w-4 shrink-0 ${amountColor}`} />}
                                  <span className="font-mono text-xs text-muted-foreground shrink-0">{dateStr}</span>
                                  <span className="font-mono text-sm font-semibold truncate">{t.description}</span>
                                </div>
                                {(t.type === 'deposit' || t.type === 'withdrawal') && (
                                  <div className="flex items-center shrink-0 -mr-1">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-6 w-6 text-muted-foreground"
                                      onClick={() => openEdit(t)}
                                    >
                                      <Pencil className="h-3 w-3" />
                                    </Button>
                                    <AlertDialog>
                                      <AlertDialogTrigger asChild>
                                        <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-cost-red">
                                          <Trash2 className="h-3 w-3" />
                                        </Button>
                                      </AlertDialogTrigger>
                                      <AlertDialogContent>
                                        <AlertDialogHeader>
                                          <AlertDialogTitle>Excluir movimentação?</AlertDialogTitle>
                                          <AlertDialogDescription>
                                            Esta ação não pode ser desfeita. O lançamento "{t.description}" no valor de {formatBRL(t.amount)} será removido permanentemente.
                                          </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                          <AlertDialogAction className="bg-cost-red hover:bg-cost-red/90" onClick={() => handleDeleteTransaction(t.id)}>
                                            Excluir
                                          </AlertDialogAction>
                                        </AlertDialogFooter>
                                      </AlertDialogContent>
                                    </AlertDialog>
                                  </div>
                                )}
                              </div>
                              <div className="mt-1 flex items-center justify-between gap-2 pl-6">
                                <span className={`font-mono text-xs font-bold ${amountColor}`}>
                                  {isIn ? '+' : '-'} {formatBRL(t.amount)}
                                </span>
                                <span className={`font-mono text-xs ${balanceColor}`}>
                                  Saldo {formatBRL(t.balanceAfter || 0)}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Desktop: Table */}
                      <div className="hidden md:block overflow-x-auto">
                        <Table className="text-xs lg:text-sm">
                          <TableHeader className="bg-muted/30">
                            <TableRow className="hover:bg-transparent border-border/40">
                              <TableHead className="text-center tracking-widest uppercase font-mono py-2 text-xs lg:text-sm">Data</TableHead>
                              <TableHead className="text-center tracking-widest uppercase font-mono py-2 text-xs lg:text-sm">Descrição</TableHead>
                              <TableHead className="text-center tracking-widest uppercase font-mono py-2 text-xs lg:text-sm">Tipo</TableHead>
                              <TableHead className="text-center tracking-widest uppercase font-mono py-2 text-xs lg:text-sm">Valor</TableHead>
                              <TableHead className="text-center tracking-widest uppercase font-mono py-2 text-xs lg:text-sm">Saldo</TableHead>
                              <TableHead className="text-center w-[50px] py-2"></TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {month.transactions.map((t) => (
                              <TableRow 
                                key={t.id} 
                                className={cn(
                                  "border-border/20 transition-colors group",
                                  t.type === 'deposit' ? 'bg-[#bef264]/5 hover:bg-[#bef264]/10' :
                                  t.type === 'withdrawal' ? 'bg-[#f472b6]/5 hover:bg-[#f472b6]/10' :
                                  t.type === 'installment_in' ? 'bg-net-green/5 hover:bg-net-green/10' :
                                  'bg-cost-red/5 hover:bg-cost-red/10'
                                )}
                              >
                                <TableCell className="text-center font-mono py-2">
                                  {new Date(t.date + "T00:00:00").toLocaleDateString('pt-BR')}
                                </TableCell>
                                <TableCell className="text-center font-mono font-medium py-2">
                                  {t.description}
                                </TableCell>
                                <TableCell className="text-center py-2">
                                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold tracking-tight uppercase ${
                                    t.type === 'deposit' ? 'bg-[#bef264]/10 text-[#bef264] border border-[#bef264]/20' :
                                    t.type === 'withdrawal' ? 'bg-[#f472b6]/10 text-[#f472b6] border border-[#f472b6]/20' :
                                    t.type === 'installment_in' ? 'bg-net-green/10 text-net-green border border-net-green/20' :
                                    'bg-cost-red/10 text-cost-red border border-cost-red/20'
                                  }`}>
                                    {t.type === 'deposit' && <><ArrowUpCircle className="h-3 w-3" /> Depósito</>}
                                    {t.type === 'withdrawal' && <><ArrowDownCircle className="h-3 w-3" /> Saque</>}
                                    {t.type === 'installment_in' && <><ArrowUpCircle className="h-3 w-3" /> Entrada</>}
                                    {t.type === 'operation_out' && <><ArrowDownCircle className="h-3 w-3" /> Saída</>}
                                  </span>
                                </TableCell>
                                <TableCell className={`text-center font-mono font-bold py-2 ${
                                  (t.type === 'deposit' || t.type === 'installment_in') ? 'text-net-green' : 'text-cost-red'
                                }`}>
                                  {(t.type === 'deposit' || t.type === 'installment_in') ? '+' : '-'} {formatBRL(t.amount)}
                                </TableCell>
                                <TableCell className={`text-center font-mono font-bold py-2 ${
                                  (t.balanceAfter || 0) >= 0 ? 'text-net-green' : 'text-cost-red'
                                }`}>
                                  {formatBRL(t.balanceAfter || 0)}
                                </TableCell>
                                <TableCell className="text-center">
                                  {(t.type === 'deposit' || t.type === 'withdrawal') && (
                                    <div className="flex items-center justify-center gap-1">
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className={`h-8 w-8 transition-colors ${
                                          t.type === 'deposit' 
                                            ? 'text-blue-400 hover:text-blue-300' 
                                            : 'text-muted-foreground hover:text-primary'
                                        }`}
                                        onClick={() => openEdit(t)}
                                        title="Editar lançamento manual"
                                      >
                                        <Pencil className="h-3.5 w-3.5" />
                                      </Button>
                                      <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8 text-muted-foreground hover:text-cost-red transition-colors"
                                            title="Excluir lançamento manual"
                                          >
                                            <Trash2 className="h-3.5 w-3.5" />
                                          </Button>
                                        </AlertDialogTrigger>
                                        <AlertDialogContent>
                                          <AlertDialogHeader>
                                            <AlertDialogTitle>Excluir movimentação?</AlertDialogTitle>
                                            <AlertDialogDescription>
                                              Esta ação não pode ser desfeita. O lançamento "{t.description}" no valor de {formatBRL(t.amount)} será removido permanentemente.
                                            </AlertDialogDescription>
                                          </AlertDialogHeader>
                                          <AlertDialogFooter>
                                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                            <AlertDialogAction
                                              className="bg-cost-red hover:bg-cost-red/90"
                                              onClick={() => handleDeleteTransaction(t.id)}
                                            >
                                              Excluir
                                            </AlertDialogAction>
                                          </AlertDialogFooter>
                                        </AlertDialogContent>
                                      </AlertDialog>
                                    </div>
                                  )}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

      </section>

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
              <strong className="text-cost-red text-sm">{formatBRL(statsWithInitial.cumulativeBalance)}</strong>
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
