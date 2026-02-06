# @schimidt-brain/ui — Trade Manager Pro

UI cockpit institucional para operação, monitorização e auditoria do sistema de trading automatizado **Schimidt Brain**.

## Stack

| Tecnologia | Versão | Finalidade |
|---|---|---|
| Next.js (App Router) | 14.x | Framework React com SSR/CSR |
| TypeScript | 5.x | Tipagem estática |
| Tailwind CSS | 3.4.x | Estilização utility-first |
| shadcn/ui (Radix) | — | Componentes acessíveis |
| TanStack Query | 5.x | Data fetching + cache |
| Recharts | 2.x | Gráficos (quando necessário) |
| EventSource (SSE) | nativo | Stream de eventos em tempo real |

## Variáveis de Ambiente

Crie o ficheiro `.env.local` a partir do exemplo:

```bash
cp .env.local.example .env.local
```

| Variável | Obrigatória | Descrição |
|---|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | Sim | URL base da API (ex: `http://localhost:3000`) |

## API Key

A UI **não** armazena API keys em código. Ao abrir a aplicação, o utilizador é apresentado com um modal de autenticação (AuthGate) onde deve inserir:

1. **API Key** — enviada como `Authorization: Bearer <key>` em todas as requests
2. **Role** — define o nível de acesso na UI:
   - **Viewer**: apenas leitura (cockpit, logs, replay, config read-only)
   - **Operator**: pode ARM/DISARM/KILL e executar ações operacionais
   - **Admin**: acesso total, incluindo alteração de configurações

A key é armazenada em `sessionStorage` (apagada ao fechar o browser).

## Como Rodar Localmente

```bash
# Instalar dependências
cd apps/ui
pnpm install

# Configurar ambiente
cp .env.local.example .env.local
# Editar .env.local com a URL da API

# Rodar em modo desenvolvimento
pnpm dev

# Build de produção
pnpm build
pnpm start
```

A UI estará disponível em `http://localhost:3001` (ou a porta indicada pelo Next.js).

## Páginas e Finalidade

### `/cockpit` — Painel Central
Visão completa em tempo real do sistema. Três colunas:
- **Coluna A**: Market Context (MCL), Timeline/Checkpoints, Execution Quality
- **Coluna B**: Controles (ARM/DISARM/KILL com confirmação, Quick Actions)
- **Coluna C**: Brain Cards (A2, B3, C3, D2) com status, budget, últimas decisões e botão Explain

Header fixo com: ARM state, Gate (G0-G3), Global Mode, Execution State, Provider status, Executor status.

### `/decisions/live` — Stream de Decisões
Stream em tempo real via SSE com:
- Filtros: symbol, brain_id, severity, reason_code
- Cada evento com payload colapsável (JsonCollapse)
- Click no correlation_id abre TraceDrawer com toda a cadeia de eventos

### `/logs` — Logs Organizados
Logs organizados por stream (tabs):
- **Decision**: intents, PM decisions, MCL
- **Execution**: EHM actions, executor events
- **System**: config changes, ops events
- **Security**: auth, audit, errors

### `/replay` — Análise Forense
- Lista de dias disponíveis com status (complete/partial)
- `/replay/:date` — timeline interativa + inspector de eventos
- Export JSON de qualquer dia

### `/calendar` — Eventos Económicos
- Eventos do dia com hora, impacto, moeda, previous/forecast/actual
- Janelas de trading (NO_TRADE, CONDITIONAL)
- Status dos provedores de dados

### `/risk/exposure` — Exposição e Limites
- Barras de exposição por moeda com caps visuais
- Tabela por cluster com alertas "Near Cap" / "Over Cap"

### `/ops/health` — Status de Infraestrutura
- API health, Gate, SSE status, Executor connectivity
- Provider status detalhado
- Últimos erros do sistema

### `/config/*` — Configuração com Guardrails
Cinco sub-páginas: Playbook, Brains, Exposure, News, Safety.

Cada uma com:
- Editor JSON com DiffPreview (before/after)
- ReasonField obrigatório (audit trail)
- ApplyModeSelector (NEXT_WINDOW, NEXT_CYCLE, IMMEDIATE)
- **Guardrail**: se ARMED, modo IMMEDIATE bloqueado
- **Guardrail**: se role Viewer, configuração read-only

### `/admin/users` — Gestão de Utilizadores (Placeholder)
Placeholder RBAC com tabela de utilizadores e descrição de roles.

## SSE (Tempo Real)

A UI conecta automaticamente em `GET /stream/events` via EventSource:
- Reconexão automática com backoff exponencial (1s → 30s max)
- Banner "Realtime disconnected" quando SSE falha
- UI continua funcional via REST polling (TanStack Query refetchInterval)

## Segurança / Guardrails

- Ações críticas (ARM/DISARM/KILL) exigem digitação do comando + motivo
- Configurações exigem motivo obrigatório (mínimo 5 caracteres)
- Modo IMMEDIATE bloqueado quando sistema está ARMED
- Role Viewer: todos os botões de ação e edição desabilitados
- API key nunca em código, apenas em sessionStorage

## Estrutura de Ficheiros

```
apps/ui/
  src/
    app/
      cockpit/page.tsx
      decisions/live/page.tsx
      logs/page.tsx
      replay/page.tsx
      replay/[date]/page.tsx
      calendar/page.tsx
      risk/exposure/page.tsx
      ops/health/page.tsx
      config/{playbook,brains,exposure,news,safety}/page.tsx
      config/layout.tsx
      admin/users/page.tsx
      layout.tsx
      template.tsx
      providers.tsx
      globals.css
      page.tsx
    components/
      layout/{AppShell,TopBar,SideNav}.tsx
      cockpit/{GlobalStatusBar,MarketContextCard,ExecutionQualityCard,TimelineCard,BrainCard,QuickActions}.tsx
      stream/{EventStream,TraceDrawer,FiltersBar}.tsx
      logs/{LogsViewer,StreamTabs}.tsx
      replay/{ReplayDayList,ReplayTimeline,ReplayEventInspector}.tsx
      config/{ConfigForm,DiffPreview,ApplyModeSelector,ReasonField}.tsx
      common/{Badge,ConfirmActionModal,JsonCollapse,CopyButton,AlertBanner}.tsx
    lib/
      api.ts        # Cliente HTTP central
      sse.ts        # Cliente SSE com reconnect
      auth.ts       # API key + roles
      format.ts     # Formatadores (time, date, severity)
      validators.ts # Validações de UI
      utils.ts      # cn() helper
  package.json
  tsconfig.json
  next.config.js
  tailwind.config.ts
  postcss.config.js
  README.md
```
