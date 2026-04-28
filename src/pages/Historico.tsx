import { useEffect, useMemo, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { PageNav } from "@/components/PageNav";
import { Button } from "@/components/ui/button";
import { DateField } from "@/components/DateField";
import { supabase } from "@/integrations/supabase/client";
import { calculate, formatBRL, formatPct, FACTORING_MONTHLY_RATE_PCT, type Installment } from "@/lib/calc";
import { toast } from "sonner";
import { CheckCircle2, Circle, Pencil, Trash2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

type Period = "hoje" | "semana" | "mes" | "total" | "periodo";

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

const todayISO = () => new Date().toISOString().slice(0, 10);
const startOfWeekISO = () => {
  const d = new Date();
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
};
const startOfMonthISO = () => {
  const d = new Date();
  d.setDate(1);
  return d.toISOString().slice(0, 10);
};
const fmtDate = (iso: string) =>
  iso ? new Date(iso + "T00:00:00").toLocaleDateString("pt-BR") : "-";

const Historico = () => {
  const { user, isAdmin } = useAuth();
  const [period, setPeriod] = useState<Period>("total");
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
      .gte("operation_date", range.from)
      .lte("operation_date", range.to)
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
  }, [range.from, range.to]);

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
        inv.profiles?.display_name || inv.profiles?.username || "—";

      result.installmentCalcs.forEach((i, idx) => {
        const cost = i.value - i.presentValue;
        const effectivePct = i.value > 0 ? (cost / i.value) * 100 : 0;
        const settled = settledMap.has(i.id);
        const settledDate = settled ? settledMap.get(i.id) ?? null : null;
        const overdue = !settled && i.dueDate < todayStr;
        const factoringCost = i.value * (factoringRate / 100) * (i.days / 30);
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

  const totals = rows.reduce(
    (a, r) => ({
      value: a.value + r.value,
      presentValue: a.presentValue + r.presentValue,
      cost: a.cost + r.cost,
      factoring: a.factoring + r.factoringCost,
    }),
    { value: 0, presentValue: 0, cost: 0, factoring: 0 }
  );
  const totalEffective = totals.value > 0 ? (totals.cost / totals.value) * 100 : 0;
  const factoringSavings = Math.max(0, totals.factoring - totals.cost);
  const settledPresent = rows.reduce((s, r) => s + (r.settled ? r.presentValue : 0), 0);
  const openPresent = Math.max(0, totals.presentValue - settledPresent);

  // Chart: "Operações em Transação" — running outstanding balance over time.
  // +netValue on operation date; -presentValue on settlement date.
  const chartData = useMemo(() => {
    type Ev = { date: string; delta: number };
    const events: Ev[] = [];
    for (const r of rows) {
      events.push({ date: r.operationDate, delta: r.presentValue });
      if (r.settled) {
        events.push({ date: r.dueDate, delta: -r.presentValue });
      }
    }
    if (events.length === 0) return [] as { date: string; label: string; saldo: number }[];

    // Group by date
    const byDate = new Map<string, number>();
    events.forEach((e) => byDate.set(e.date, (byDate.get(e.date) ?? 0) + e.delta));
    const sortedDates = Array.from(byDate.keys()).sort();

    // Add zero baseline one week before first date
    const first = new Date(sortedDates[0] + "T00:00:00");
    first.setDate(first.getDate() - 7);
    const baseline = first.toISOString().slice(0, 10);

    const series: { date: string; label: string; saldo: number }[] = [
      { date: baseline, label: fmtDate(baseline), saldo: 0 },
    ];
    let acc = 0;
    for (const d of sortedDates) {
      acc += byDate.get(d) ?? 0;
      series.push({ date: d, label: fmtDate(d), saldo: Math.round(acc * 100) / 100 });
    }
    return series;
  }, [rows]);

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
    if (!confirm("Deseja realmente excluir a operação? Essa ação não pode ser desfeita.")) return;
    const { error } = await supabase.from("invoices").delete().eq("id", invoiceId);
    if (error) return toast.error(error.message);
    toast.success("Operação removida");
    load();
  };

  const periodOptions: { id: Period; label: string }[] = [
    { id: "hoje", label: "HOJE" },
    { id: "semana", label: "SEMANA" },
    { id: "mes", label: "MÊS" },
    { id: "total", label: "TOTAL" },
    { id: "periodo", label: "PERÍODO" },
  ];

  // Hover state to preview liquidation in orange
  const [hoverKey, setHoverKey] = useState<string | null>(null);

  // Row coloring — when hovering the status pill of an open/overdue row, show orange preview
  const rowClass = (r: (typeof rows)[number]) => {
    if (r.settled) return "bg-[hsl(var(--factoring-amber)/0.22)] hover:bg-[hsl(var(--factoring-amber)/0.28)]";
    if (hoverKey === r.key) {
      return "bg-[hsl(var(--factoring-amber)/0.22)]";
    }
    if (r.overdue) return "bg-[hsl(var(--cost-red)/0.12)] hover:bg-[hsl(var(--cost-red)/0.18)]";
    return "bg-[hsl(var(--net-green)/0.06)] hover:bg-[hsl(var(--net-green)/0.10)]";
  };

  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="container mx-auto max-w-6xl px-4 py-10 md:py-14 space-y-8">
        <PageNav />

        {/* Period filter — controls panels, chart, and table */}
        <section className="flex flex-wrap items-center justify-center gap-3 animate-fade-up text-center">
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

          {period === "periodo" && (
            <div className="flex items-center gap-3">
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
              TODAS AS OPERAÇÕES
            </span>
          )}
        </section>

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
              <div className="font-mono text-[9px] tracking-[0.3em] opacity-80">CUSTO</div>
              <div className="mt-1 font-display text-xl md:text-2xl font-bold tabular-nums">
                {formatBRL(totals.cost)}
              </div>
              <div className="mt-3 h-px bg-white/20" />
              <div className="mt-3 font-mono text-[9px] tracking-[0.3em] opacity-80">TAXA EFETIVA MÉDIA</div>
              <div className="mt-1 font-display text-base md:text-lg font-semibold tabular-nums">
                {formatPct(totalEffective)}
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
              <div className="mt-3 font-mono text-[9px] tracking-[0.3em] opacity-90">LIQUIDADO NO PERÍODO</div>
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
              <span className="h-2 w-2 rounded-full bg-net-green animate-pulse-glow" />
              <h2 className="font-display text-xl font-semibold tracking-tight">
                Valores em Aberto
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
                  // s normalized in [-1, 1]; -1 falling => green, 0 flat => yellow, +1 rising => red
                  const t = maxAbs === 0 ? 0 : Math.max(-1, Math.min(1, s / maxAbs));
                  // Hue: red 0, yellow 50, green 145
                  const hue = t >= 0 ? 50 + (0 - 50) * t : 50 + (145 - 50) * -t;
                  const sat = 80;
                  const light = 55;
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
                            <stop key={i} offset={`${s.offset}%`} stopColor={s.color} stopOpacity={0.35} />
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
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
                      <XAxis
                        dataKey="label"
                        tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                        stroke="hsl(var(--border))"
                      />
                      <YAxis
                        tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                        stroke="hsl(var(--border))"
                        tickFormatter={(v) => `R$ ${(v / 1000).toFixed(0)}k`}
                      />
                      <Tooltip
                        contentStyle={{
                          background: "hsl(var(--popover))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: 8,
                          fontFamily: "JetBrains Mono, monospace",
                          fontSize: 12,
                        }}
                        labelStyle={{ color: "hsl(var(--foreground))" }}
                        formatter={(v: number) => [formatBRL(v), "Em aberto"]}
                      />
                      <Area
                        type="monotone"
                        dataKey="saldo"
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
        </section>

        {/* Table */}
        <section className="rounded-2xl border border-border/60 bg-gradient-card p-6 md:p-8 shadow-card animate-fade-up">
          <div className="mb-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="h-2 w-2 rounded-full bg-primary animate-pulse-glow" />
              <h2 className="font-display text-xl font-semibold tracking-tight">Histórico de operações</h2>
            </div>
            <span className="font-mono text-[10px] tracking-[0.3em] text-muted-foreground">
              {rows.length} {rows.length === 1 ? "PARCELA" : "PARCELAS"} · {invoices.length}{" "}
              {invoices.length === 1 ? "OPERAÇÃO" : "OPERAÇÕES"}
            </span>
          </div>

          {/* Mobile cards */}
          <div className="space-y-2 md:hidden">
            {loading ? (
              <div className="py-12 text-center font-mono text-xs tracking-widest text-muted-foreground">
                CARREGANDO...
              </div>
            ) : rows.length === 0 ? (
              <div className="py-12 text-center font-mono text-xs tracking-widest text-muted-foreground">
                NENHUMA OPERAÇÃO NO PERÍODO
              </div>
            ) : (
              rows.map((r) => {
                const canDelete = isAdmin || (r.isAuthor && r.withinEditWindow);
                return (
                  <div
                    key={r.key}
                    className={
                      "rounded-lg border border-border/40 p-3 space-y-1 " +
                      (r.settled
                        ? "bg-[hsl(var(--net-green)/0.12)]"
                        : r.overdue
                        ? "bg-[hsl(var(--cost-red)/0.12)]"
                        : "bg-muted/20")
                    }
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-mono text-[10px] tracking-widest text-primary-glow">
                        NF {r.invoiceNumber} · P {r.parcelLabel}
                      </div>
                      <div className="flex items-center gap-2">
                        {r.settled && (
                          <span className="rounded-full bg-factoring-amber/20 px-2 py-0.5 font-mono text-[9px] tracking-widest text-factoring-amber">
                            LIQUIDADA
                          </span>
                        )}
                        {r.overdue && (
                          <span className="rounded-full bg-cost-red/20 px-2 py-0.5 font-mono text-[9px] tracking-widest text-cost-red">
                            VENCIDA
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
                      <div>
                        <div className="text-[9px] tracking-widest text-muted-foreground">ECONOMIA</div>
                        <div className="text-factoring-amber">{formatBRL(r.factoringCost)}</div>
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
                      {canDelete && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDeleteOperation(r.invoiceId)}
                          className="text-muted-foreground hover:text-cost-red"
                          aria-label="Remover"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block rounded-lg border border-border/50 overflow-x-auto">
            <table className="w-full min-w-[1024px] text-[10px] lg:text-[11px]">
              <thead className="bg-muted/40 font-mono tracking-widest">
                <tr className="text-muted-foreground">
                  <th className="px-2 py-2 text-center font-medium">STATUS</th>
                  <th className="px-2 py-2 text-center font-medium">CLIENTE</th>
                  <th className="px-2 py-2 text-center font-medium">NF</th>
                  <th className="px-2 py-2 text-center font-medium">PARC.</th>
                  <th className="px-2 py-2 text-center font-medium">OPERAÇÃO</th>
                  <th className="px-2 py-2 text-center font-medium">VENC.</th>
                  <th className="px-2 py-2 text-center font-medium">DIAS</th>
                  <th className="px-2 py-2 text-center font-medium">TX MÊS</th>
                  <th className="px-2 py-2 text-center font-medium">TX EFET.</th>
                  <th className="px-2 py-2 text-center font-medium">BRUTO</th>
                  <th className="px-2 py-2 text-center font-medium">LÍQUIDO</th>
                  <th className="px-2 py-2 text-center font-medium">CUSTO</th>
                  <th className="px-2 py-2 text-center font-medium text-factoring-amber text-muted-foreground">ECONOMIA</th>
                  <th className="px-2 py-2 text-center font-medium">RESPONSÁVEL</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={14} className="py-12 text-center font-mono text-xs tracking-widest text-muted-foreground">
                      CARREGANDO...
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={14} className="py-12 text-center font-mono text-xs tracking-widest text-muted-foreground">
                      NENHUMA OPERAÇÃO NO PERÍODO
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => {
                    const canDelete = isAdmin || (r.isAuthor && r.withinEditWindow);
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
                                {r.settled ? "LIQUIDADA" : r.overdue ? "VENCIDA" : "ABERTA"}
                              </span>
                              <span className="hidden group-hover:inline">
                                {r.settled ? "DESFAZER" : "LIQUIDAR"}
                              </span>
                            </button>
                            {canDelete && (
                              <button
                                onClick={() => handleDeleteOperation(r.invoiceId)}
                                className="rounded p-1 text-muted-foreground transition-colors hover:bg-cost-red/15 hover:text-cost-red"
                                title="Remover operação"
                                aria-label="Remover"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="px-2 py-2 text-left max-w-[160px] truncate" title={r.clientName}>
                          {r.clientName}
                        </td>
                        <td className="px-2 py-2">{r.invoiceNumber}</td>
                        <td className="px-2 py-2">{r.parcelLabel}</td>
                        <td className="px-2 py-2">{fmtDate(r.operationDate)}</td>
                        <td className="px-2 py-2">{fmtDate(r.dueDate)}</td>
                        <td className="px-2 py-2">{r.days}</td>
                        <td className="px-2 py-2">{formatPct(r.monthlyRate)}</td>
                        <td className="px-2 py-2">{formatPct(r.effectivePct)}</td>
                        <td className="px-2 py-2">{formatBRL(r.value)}</td>
                        <td className="px-2 py-2 text-net-green">{formatBRL(r.presentValue)}</td>
                        <td className="px-2 py-2 text-cost-red">{formatBRL(r.cost)}</td>
                        <td className="px-2 py-2 text-factoring-amber">{formatBRL(r.factoringCost)}</td>
                        <td className="px-2 py-2 text-left max-w-[120px] truncate" title={r.createdBy}>
                          {r.createdBy}
                        </td>
                      </tr>
                    );
                  })
                )}

                {!loading && rows.length > 0 && (
                  <tr className="border-t-2 border-primary-glow/40 bg-primary-glow/[0.07] font-mono tabular-nums text-center font-semibold">
                    <td className="px-2 py-2">—</td>
                    <td className="px-2 py-2 tracking-widest text-primary-glow text-left">TOTAL</td>
                    <td className="px-2 py-2">—</td>
                    <td className="px-2 py-2">—</td>
                    <td className="px-2 py-2">—</td>
                    <td className="px-2 py-2">—</td>
                    <td className="px-2 py-2">—</td>
                    <td className="px-2 py-2">—</td>
                    <td className="px-2 py-2">{formatPct(totalEffective)}</td>
                    <td className="px-2 py-2">{formatBRL(totals.value)}</td>
                    <td className="px-2 py-2 text-net-green">{formatBRL(totals.presentValue)}</td>
                    <td className="px-2 py-2 text-cost-red">{formatBRL(totals.cost)}</td>
                    <td className="px-2 py-2 text-factoring-amber">{formatBRL(totals.factoring)}</td>
                    <td className="px-2 py-2">—</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <p className="mt-4 font-mono text-[10px] tracking-[0.25em] text-muted-foreground">
            * EDIÇÃO E REMOÇÃO LIBERADAS POR 5 MIN APÓS O CADASTRO. APÓS ESSE PRAZO, SOMENTE O ADMINISTRADOR.
          </p>
        </section>
      </main>
      <footer className="border-t border-border/40 py-6 text-center">
        <p className="font-mono text-[10px] tracking-[0.35em] text-muted-foreground">MYKA MONEY · V1.0</p>
      </footer>
    </div>
  );
};

export default Historico;
