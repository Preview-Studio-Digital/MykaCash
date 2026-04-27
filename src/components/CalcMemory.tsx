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

  const rows = result.installmentCalcs.map((i) => {
    const cost = i.value - i.presentValue;
    const effectivePct = i.value > 0 ? (cost / i.value) * 100 : 0;
    return {
      id: i.id,
      dueDate: i.dueDate,
      days: i.days,
      value: i.value,
      presentValue: i.presentValue,
      cost,
      effectivePct,
    };
  });

  const totals = rows.reduce(
    (acc, r) => ({
      value: acc.value + r.value,
      presentValue: acc.presentValue + r.presentValue,
      cost: acc.cost + r.cost,
    }),
    { value: 0, presentValue: 0, cost: 0 }
  );

  const showTotals = rows.length > 1;
  const totalEffective = totals.value > 0 ? (totals.cost / totals.value) * 100 : 0;

  const columns = [
    "DATA DE VENCIMENTO",
    "DIAS",
    "VALOR BRUTO",
    "VALOR LÍQUIDO",
    "CUSTO",
    "TAXA EFETIVA",
  ];

  return (
    <section className="rounded-2xl border border-border/60 bg-gradient-card p-6 shadow-card animate-fade-up">
      <div className="mb-5 flex items-center gap-3">
        <span className="h-2 w-2 rounded-full bg-primary-glow animate-pulse-glow" />
        <h2 className="font-display text-xl font-semibold tracking-tight">Memória de cálculo</h2>
      </div>

      {/* Mobile: operation summary */}
      <div className="mb-2 grid grid-cols-3 gap-2 md:hidden">
        <div className="rounded-lg border border-border/40 bg-muted/20 p-2 text-center">
          <div className="font-mono text-[9px] tracking-widest text-muted-foreground">DATA OP.</div>
          <div className="font-mono text-xs">{fmtDate(operationDate)}</div>
        </div>
        <div className="rounded-lg border border-border/40 bg-muted/20 p-2 text-center">
          <div className="font-mono text-[9px] tracking-widest text-muted-foreground">TAXA MÊS</div>
          <div className="font-mono text-xs">{formatPct(monthlyRate)}</div>
        </div>
        <div className="rounded-lg border border-border/40 bg-muted/20 p-2 text-center">
          <div className="font-mono text-[9px] tracking-widest text-muted-foreground">PARCELAS</div>
          <div className="font-mono text-xs">{rows.length}</div>
        </div>
      </div>

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
            </div>
          </div>
        ))}

        {showTotals && (
          <div className="rounded-lg border border-primary-glow/50 bg-primary-glow/10 p-3 space-y-1 text-center">
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
            </div>
          </div>
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block rounded-lg border border-border/50">
        <table className="w-full table-fixed text-[11px]">
          <thead className="bg-muted/40 font-mono tracking-widest">
            <tr className="text-muted-foreground">
              <th className="px-2 py-2 text-center font-medium">DATA DA OPERAÇÃO</th>
              <th className="px-2 py-2 text-center font-medium">TAXA MENSAL</th>
              <th className="px-2 py-2 text-center font-medium">PARCELA</th>
              {columns.map((c) => (
                <th key={c} className="px-2 py-2 text-center font-medium">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => (
              <tr key={r.id} className="border-t border-border/40 font-mono tabular-nums text-center">
                <td className="px-2 py-2">{fmtDate(operationDate)}</td>
                <td className="px-2 py-2">{formatPct(monthlyRate)}</td>
                <td className="px-2 py-2">
                  {showTotals ? `${String(idx + 1).padStart(2, "0")} / ${rows.length}` : "ÚNICA"}
                </td>
                <td className="px-2 py-2">{fmtDate(r.dueDate)}</td>
                <td className="px-2 py-2">{r.days}</td>
                <td className="px-2 py-2">{formatBRL(r.value)}</td>
                <td className="px-2 py-2 text-net-green">{formatBRL(r.presentValue)}</td>
                <td className="px-2 py-2 text-cost-red">{formatBRL(r.cost)}</td>
                <td className="px-2 py-2">{formatPct(r.effectivePct)}</td>
              </tr>
            ))}

            {showTotals && (
              <tr className="border-t-2 border-primary-glow/50 bg-primary-glow/15 font-mono tabular-nums text-center font-semibold">
                <td className="px-2 py-2">—</td>
                <td className="px-2 py-2">—</td>
                <td className="px-2 py-2 tracking-widest text-primary-glow">TOTAL</td>
                <td className="px-2 py-2">—</td>
                <td className="px-2 py-2">—</td>
                <td className="px-2 py-2">{formatBRL(totals.value)}</td>
                <td className="px-2 py-2 text-net-green">{formatBRL(totals.presentValue)}</td>
                <td className="px-2 py-2 text-cost-red">{formatBRL(totals.cost)}</td>
                <td className="px-2 py-2">{formatPct(totalEffective)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
};
