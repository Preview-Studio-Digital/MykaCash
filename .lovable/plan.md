## Problema
- O quadro "Score de Saúde" classifica o risco em **BAIXO / MODERADO / ALTO / CRÍTICO** (baseado em `scoreNumeric` 0–100).
- O Consultor AI abaixo classifica o tom em **positivo / atenção / crítico** usando outra fórmula (`sumTier` de 4 indicadores).
- Como as duas escalas são independentes, o quadro pode mostrar risco "ALTO" enquanto o texto diz "saúde financeira positiva" (ou vice-versa).

## Correção em `src/pages/Historico.tsx`
1. Passar `riskLevel` de `alertMetrics` para dentro do `useMemo` do `advisorRecommendation` e derivar o tom **direto do mesmo `scoreNumeric`** que define o quadro:
   - `scoreNumeric ≥ 75` → tom "up" (BAIXO)
   - `50–74` → tom "warn" (MODERADO)
   - `25–49` → tom "alert" (ALTO) — novo nível intermediário
   - `< 25` → tom "down" (CRÍTICO)
2. Trocar o `headline` para refletir o risco do quadro: "Saúde financeira positiva" / "Risco moderado" / "Risco alto" / "Risco crítico".
3. Ajustar os textos de abertura, diagnóstico e ação para cobrir os 4 tons (adicionar variações para "alert"), removendo frases que digam "zona positiva" quando o risco é alto/crítico.
4. Recalcular sempre que houver nova operação/liquidação: já funciona hoje via `useMemo([globalStats])` que depende de `rows` (recarregado após cadastrar/editar/liquidar). Vou confirmar que `rows` é atualizado após essas ações — se algum caminho estiver faltando refetch, adicionar.

## Resultado
Score card e Consultor AI passam a usar a mesma escala e vocabulário, e o texto muda automaticamente a cada nova operação aberta ou liquidada.