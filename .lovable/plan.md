# Reorganização da navegação

## 1. Menu principal (`PageNav`)

- Remover o item **FINANCEIRO** (passa a viver dentro de Admin).
- Adicionar **ANÁLISES** apontando para `/analises`, ao lado de Cadastro e Histórico.
- Fixar o menu no topo durante a rolagem: envolver em um wrapper `sticky top-0 z-40` com fundo `bg-background/80 backdrop-blur-md` e uma borda inferior sutil para destacar quando estiver "grudado". O menu já é centralizado e continua assim.

## 2. Nova página `/analises`

- Criar `src/pages/Analises.tsx` com `AppHeader` + `PageNav` + um novo componente `AnalyticsSection`.
- Mover de `Historico.tsx` para esse novo componente as três seções de análise:
  - Painéis de resumo (médias/totais por período)
  - Gráfico Evolutivo
  - Análise de Compromisso e Saúde Financeira (consultor AI, alertas, score)
- Toda a lógica que alimenta essas seções (carregamento de invoices/eventos, `alertMetrics`, `chartData`, `aiRecommendation`, filtros de período) vai junto para o novo componente.
- `Historico.tsx` mantém: filtros, tabela de operações, diálogos de edição/liquidação, e o alerta de vencimentos no login.
- Rota adicionada em `App.tsx` dentro de `ProtectedRoute`.

## 3. Admin com menu lateral

- Refatorar `Admin.tsx` para usar um layout de duas colunas:
  - Sidebar à esquerda (sticky, ~220px no desktop, recolhível em mobile usando `Sheet`).
  - Conteúdo à direita.
- Itens do menu lateral:
  1. **Criar usuário** — formulário atual de criação.
  2. **Usuários existentes** — listagem atual.
  3. **Financeiro** — renderiza `<AccountCashFlow />`.
  4. **Configurações** — mantém aba atual (sons).
- Substituir as abas atuais por seleção via sidebar (`activeTab` passa a ter mais opções).

## 4. Rota `/financeiro`

- Remover do menu principal e do `App.tsx`. Acesso passa a ser via Admin (somente admins, como já era de fato).
- `Financeiro.tsx` pode ser apagado.

## Detalhes técnicos

- `AnalyticsSection` recebe `userId` via `useAuth` internamente; replica os mesmos `useEffect` de carga de dados de `Historico` (mesmas tabelas: `invoices`, `account_events`). Para não duplicar fetches quando o usuário visita as duas páginas em sequência, mantemos cada página com seu próprio fetch — simples e isolado.
- `PageNav` sticky: o `<main>` das páginas hoje começa com `py-4 md:py-6`; o sticky funciona porque o `<main>` é o container rolante natural (não há overflow no pai).
- Sidebar do Admin: usar componentes existentes (`Button` + `cn`), não introduzir `shadcn/sidebar` para evitar mudanças no shell global. Em mobile, um botão "MENU" abre um `Sheet` lateral com os mesmos itens.
- Sem mudanças de schema/backend.

## Arquivos afetados

- `src/components/PageNav.tsx` — itens + sticky.
- `src/pages/Historico.tsx` — remover seções de análise + estado/cálculos correlatos.
- `src/components/AnalyticsSection.tsx` — novo, contém análises.
- `src/pages/Analises.tsx` — novo.
- `src/pages/Admin.tsx` — layout com sidebar + integra `AccountCashFlow`.
- `src/App.tsx` — adiciona `/analises`, remove `/financeiro`.
- `src/pages/Financeiro.tsx` — removido.
