import { CalcResult, formatBRL, formatPct } from "@/lib/calc";

export const CalcMemory = ({ result, monthlyRate }: { result: CalcResult; monthlyRate: number }) => {
  const Row = ({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) => (
    <div className="flex items-center justify-between border-b border-border/40 py-2.5 last:border-b-0">
      <span className="font-mono text-[11px] tracking-[0.2em] uppercase text-muted-foreground">
        {label}
      </span>
      <span className={`${mono ? "font-mono" : "font-display"} text-sm tabular-nums text-foreground`}>
        {value}
      </span>
    </div>
  );

  return (
    <section className="rounded-2xl border border-border/60 bg-gradient-card p-6 shadow-card animate-fade-up">
      <div className="mb-5 flex items-center gap-3">
        <span className="h-2 w-2 rounded-full bg-primary-glow animate-pulse-glow" />
        <h2 className="font-display text-xl font-semibold tracking-tight">Memória de cálculo</h2>
      </div>

      <div className="grid gap-8 md:grid-cols-2">
        <div>
          <h3 className="mb-3 font-mono text-[10px] tracking-[0.35em] text-primary-glow">RESUMO</h3>
          <Row label="Valor total da nota" value={formatBRL(result.totalInvoice)} />
          <Row label="Valor líquido a receber" value={formatBRL(result.netValue)} />
          <Row label="Custo da operação" value={formatBRL(result.operationCost)} />
          <Row label="Taxa mensal informada" value={formatPct(monthlyRate)} />
          <Row label="Taxa efetiva (custo / total)" value={formatPct(result.effectiveRatePct)} />
          <Row label="Prazo máximo" value={`${result.maxDays} dias`} />
          <Row label="Prazo médio ponderado" value={`${result.averageDays.toFixed(1)} dias`} />
          <Row
            label={`Custo factoring (${formatPct(result.factoringMonthlyRatePct)}/mês)`}
            value={formatBRL(result.factoringCost)}
          />
        </div>

        <div>
          <h3 className="mb-3 font-mono text-[10px] tracking-[0.35em] text-primary-glow">
            DETALHAMENTO POR PARCELA
          </h3>
          {result.installmentCalcs.length === 0 ? (
            <p className="font-mono text-xs text-muted-foreground">Nenhuma parcela informada.</p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-border/50">
              <table className="w-full text-xs">
                <thead className="bg-muted/40 font-mono tracking-widest">
                  <tr className="text-left text-muted-foreground">
                    <th className="px-3 py-2 font-medium">#</th>
                    <th className="px-3 py-2 font-medium">DIAS</th>
                    <th className="px-3 py-2 text-right font-medium">VALOR</th>
                    <th className="px-3 py-2 text-right font-medium">VP</th>
                  </tr>
                </thead>
                <tbody>
                  {result.installmentCalcs.map((i, idx) => (
                    <tr key={i.id} className="border-t border-border/40">
                      <td className="px-3 py-2 font-mono text-muted-foreground">{idx + 1}</td>
                      <td className="px-3 py-2 font-mono">{i.days}</td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">
                        {formatBRL(i.value)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums text-net-green">
                        {formatBRL(i.presentValue)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-3 font-mono text-[10px] leading-relaxed tracking-wider text-muted-foreground">
            Fórmula: VP = Valor / (1 + taxa)^(dias/30) · soma dos VPs = líquido.
          </p>
        </div>
      </div>
    </section>
  );
};
