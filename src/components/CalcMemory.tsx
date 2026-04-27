import { CalcResult, formatBRL, formatPct } from "@/lib/calc";

export const CalcMemory = ({ result, monthlyRate }: { result: CalcResult; monthlyRate: number }) => {
  return (
    <section className="rounded-2xl border border-border/60 bg-gradient-card p-6 shadow-card animate-fade-up">
      <div className="mb-5 flex items-center gap-3">
        <span className="h-2 w-2 rounded-full bg-primary-glow animate-pulse-glow" />
        <h2 className="font-display text-xl font-semibold tracking-tight">Memória de cálculo</h2>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border/50">
        <table className="w-full text-xs whitespace-nowrap">
          <thead className="bg-muted/40 font-mono tracking-widest">
            <tr className="text-left text-muted-foreground">
              <th className="px-3 py-2 font-medium">VALOR NOTA</th>
              <th className="px-3 py-2 font-medium">LÍQUIDO</th>
              <th className="px-3 py-2 font-medium">CUSTO OPERAÇÃO</th>
              <th className="px-3 py-2 font-medium">TAXA MENSAL</th>
              <th className="px-3 py-2 font-medium">TAXA EFETIVA</th>
              <th className="px-3 py-2 font-medium">PRAZO MÁX.</th>
              <th className="px-3 py-2 font-medium">
                CUSTO FACTORING ({formatPct(result.factoringMonthlyRatePct)}/mês)
              </th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-border/40 font-mono tabular-nums">
              <td className="px-3 py-2">{formatBRL(result.totalInvoice)}</td>
              <td className="px-3 py-2 text-net-green">{formatBRL(result.netValue)}</td>
              <td className="px-3 py-2 text-cost-red">{formatBRL(result.operationCost)}</td>
              <td className="px-3 py-2">{formatPct(monthlyRate)}</td>
              <td className="px-3 py-2">{formatPct(result.effectiveRatePct)}</td>
              <td className="px-3 py-2">{result.maxDays} dias</td>
              <td className="px-3 py-2">{formatBRL(result.factoringCost)}</td>
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
