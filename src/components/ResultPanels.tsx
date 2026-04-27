import { CalcResult, formatBRL, formatPct } from "@/lib/calc";

export const ResultPanels = ({ result }: { result: CalcResult }) => {
  return (
    <div className="grid gap-5 md:grid-cols-3">
      {/* Net value — green */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-net p-6 text-net-green-foreground panel-glow-net animate-fade-up">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,255,255,0.25),transparent_60%)]" />
        <div className="relative">
          <div className="font-mono text-[10px] tracking-[0.3em] opacity-80">VALOR DA NOTA</div>
          <div className="mt-1 font-display text-2xl font-semibold tabular-nums">
            {formatBRL(result.totalInvoice)}
          </div>
          <div className="mt-6 h-px bg-white/20" />
          <div className="mt-4 font-mono text-[10px] tracking-[0.3em] opacity-80">VALOR LÍQUIDO A RECEBER</div>
          <div className="mt-1 font-display text-4xl font-bold tabular-nums">
            {formatBRL(result.netValue)}
          </div>
        </div>
      </div>

      {/* Operation cost — red */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-cost p-6 text-cost-red-foreground panel-glow-cost animate-fade-up">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,255,255,0.25),transparent_60%)]" />
        <div className="relative">
          <div className="font-mono text-[10px] tracking-[0.3em] opacity-80">CUSTO DA OPERAÇÃO</div>
          <div className="mt-1 font-display text-4xl font-bold tabular-nums">
            {formatBRL(result.operationCost)}
          </div>
          <div className="mt-6 h-px bg-white/20" />
          <div className="mt-4 font-mono text-[10px] tracking-[0.3em] opacity-80">TAXA EFETIVA</div>
          <div className="mt-1 font-display text-2xl font-semibold tabular-nums">
            {formatPct(result.effectiveRatePct)}
          </div>
        </div>
      </div>

      {/* Factoring — amber */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-factoring p-6 text-factoring-amber-foreground panel-glow-factoring animate-fade-up">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,255,255,0.3),transparent_60%)]" />
        <div className="relative">
          <div className="font-mono text-[10px] tracking-[0.3em] opacity-80">CUSTO COM FACTORING</div>
          <div className="mt-1 font-display text-4xl font-bold tabular-nums">
            {formatBRL(result.factoringCost)}
          </div>
          <div className="mt-6 h-px bg-black/15" />
          <div className="mt-4 font-mono text-[10px] tracking-[0.3em] opacity-80">
            TAXA DE REFERÊNCIA
          </div>
          <div className="mt-1 font-display text-2xl font-semibold tabular-nums">
            {formatPct(result.factoringMonthlyRatePct)} / mês
          </div>
        </div>
      </div>
    </div>
  );
};
