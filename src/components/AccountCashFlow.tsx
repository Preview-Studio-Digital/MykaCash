import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { calculate, formatBRL, type Installment } from "@/lib/calc";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
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
  Pencil
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
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
}

type Period = "total" | "dia" | "semana" | "mes" | "periodo";

const localISO = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const todayISO = () => localISO(new Date());

export const AccountCashFlow = () => {
  const [transactions, setTransactions] = useState<UnifiedTransaction[]>([]);
  const [manualTransactions, setManualTransactions] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filters
  const [period, setPeriod] = useState<Period>("total");
  const [fromDate, setFromDate] = useState(todayISO());
  const [toDate, setToDate] = useState(todayISO());
  
  // Form State
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formType, setFormType] = useState<"deposit" | "withdrawal">("deposit");
  const [formAmount, setFormAmount] = useState("");
  const [formDate, setFormDate] = useState(todayISO());
  const [formDescription, setFormDescription] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      // We fetch separately to handle the case where account_transactions doesn't exist yet
      const { data: invoicesData, error: invoicesError } = await supabase
        .from("invoices")
        .select("*, clients(name)")
        .order("operation_date", { ascending: false });

      if (invoicesError) {
        console.error("Error loading invoices:", invoicesError);
        toast.error("Erro ao carregar operações registradas");
      } else {
        setInvoices(invoicesData || []);
      }

      const { data: manualData, error: manualError } = await supabase
        .from("account_transactions")
        .select("*")
        .order("date", { ascending: false });

      if (manualError) {
        // If table doesn't exist, just log it and keep an empty array
        if (manualError.code === 'PGRST116' || manualError.message?.includes('not found')) {
          console.warn("Table 'account_transactions' not found. It might need to be created in Supabase.");
          setManualTransactions([]);
        } else {
          console.error("Error loading manual transactions:", manualError);
        }
      } else {
        setManualTransactions(manualData || []);
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
        data.push({
          id: `op-out-${inv.id}`,
          type: "operation_out",
          amount: calc.netValue,
          date: inv.operation_date,
          description: `Saída Op: ${inv.clients?.name || 'Cliente'} - NF ${inv.invoice_number || 'S/N'}`,
          reference_id: inv.id
        });
      }

      // Entradas: Parcelas Liquidadas
      const settledEntries = Array.isArray(inv.settled_installments) ? inv.settled_installments : [];
      const settledIds = new Set(settledEntries.map((e: any) => typeof e === 'string' ? e : e.id));

      calc.installmentCalcs.forEach((inst, idx) => {
        if (settledIds.has(inst.id)) {
          data.push({
            id: `inst-in-${inst.id}`,
            type: "installment_in",
            amount: inst.value,
            date: inst.dueDate, // Entradas são registradas na data de vencimento quando liquidadas
            description: `Entrada Op: ${inv.clients?.name || 'Cliente'} - NF ${inv.invoice_number || 'S/N'} (${idx + 1}/${calc.installmentCalcs.length})`,
            reference_id: inv.id
          });
        }
      });
    });

    return data.sort((a, b) => b.date.localeCompare(a.date));
  }, [manualTransactions, invoices]);


  const filteredData = useMemo(() => {
    if (period === "total") return unifiedData;
    
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

    return unifiedData.filter(t => t.date >= start && t.date <= end);
  }, [unifiedData, period, fromDate, toDate]);

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

    const cumulativeBalance = unifiedData.reduce((acc, t) => {
      if (t.date <= end) {
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
  }, [unifiedData, filteredData, invoices, period, fromDate, toDate]);

  const chartData = useMemo(() => {
    if (unifiedData.length === 0) return [];

    const sortedAll = [...unifiedData].sort((a, b) => a.date.localeCompare(b.date));
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
    const today = todayISO();
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

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Stats Cards */}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        <div className="relative group overflow-hidden rounded-2xl border border-net-green/20 bg-gradient-to-br from-card to-card/50 p-6 shadow-[0_0_20px_-5px_hsl(var(--net-green)/0.3)] transition-all hover:shadow-[0_0_40px_-2px_hsl(var(--net-green)/0.6)]">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <ArrowUpCircle className="h-12 w-12 text-net-green" />
          </div>
          <p className="text-xs font-mono tracking-widest text-muted-foreground uppercase">Valor Depositado</p>
          <h3 className="text-2xl font-bold mt-2 text-net-green">
            {formatBRL(stats.periodDeposits)}
          </h3>
        </div>

        <div className="relative group overflow-hidden rounded-2xl border border-cost-red/20 bg-gradient-to-br from-card to-card/50 p-6 shadow-[0_0_20px_-5px_hsl(var(--cost-red)/0.3)] transition-all hover:shadow-[0_0_40px_-2px_hsl(var(--cost-red)/0.6)]">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <ArrowDownCircle className="h-12 w-12 text-cost-red" />
          </div>
          <p className="text-xs font-mono tracking-widest text-muted-foreground uppercase">Valor Sacado</p>
          <h3 className="text-2xl font-bold mt-2 text-cost-red">
            {formatBRL(stats.periodWithdrawals)}
          </h3>
        </div>

        <div className="relative group overflow-hidden rounded-2xl border border-factoring-amber/20 bg-gradient-to-br from-card to-card/50 p-6 shadow-[0_0_20px_-5px_hsl(var(--factoring-amber)/0.3)] transition-all hover:shadow-[0_0_40px_-2px_hsl(var(--factoring-amber)/0.6)]">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <History className="h-12 w-12 text-factoring-amber" />
          </div>
          <p className="text-xs font-mono tracking-widest text-muted-foreground uppercase">Saldo Aberto</p>
          <h3 className="text-2xl font-bold mt-2 text-factoring-amber">
            {formatBRL(stats.periodOpen)}
          </h3>
        </div>

        <div className="relative group overflow-hidden rounded-2xl border border-net-green/20 bg-gradient-to-br from-card to-card/50 p-6 shadow-[0_0_20px_-5px_hsl(var(--net-green)/0.3)] transition-all hover:shadow-[0_0_40px_-2px_hsl(var(--net-green)/0.6)]">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <TrendingUp className="h-12 w-12 text-net-green" />
          </div>
          <p className="text-xs font-mono tracking-widest text-muted-foreground uppercase">Ganho Total</p>
          <h3 className="text-2xl font-bold mt-2 text-net-green">
            {formatBRL(stats.periodProfit)}
          </h3>
        </div>

        <div className={`relative group overflow-hidden rounded-2xl border bg-gradient-to-br from-card to-card/50 p-6 transition-all ${
          stats.cumulativeBalance >= 0 
            ? 'border-primary/20 shadow-[0_0_20px_-5px_hsl(var(--primary)/0.3)] hover:shadow-[0_0_40px_-2px_hsl(var(--primary)/0.6)]' 
            : 'border-cost-red/20 shadow-[0_0_20px_-5px_hsl(var(--cost-red)/0.3)] hover:shadow-[0_0_40px_-2px_hsl(var(--cost-red)/0.6)]'
        }`}>
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <Wallet className={`h-12 w-12 ${stats.cumulativeBalance >= 0 ? 'text-primary' : 'text-cost-red'}`} />
          </div>
          <p className="text-xs font-mono tracking-widest text-muted-foreground uppercase">Saldo em conta</p>
          <h3 className={`text-2xl font-bold mt-2 ${stats.cumulativeBalance >= 0 ? 'text-primary' : 'text-cost-red'}`}>
            {formatBRL(stats.cumulativeBalance)}
          </h3>
        </div>
      </div>

      {/* Chart Section */}
      <section className="rounded-2xl border border-border/40 bg-card/30 backdrop-blur-sm p-6 shadow-panel">
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <TrendingUp className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h4 className="font-display text-lg">Evolução do Saldo</h4>
              <p className="text-xs text-muted-foreground">Variação do saldo da conta por dia</p>
            </div>
          </div>

          {/* Filters Bar */}
          <div className="flex flex-wrap items-center gap-2">
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

            {(period === 'periodo' || period === 'dia') && (
              <Input 
                type="date" 
                className="h-9 w-[140px] bg-background/50 border-border/40" 
                value={fromDate}
                onChange={e => setFromDate(e.target.value)}
              />
            )}
            {period === 'periodo' && (
              <>
                <span className="text-muted-foreground text-xs font-mono">ATÉ</span>
                <Input 
                  type="date" 
                  className="h-9 w-[140px] bg-background/50 border-border/40" 
                  value={toDate}
                  onChange={e => setToDate(e.target.value)}
                />
              </>
            )}
          </div>
        </div>

        <div className="h-[300px] w-full">
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
                tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                dy={10}
                tickFormatter={(val) => {
                  const parts = val.split("-");
                  if (parts.length === 3) return parts[2];
                  return val;
                }}
              />
              <YAxis 
                yAxisId="left"
                width={50}
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                tickFormatter={(v) => `R$ ${Math.abs(v) >= 1000 ? (v/1000).toFixed(0) + 'k' : v}`}
              />
              <YAxis 
                yAxisId="right"
                orientation="right"
                width={50}
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                tickFormatter={(v) => `R$ ${Math.abs(v) >= 1000 ? (v/1000).toFixed(0) + 'k' : v}`}
              />
              <Tooltip 
                cursor={false}
                contentStyle={{ 
                  backgroundColor: 'hsl(var(--background))', 
                  borderColor: 'hsl(var(--border)/0.5)',
                  borderRadius: '12px',
                  boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                  fontSize: '12px'
                }}
                labelFormatter={(value, payload) => {
                  if (payload && payload.length > 0) {
                    const rawDate = payload[0].payload.rawDate;
                    const d = new Date(rawDate + "T00:00:00");
                    const day = d.getDate();
                    const month = d.toLocaleDateString('pt-BR', { month: 'long' });
                    return `Data: ${day} de ${month}`;
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
                  stroke="hsl(var(--border))"
                  strokeDasharray="4 4"
                  strokeWidth={1}
                  opacity={0.5}
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
                animationDuration={1500}
              />
              <Area 
                yAxisId="right"
                type="monotone" 
                dataKey="balance" 
                stroke="transparent" 
                fill="transparent" 
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {chartData.length > 0 && (() => {
          const MONTHS_PT = ["JANEIRO","FEVEREIRO","MARÇO","ABRIL","MAIO","JUNHO","JULHO","AGOSTO","SETEMBRO","OUTUBRO","NOVEMBRO","DEZEMBRO"];
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
              <div className="mt-4 flex bg-muted/20 rounded-sm" style={{ marginLeft: 50, marginRight: 50 }}>
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
              <div className="mt-1 flex" style={{ marginLeft: 50, marginRight: 50 }}>
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
        <div className="p-6 border-b border-border/40 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <History className="h-5 w-5 text-primary" />
            </div>
            <h4 className="font-display text-lg">Histórico de Movimentações</h4>
          </div>
          <div className="flex items-center gap-2">
            <Dialog open={isDialogOpen} onOpenChange={(open) => {
              setIsDialogOpen(open);
              if (!open) {
                setEditingId(null);
                setFormAmount("");
                setFormDescription("");
              }
            }}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 text-[10px] tracking-widest font-mono border-border/40 hover:bg-primary hover:text-primary-foreground hover:border-primary transition-all">
                  <Plus className="h-3 w-3 mr-1" /> NOVA MOVIMENTAÇÃO
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
                      <Input 
                        id="date" 
                        type="date" 
                        value={formDate} 
                        onChange={e => setFormDate(e.target.value)} 
                        required
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
            <Button variant="outline" size="sm" className="h-8 text-[10px] tracking-widest font-mono border-border/40">
              <Download className="h-3 w-3 mr-1" /> EXPORTAR
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow className="hover:bg-transparent border-border/40">
                <TableHead className="text-center text-[10px] tracking-widest uppercase font-mono">Data</TableHead>
                <TableHead className="text-center text-[10px] tracking-widest uppercase font-mono">Descrição</TableHead>
                <TableHead className="text-center text-[10px] tracking-widest uppercase font-mono">Tipo</TableHead>
                <TableHead className="text-center text-[10px] tracking-widest uppercase font-mono">Valor</TableHead>
                <TableHead className="text-center w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredData.map((t) => (
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
                  <TableCell className="text-center font-mono text-xs">
                    {new Date(t.date + "T00:00:00").toLocaleDateString('pt-BR')}
                  </TableCell>
                  <TableCell className="text-center text-sm font-medium">
                    {t.description}
                  </TableCell>
                  <TableCell className="text-center">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-tight uppercase ${
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
                  <TableCell className={`text-center font-mono font-bold ${
                    (t.type === 'deposit' || t.type === 'installment_in') ? 'text-net-green' : 'text-cost-red'
                  }`}>
                    {(t.type === 'deposit' || t.type === 'installment_in') ? '+' : '-'} {formatBRL(t.amount)}
                  </TableCell>
                  <TableCell className="text-center">
                    {(t.type === 'deposit' || t.type === 'withdrawal') && (
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
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {filteredData.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="h-32 text-center text-muted-foreground font-mono text-xs">
                    Nenhuma movimentação encontrada para o período selecionado.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
};
