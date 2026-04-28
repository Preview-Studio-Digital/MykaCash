import { useEffect, useMemo, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { PageNav } from "@/components/PageNav";
import { Button } from "@/components/ui/button";
import { DateField } from "@/components/DateField";
import { supabase } from "@/integrations/supabase/client";
import { calculate, formatBRL, formatPct, type Installment } from "@/lib/calc";
import { toast } from "sonner";

type Period = "hoje" | "semana" | "mes" | "periodo";

type InvoiceRow = {
  id: string;
  invoice_number: string;
  invoice_value: number;
  operation_date: string;
  monthly_rate: number;
  installments: Installment[];
  client_id: string;
  clients?: { name: string } | null;
};

const todayISO = () => new Date().toISOString().slice(0, 10);
const addDaysISO = (baseISO: string, days: number) => {
  const d = new Date(baseISO + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};
const startOfWeekISO = () => {
  const d = new Date();
  const day = d.getDay(); // 0 sun
  const diff = day === 0 ? -6 : 1 - day; // Monday as start
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
  const [period, setPeriod] = useState<Period>("hoje");
  const [from, setFrom] = useState<string>(todayISO());
  const [to, setTo] = useState<string>(todayISO());
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);

  const range = useMemo(() => {
    const today = todayISO();
    if (period === "hoje") return { from: today, to: today };
    if (period === "semana") return { from: startOfWeekISO(), to: today };
    if (period === "mes") return { from: startOfMonthISO(), to: today };
    return { from, to };
  }, [period, from, to]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("invoices")
        .select("id, invoice_number, invoice_value, operation_date, monthly_rate, installments, client_id, clients(name)")
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
    load();
  }, [range.from, range.to]);

  // Build flat rows (one per installment) using the same calc as the main page
  const rows = useMemo(() => {
    const out: Array<{
      key: string;
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
      parcelLabel: string;
    }> = [];
    for (const inv of invoices) {
      const installments = Array.isArray(inv.installments) ? inv.installments : [];
      const result = calculate({
        invoiceValue: Number(inv.invoice_value) || 0,
        operationDate: inv.operation_date,
        monthlyRate: Number(inv.monthly_rate) || 0,
        installments: installments as Installment[],
      });
      const showIdx = result.installmentCalcs.length > 1;
      result.installmentCalcs.forEach((i, idx) => {
        const cost = i.value - i.presentValue;
        const effectivePct = i.value > 0 ? (cost / i.value) * 100 : 0;
        out.push({
          key: `${inv.id}-${i.id}`,
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
          parcelLabel: showIdx ? String(idx + 1).padStart(2, "0") : "ÚNICA",
        });
      });
    }
    return out;
  }, [invoices]);

  const totals = rows.reduce(
    (a, r) => ({
      value: a.value + r.value,
      presentValue: a.presentValue + r.presentValue,
      cost: a.cost + r.cost,
    }),
    { value: 0, presentValue: 0, cost: 0 }
  );
  const totalEffective = totals.value > 0 ? (totals.cost / totals.value) * 100 : 0;

  const periodOptions: { id: Period; label: string }[] = [
    { id: "hoje", label: "HOJE" },
    { id: "semana", label: "SEMANA" },
    { id: "mes", label: "MÊS" },
    { id: "periodo", label: "PERÍODO" },
  ];

  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="container mx-auto max-w-6xl px-4 py-10 md:py-14">
        <PageNav />

        <section className="rounded-2xl border border-border/60 bg-gradient-card p-6 md:p-8 shadow-card animate-fade-up">
          <div className="mb-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="h-2 w-2 rounded-full bg-primary animate-pulse-glow" />
              <h2 className="font-display text-xl font-semibold tracking-tight">Histórico de operações</h2>
            </div>
            <span className="font-mono text-[10px] tracking-[0.3em] text-muted-foreground">
              {rows.length} {rows.length === 1 ? "PARCELA" : "PARCELAS"} · {invoices.length} {invoices.length === 1 ? "OPERAÇÃO" : "OPERAÇÕES"}
            </span>
          </div>

          {/* Filters */}
          <div className="mb-6 flex flex-wrap items-end gap-3">
            <div className="inline-flex rounded-full border border-border/60 bg-background/40 p-1">
              {periodOptions.map((opt) => {
                const active = period === opt.id;
                return (
                  <button
                    key={opt.id}
                    onClick={() => setPeriod(opt.id)}
                    className={
                      "inline-flex items-center rounded-full px-4 py-1.5 font-mono text-[10px] tracking-[0.3em] transition-all " +
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
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1">
                  <span className="block font-mono text-[9px] tracking-[0.25em] text-muted-foreground">DE</span>
                  <DateField value={from} onChange={setFrom} />
                </div>
                <div className="space-y-1">
                  <span className="block font-mono text-[9px] tracking-[0.25em] text-muted-foreground">ATÉ</span>
                  <DateField value={to} onChange={setTo} />
                </div>
              </div>
            )}

            {period !== "periodo" && (
              <span className="font-mono text-[10px] tracking-[0.25em] text-muted-foreground">
                {fmtDate(range.from)} → {fmtDate(range.to)}
              </span>
            )}
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
              rows.map((r) => (
                <div
                  key={r.key}
                  className="rounded-lg border border-border/40 bg-muted/20 p-3 space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <div className="font-mono text-[10px] tracking-widest text-primary-glow">
                      NF {r.invoiceNumber} · P {r.parcelLabel}
                    </div>
                    <div className="font-mono text-[10px] tracking-widest text-muted-foreground">
                      {r.days} DIAS
                    </div>
                  </div>
                  <div className="text-sm font-semibold truncate">{r.clientName}</div>
                  <div className="font-mono text-[10px] text-muted-foreground">
                    OP {fmtDate(r.operationDate)} · VENC {fmtDate(r.dueDate)}
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
                      <div className="text-[9px] tracking-widest text-muted-foreground">TAXA EF.</div>
                      <div>{formatPct(r.effectivePct)}</div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Desktop table — same style as CalcMemory */}
          <div className="hidden md:block rounded-lg border border-border/50 overflow-hidden">
            <table className="w-full text-[11px]">
              <thead className="bg-muted/40 font-mono tracking-widest">
                <tr className="text-muted-foreground">
                  <th className="px-2 py-2 text-center font-medium">CLIENTE</th>
                  <th className="px-2 py-2 text-center font-medium">NF</th>
                  <th className="px-2 py-2 text-center font-medium">PARCELA</th>
                  <th className="px-2 py-2 text-center font-medium">OPERAÇÃO</th>
                  <th className="px-2 py-2 text-center font-medium">VENCIMENTO</th>
                  <th className="px-2 py-2 text-center font-medium">DIAS</th>
                  <th className="px-2 py-2 text-center font-medium">TAXA MENSAL</th>
                  <th className="px-2 py-2 text-center font-medium">TAXA EFETIVA</th>
                  <th className="px-2 py-2 text-center font-medium">VALOR BRUTO</th>
                  <th className="px-2 py-2 text-center font-medium">VALOR LÍQUIDO</th>
                  <th className="px-2 py-2 text-center font-medium">CUSTO</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={11} className="py-12 text-center font-mono text-xs tracking-widest text-muted-foreground">
                      CARREGANDO...
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="py-12 text-center font-mono text-xs tracking-widest text-muted-foreground">
                      NENHUMA OPERAÇÃO NO PERÍODO
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr key={r.key} className="border-t border-border/40 font-mono tabular-nums text-center">
                      <td className="px-2 py-2 text-left max-w-[180px] truncate" title={r.clientName}>{r.clientName}</td>
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
                    </tr>
                  ))
                )}

                {!loading && rows.length > 0 && (
                  <tr className="border-t-2 border-primary-glow/40 bg-primary-glow/[0.07] font-mono tabular-nums text-center font-semibold">
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
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
      <footer className="border-t border-border/40 py-6 text-center">
        <p className="font-mono text-[10px] tracking-[0.35em] text-muted-foreground">SMART MONEY · V1.0</p>
      </footer>
    </div>
  );
};

export default Historico;
