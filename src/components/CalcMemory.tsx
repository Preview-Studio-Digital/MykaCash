import { CalcResult, formatBRL, formatPct } from "@/lib/calc";

export const CalcMemory = ({
  result,
  monthlyRate,
  operationDate,
}: {
  result: CalcResult;
  monthlyRate: number;
  operationDate: string;
}) => {
  const fmtDate = (iso: string) =>
    iso ? new Date(iso + "T00:00:00").toLocaleDateString("pt-BR") : "-";

  const summary: { label: string; value: string; className?: string }[] = [
    { label: "VALOR NOTA", value: formatBRL(result.totalInvoice) },
    { label: "LÍQUIDO", value: formatBRL(result.netValue), className: "text-net-green" },
    { label: "CUSTO OPERAÇÃO", value: formatBRL(result.operationCost), className: "text-cost-red" },
    { label: "TAXA MENSAL", value: formatPct(monthlyRate) },
    { label: "TAXA EFETIVA", value: formatPct(result.effectiveRatePct) },
    { label: "PRAZO MÉDIO", value: `${Math.round(result.averageDays)} dias` },
    { label: "DATA OPERAÇÃO", value: fmtDate(operationDate) },
  ];

  return (
    <section className="rounded-2xl border border-border/60 bg-gradient-card p-6 shadow-card animate-fade-up">
      <div className="mb-5 flex items-center gap-3">
        <span className="h-2 w-2 rounded-full bg-primary-glow animate-pulse-glow" />
        <h2 className="font-display text-xl font-semibold tracking-tight">Memória de cálculo</h2>
      </div>

      {/* Summary — mobile vertical */}
      <div className="space-y-2 md:hidden">
        {summary.map((r) => (
          <div
            key={r.label}
            className="flex items-center justify-between gap-3 rounded-lg border border-border/40 bg-muted/20 px-3 py-2"
          >
            <span className="font-mono text-[10px] tracking-widest text-muted-foreground">{r.label}</span>
            <span className={`font-mono text-xs tabular-nums ${r.className ?? ""}`}>{r.value}</span>
          </div>
        ))}
      </div>

      {/* Summary — desktop horizontal */}
      <div className="hidden md:block overflow-x-auto rounded-lg border border-border/50">
        <table className="w-full text-xs whitespace-nowrap">
          <thead className="bg-muted/40 font-mono tracking-widest">
            <tr className="text-left text-muted-foreground">
              {summary.map((r) => (
                <th key={r.label} className="px-3 py-2 font-medium">
                  {r.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-border/40 font-mono tabular-nums">
              {summary.map((r) => (
                <td key={r.label} className={`px-3 py-2 ${r.className ?? ""}`}>
                  {r.value}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {/* Installments breakdown */}
      <div className="mt-6">
        <div className="mb-3 font-mono text-[10px] tracking-[0.3em] text-muted-foreground">
          PARCELAS ({result.installmentCalcs.length})
        </div>

        {/* Mobile */}
        <div className="space-y-2 md:hidden">
          {result.installmentCalcs.map((i, idx) => (
            <div
              key={i.id}
              className="rounded-lg border border-border/40 bg-muted/20 p-3 space-y-1"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] tracking-widest text-muted-foreground">
                  P {String(idx + 1).padStart(2, "0")}
                </span>
                <span className="font-mono text-[10px] text-muted-foreground">
                  {fmtDate(i.dueDate)} · {i.days} dias
                </span>
              </div>
              <div className="flex items-center justify-between font-mono text-xs tabular-nums">
                <span className="text-muted-foreground">Valor</span>
                <span>{formatBRL(i.value)}</span>
              </div>
              <div className="flex items-center justify-between font-mono text-xs tabular-nums">
                <span className="text-muted-foreground">VP</span>
                <span className="text-net-green">{formatBRL(i.presentValue)}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Desktop */}
        <div className="hidden md:block overflow-x-auto rounded-lg border border-border/50">
          <table className="w-full text-xs whitespace-nowrap">
            <thead className="bg-muted/40 font-mono tracking-widest">
              <tr className="text-left text-muted-foreground">
                <th className="px-3 py-2 font-medium">#</th>
                <th className="px-3 py-2 font-medium">VENCIMENTO</th>
                <th className="px-3 py-2 font-medium">DIAS</th>
                <th className="px-3 py-2 font-medium text-right">VALOR</th>
                <th className="px-3 py-2 font-medium text-right">VP</th>
              </tr>
            </thead>
            <tbody>
              {result.installmentCalcs.map((i, idx) => (
                <tr key={i.id} className="border-t border-border/40 font-mono tabular-nums">
                  <td className="px-3 py-2">{String(idx + 1).padStart(2, "0")}</td>
                  <td className="px-3 py-2">{fmtDate(i.dueDate)}</td>
                  <td className="px-3 py-2">{i.days}</td>
                  <td className="px-3 py-2 text-right">{formatBRL(i.value)}</td>
                  <td className="px-3 py-2 text-right text-net-green">{formatBRL(i.presentValue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="mt-3 font-mono text-[10px] leading-relaxed tracking-wider text-muted-foreground">
        Fórmula: VP = Valor / (1 + taxa)^(dias/30) · soma dos VPs = líquido.
      </p>
    </section>
  );
};
