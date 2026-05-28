## Problema

No `src/pages/Historico.tsx`, o `range` para `period === "total"` é definido como `{ from: dataBounds.from, to: todayStr }` (linha 282). Isso faz sentido para filtros baseados em saldo/histórico, mas quebra o filtro **"a vencer"**:

```ts
if (statusFilter === "a_vencer") {
  return rows.filter((r) => !r.settled && inRange(r.dueDate));
}
```

Como `inRange` exige `dueDate <= today`, todas as parcelas com vencimento **futuro** (que é exatamente o que "a vencer" significa) são descartadas no período "total". Resultado: a lista vem vazia ou só com parcelas vencidas que ainda não foram liquidadas.

## Correção

Quando `statusFilter === "a_vencer"` e `period === "total"`, estender o limite superior do range até `dataBounds.to` (que já considera a maior `dueDate` cadastrada). Assim:

- "Total" + "a vencer" → mostra todas as parcelas não liquidadas com vencimento de hoje em diante até a última data cadastrada.
- Demais combinações continuam idênticas (nenhuma outra lógica é alterada).

### Mudança pontual

Em `Historico.tsx`, ajustar o `useMemo` do `range` (linhas 280-288) para considerar o filtro:

```ts
const range = useMemo(() => {
  const todayStr = todayISO();
  if (period === "total") {
    const to = statusFilter === "a_vencer" ? dataBounds.to : todayStr;
    return { from: dataBounds.from, to };
  }
  if (period === "mes") return { from: startOfMonthISO(), to: endOfMonthISO() };
  if (period === "semana") return { from: startOfWeekISO(), to: endOfWeekISO() };
  if (period === "data") return { from: from || todayStr, to: from || todayStr };
  return { from: from || todayStr, to: to || todayStr };
}, [period, from, to, todayStr, dataBounds, statusFilter]);
```

Adicionar `statusFilter` às dependências do `useMemo`.

## Verificação

- Período "total" + "a vencer" → lista parcelas com `dueDate >= hoje`.
- Período "total" + "todas"/"liquidadas"/"vencidas"/"andamento" → comportamento inalterado.
- Períodos "mês", "semana", "data", "período" + "a vencer" → comportamento inalterado (já respeitavam o intervalo escolhido).
