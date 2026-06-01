# Alertas sonoros para cadastro/edição de operações

## Comportamento

1. Ao abrir a tela de confirmação (clique em "CADASTRAR E EXPORTAR" / "SALVAR ALTERAÇÕES"): toca **som de aviso** ("alerta").
2. Ao confirmar de fato a operação (salvar nova OU edição com sucesso): toca **som de sucesso**.
3. Se o áudio falhar (autoplay bloqueado, etc.), não quebra o fluxo — apenas ignora silenciosamente.

## Sons (biblioteca livre)

Adicionar 4–5 opções curtas (<2s) para cada categoria, hospedadas localmente em `public/sounds/`:

- **Aviso/Confirmação aberta**: `chime-soft.mp3`, `ding.mp3`, `pop.mp3`, `notify.mp3`
- **Sucesso**: `success-bell.mp3`, `cash-register.mp3`, `success-chord.mp3`, `level-up.mp3`

Fonte: Pixabay/Mixkit (royalty-free). Baixados via `curl` na fase de build.

## Seleção pelo usuário

Nova página **`/configuracoes`** (link no `AppHeader`, ícone engrenagem) com:

- Toggle "Ativar alertas sonoros" (default: ligado)
- Slider de volume (0–100%, default 70%)
- Para cada categoria (Confirmação / Sucesso): `Select` com a lista de sons + botão ▶ para pré-ouvir
- Botão "Restaurar padrões"
- Preferências salvas em `localStorage` (chave `mikacash:sound-prefs`) — sem necessidade de backend

## Implementação técnica

**`src/lib/sounds.ts`** (novo):
- Catálogo dos arquivos: `SOUND_CATALOG = { confirm: [...], success: [...] }`
- Hook `useSoundPrefs()` → lê/grava no localStorage
- `playSound(kind: "confirm" | "success")` → instancia `new Audio(url)`, aplica volume, `play().catch(()=>{})`

**`src/pages/Configuracoes.tsx`** (novo): UI do seletor + pré-escuta.

**`src/App.tsx`**: registrar rota `/configuracoes`.

**`src/components/AppHeader.tsx`**: adicionar link "Configurações" (ícone `Settings` do lucide).

**`src/components/RegistrationSection.tsx`**:
- Em `handleOpenConfirm` (após validação bem-sucedida, antes/junto de abrir dialog): `playSound("confirm")`.
- No fim de `handleSaveInvoice`, após salvar com sucesso (tanto criação quanto edição): `playSound("success")`.

## Fora do escopo

- Não há mudança de backend, schema ou RLS.
- Sons são estáticos no bundle (não há upload pelo usuário neste plano — pode ser adicionado depois).
