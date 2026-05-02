## Problema

Eu apliquei `text-right` em mais elementos do que você pediu. Você pediu apenas para 4 labels específicos (linhas 11, 16, 27, 40 do `ResultPanels.tsx`), mas eu também alinhei à direita os valores numéricos (R$, %) e os textos do painel laranja "ECONOMIA FACTORING".

## Correção

Em `src/components/ResultPanels.tsx`, remover `text-right` dos elementos que NÃO estavam no seu pedido original, mantendo somente nos 4 labels que você selecionou:

**Manter `text-right` (seus 4 pedidos):**
- L11 — `VALOR LÍQUIDO`
- L16 — `VALOR DA NOTA FISCAL`
- L27 — `CUSTO DA OPERAÇÃO`
- L40 — `TAXA EFETIVA` (painel vermelho)

**Reverter (remover `text-right` que adicionei a mais):**
- L12 — valor numérico do `VALOR LÍQUIDO`
- L17 — valor numérico do `VALOR DA NOTA FISCAL`
- L28 — valor numérico do `CUSTO DA OPERAÇÃO`
- L41 — valor numérico da `TAXA EFETIVA` vermelha
- L53 — label `ECONOMIA FACTORING` (painel laranja)
- L54 — valor numérico do `ECONOMIA FACTORING`
- L66 — label `TAXA EFETIVA` (painel laranja)
- L67 — valor numérico da `TAXA EFETIVA` laranja

Resultado: os labels dos valores principais nas duas primeiras caixas (verde e vermelha) ficam alinhados à direita, e tudo o mais volta ao alinhamento original (esquerda). A caixa laranja fica intacta.