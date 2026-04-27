import { CalcResult, formatBRL, formatPct } from "@/lib/calc";

export const CalcMemory = ({
  result,
  monthlyRate,
  operationDate,
  dueDate,
}: {
  result: CalcResult;
  monthlyRate: number;
  operationDate: string;
  dueDate: string;
}) => {
  const fmtDate = (iso: string) =>
    iso ? new Date(iso + "T00:00:00").toLocaleDateString("pt-BR") : "-";

  const rows: { label: string; value: string; className?: string }[] = [
    { label: "VALOR NOTA", value: formatBRL(result.totalInvoice) },
    { label: "LÍQUIDO", value: formatBRL(result.netValue), className: "text-net-green" },
    { label: "CUSTO OPERAÇÃO", value: formatBRL(result.operationCost), className: "text-cost-red" },
    { label: "TAXA MENSAL", value: formatPct(monthlyRate) },
    { label: "TAXA EFETIVA", value: formatPct(result.effectiveRatePct) },
    { label: "DATA OPERAÇÃO", value: fmtDate(operationDate) },
    { label: "DATA VENCIMENTO", value: fmtDate(dueDate) },
  ];

  return (
    <section className="rounded-2xl border border-border/60 bg-gradient-card p-6 shadow-card animate-fade-up">
      <div className="mb-5 flex items-center gap-3">
        <span className="h-2 w-2 rounded-full bg-primary-glow animate-pulse-glow" />
        <h2 className="font-display text-xl font-semibold tracking-tight">Memória de cálculo</h2>
      </div>

      {/* Mobile: vertical stacked */}
      <div className="space-y-2 md:hidden">
        {rows.map((r) => (
          <div
            key={r.label}
            className="flex items-center justify-between gap-3 rounded-lg border border-border/40 bg-muted/20 px-3 py-2"
          >
            <span className="font-mono text-[10px] tracking-widest text-muted-foreground">{r.label}</span>
            <span className={`font-mono text-xs tabular-nums ${r.className ?? ""}`}>{r.value}</span>
          </div>
        ))}
      </div>

      {/* Desktop: horizontal table */}
      <div className="hidden md:block overflow-x-auto rounded-lg border border-border/50">
        <table className="w-full text-xs whitespace-nowrap">
          <thead className="bg-muted/40 font-mono tracking-widest">
            <tr className="text-left text-muted-foreground">
              {rows.map((r) => (
                <th key={r.label} className="px-3 py-2 font-medium">
                  {r.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-border/40 font-mono tabular-nums">
              {rows.map((r) => (
                <td key={r.label} className={`px-3 py-2 ${r.className ?? ""}`}>
                  {r.value}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <p className="mt-3 font-mono text-[10px] leading-relaxed tracking-wider text-muted-foreground">
        Fórmula: VP = Valor / (1 + taxa)^(dias/30) · soma dos VPs = líquido.
      </p>
    </section>
  );
};
