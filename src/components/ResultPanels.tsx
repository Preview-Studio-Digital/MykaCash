import { CalcResult, formatBRL, formatPct, FACTORING_MONTHLY_RATE_PCT } from "@/lib/calc";

export const ResultPanels = ({ result, monthlyRate }: { result: CalcResult; monthlyRate: number }) => {
  const factoringSavings = Math.max(0, result.factoringCost - result.operationCost);
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {/* Net value — green */}
      <div className="relative overflow-hidden rounded-xl bg-gradient-net p-4 text-net-green-foreground panel-glow-net animate-fade-up">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,255,255,0.25),transparent_60%)]" />
        <div className="relative">
          <div className="font-mono text-[9px] tracking-[0.3em] opacity-80 text-right">VALOR LÍQUIDO</div>
          <div className="mt-1 font-display text-xl md:text-2xl font-bold tabular-nums break-words text-right">
            {formatBRL(result.netValue)}
          </div>
          <div className="mt-3 h-px bg-white/20" />
          <div className="mt-3 font-mono text-[9px] tracking-[0.3em] opacity-80 text-right">VALOR DA NOTA FISCAL</div>
          <div className="mt-1 font-display text-base md:text-lg font-semibold tabular-nums text-right">
            {formatBRL(result.totalInvoice)}
          </div>
        </div>
      </div>

      {/* Operation cost — red */}
      <div className="relative overflow-hidden rounded-xl bg-gradient-cost p-4 text-cost-red-foreground panel-glow-cost animate-fade-up">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,255,255,0.25),transparent_60%)]" />
        <div className="relative">
          <div className="font-mono text-[9px] tracking-[0.3em] opacity-80 text-right">CUSTO DA OPERAÇÃO</div>
          <div className="mt-1 font-display text-xl md:text-2xl font-bold tabular-nums text-right">
            {formatBRL(result.operationCost)}
          </div>
          <div className="mt-3 h-px bg-white/20" />
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div>
              <div className="font-mono text-[9px] tracking-[0.3em] opacity-80">TAXA MENSAL</div>
              <div className="mt-0.5 font-display text-sm font-semibold tabular-nums">
                {formatPct(monthlyRate)}
              </div>
            </div>
            <div>
              <div className="font-mono text-[9px] tracking-[0.3em] opacity-80 text-right">TAXA EFETIVA</div>
              <div className="mt-0.5 font-display text-sm font-semibold tabular-nums text-right">
                {formatPct(result.effectiveRatePct)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Factoring savings — orange */}
      <div className="relative overflow-hidden rounded-xl bg-gradient-factoring p-4 text-white panel-glow-factoring animate-fade-up">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,255,255,0.25),transparent_60%)]" />
        <div className="relative">
          <div className="font-mono text-[9px] tracking-[0.3em] opacity-90">ECONOMIA FACTORING</div>
          <div className="mt-1 font-display text-xl md:text-2xl font-bold tabular-nums">
            {formatBRL(factoringSavings)}
          </div>
          <div className="mt-3 h-px bg-white/25" />
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div>
              <div className="font-mono text-[9px] tracking-[0.3em] opacity-90">TAXA MENSAL</div>
              <div className="mt-0.5 font-display text-sm font-semibold tabular-nums">
                {formatPct(FACTORING_MONTHLY_RATE_PCT)} a.m.
              </div>
            </div>
            <div>
              <div className="font-mono text-[9px] tracking-[0.3em] opacity-90">TAXA EFETIVA</div>
              <div className="mt-0.5 font-display text-sm font-semibold tabular-nums">
                {formatPct(result.factoringEffectiveRatePct)}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
