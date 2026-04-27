import { CalcResult, formatBRL, formatPct, FACTORING_MONTHLY_RATE_PCT } from "@/lib/calc";

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

  const rFactoring = FACTORING_MONTHLY_RATE_PCT / 100;

  // Per-installment breakdown as if each were an individual operation
  const rows = result.installmentCalcs.map((i) => {
    const cost = i.value - i.presentValue;
    const effectivePct = i.value > 0 ? (cost / i.value) * 100 : 0;
    const factoringCost = i.value * rFactoring * (i.days / 30);
    return {
      id: i.id,
      dueDate: i.dueDate,
      days: i.days,
      value: i.value,
      presentValue: i.presentValue,
      cost,
      effectivePct,
      factoringCost,
    };
  });

  const totals = rows.reduce(
    (acc, r) => ({
      value: acc.value + r.value,
      presentValue: acc.presentValue + r.presentValue,
      cost: acc.cost + r.cost,
      factoringCost: acc.factoringCost + r.factoringCost,
    }),
    { value: 0, presentValue: 0, cost: 0, factoringCost: 0 }
  );

  const showTotals = rows.length > 1;
  const totalEffective = totals.value > 0 ? (totals.cost / totals.value) * 100 : 0;

  const columns = [
    "DATA DE VENCIMENTO",
    "DIAS",
    "VALOR",
    "VP (LÍQUIDO)",
    "CUSTO",
    "TAXA EFETIVA",
    `FACTORING (${formatPct(FACTORING_MONTHLY_RATE_PCT)}/mês)`,
  ];

  return (
    <section className="rounded-2xl border border-border/60 bg-gradient-card p-6 shadow-card animate-fade-up">
      <div className="mb-5 flex items-center gap-3">
        <span className="h-2 w-2 rounded-full bg-primary-glow animate-pulse-glow" />
        <h2 className="font-display text-xl font-semibold tracking-tight">Memória de cálculo</h2>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-x-6 gap-y-1 font-mono text-[10px] tracking-[0.25em] text-muted-foreground">
        <span>DATA OPERAÇÃO · {fmtDate(operationDate)}</span>
        <span>TAXA MENSAL · {formatPct(monthlyRate)}</span>
        <span>PARCELAS · {rows.length}</span>
      </div>

      {/* Mobile cards */}
      <div className="space-y-2 md:hidden">
        {rows.map((r, idx) => (
          <div
            key={r.id}
            className="rounded-lg border border-border/40 bg-muted/20 p-3 space-y-1 text-center"
          >
            <div className="font-mono text-[10px] tracking-widest text-muted-foreground">
              {showTotals ? `P ${String(idx + 1).padStart(2, "0")}` : "PARCELA ÚNICA"}
            </div>
            <div className="font-mono text-[10px] tracking-widest text-muted-foreground">
              DATA DE VENCIMENTO
            </div>
            <div className="font-mono text-xs">{fmtDate(r.dueDate)} · {r.days} dias</div>
            <div className="grid grid-cols-2 gap-2 pt-2 font-mono text-xs tabular-nums">
              <div>
                <div className="text-[9px] tracking-widest text-muted-foreground">VALOR</div>
                <div>{formatBRL(r.value)}</div>
              </div>
              <div>
                <div className="text-[9px] tracking-widest text-muted-foreground">VP</div>
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
              <div className="col-span-2">
                <div className="text-[9px] tracking-widest text-muted-foreground">FACTORING</div>
                <div>{formatBRL(r.factoringCost)}</div>
              </div>
            </div>
          </div>
        ))}

        {showTotals && (
          <div className="rounded-lg border border-primary/40 bg-primary/5 p-3 space-y-1 text-center">
            <div className="font-mono text-[10px] tracking-widest text-primary-glow">
              TOTAIS
            </div>
            <div className="grid grid-cols-2 gap-2 pt-1 font-mono text-xs tabular-nums">
              <div>
                <div className="text-[9px] tracking-widest text-muted-foreground">VALOR</div>
                <div>{formatBRL(totals.value)}</div>
              </div>
              <div>
                <div className="text-[9px] tracking-widest text-muted-foreground">VP</div>
                <div className="text-net-green">{formatBRL(totals.presentValue)}</div>
              </div>
              <div>
                <div className="text-[9px] tracking-widest text-muted-foreground">CUSTO</div>
                <div className="text-cost-red">{formatBRL(totals.cost)}</div>
              </div>
              <div>
                <div className="text-[9px] tracking-widest text-muted-foreground">TAXA EF.</div>
                <div>{formatPct(totalEffective)}</div>
              </div>
              <div className="col-span-2">
                <div className="text-[9px] tracking-widest text-muted-foreground">FACTORING</div>
                <div>{formatBRL(totals.factoringCost)}</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto rounded-lg border border-border/50">
        <table className="w-full text-xs whitespace-nowrap">
          <thead className="bg-muted/40 font-mono tracking-widest">
            <tr className="text-muted-foreground">
              <th className="px-3 py-2 text-center font-medium">#</th>
              {columns.map((c) => (
                <th key={c} className="px-3 py-2 text-center font-medium">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => (
              <tr key={r.id} className="border-t border-border/40 font-mono tabular-nums text-center">
                <td className="px-3 py-2">
                  {showTotals ? String(idx + 1).padStart(2, "0") : "ÚNICA"}
                </td>
                <td className="px-3 py-2">{fmtDate(r.dueDate)}</td>
                <td className="px-3 py-2">{r.days}</td>
                <td className="px-3 py-2">{formatBRL(r.value)}</td>
                <td className="px-3 py-2 text-net-green">{formatBRL(r.presentValue)}</td>
                <td className="px-3 py-2 text-cost-red">{formatBRL(r.cost)}</td>
                <td className="px-3 py-2">{formatPct(r.effectivePct)}</td>
                <td className="px-3 py-2">{formatBRL(r.factoringCost)}</td>
              </tr>
            ))}

            {showTotals && (
              <tr className="border-t-2 border-primary/40 bg-primary/5 font-mono tabular-nums text-center font-semibold">
                <td className="px-3 py-2 tracking-widest text-primary-glow">TOTAL</td>
                <td className="px-3 py-2">—</td>
                <td className="px-3 py-2">—</td>
                <td className="px-3 py-2">{formatBRL(totals.value)}</td>
                <td className="px-3 py-2 text-net-green">{formatBRL(totals.presentValue)}</td>
                <td className="px-3 py-2 text-cost-red">{formatBRL(totals.cost)}</td>
                <td className="px-3 py-2">{formatPct(totalEffective)}</td>
                <td className="px-3 py-2">{formatBRL(totals.factoringCost)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-center font-mono text-[10px] leading-relaxed tracking-wider text-muted-foreground">
        Fórmula: VP = Valor / (1 + taxa)^(dias/30) · Custo = Valor − VP · soma dos VPs = líquido total.
      </p>
    </section>
  );
};
