# Mapa de Implementação — Fase G0 → G1

## Análise de Gaps

### BLOCO A — Replay Diário Funcional
**Backend:**
- `GET /replay/days` — EXISTE (listReplayDaysWithCounts)
- `GET /replay/:date` — EXISTE (getReplayDayFull) mas retorna JSON cru
- **FALTA:** Endpoint que retorna narrativa do dia com timeline agrupada
- **FALTA:** Endpoint que retorna explicação de "não ação" por brain
- **FALTA:** Agrupamento por dia com timeline sequencial com horário
- **FALTA:** Identificação clara de qual cérebro atuou, por que atuou, por que outros não atuaram

**Frontend:**
- `ReplayTimeline.tsx` — EXISTE mas mostra apenas lista técnica de eventos
- `ReplayEventInspector.tsx` — EXISTE mas mostra JSON cru
- `ReplayDayList.tsx` — EXISTE
- **FALTA:** Narrativa do dia (história, não log)
- **FALTA:** Timeline visual com formato: `04:00 — MCL: TRANSITION / CLEAN`
- **FALTA:** Seção "Por que não operamos" no replay
- **FALTA:** Resumo do dia (day summary narrative)

### BLOCO B — Gate Promotion Oficial
**Backend:**
- `POST /ops/gate/promote` — EXISTE com validação de pré-requisitos
- **OK:** RBAC (admin), validação sequencial, 409 com reason_code
- **FALTA:** Validação de replay existente como pré-requisito

**Frontend:**
- **FALTA:** Painel Gate Promotion no cockpit
- **FALTA:** Checklist visual de validação
- **FALTA:** Botão "Promote to G1"
- **FALTA:** Modal de confirmação com texto claro
- **FALTA:** Feedback humano se bloqueado

### BLOCO C — Explicação de Não Operação
**Backend:**
- **FALTA:** Endpoint dedicado para "por que não operamos"
- Os dados existem nos BRAIN_SKIP events, mas não há agregação

**Frontend:**
- **FALTA:** Painel "Por que não operamos" no cockpit
- **FALTA:** Exemplos narrativos: "Nenhum cérebro encontrou edge", etc.

### Erro API 400 Genérico
- `PUT /config` permite alterar gate via config (linha 102-104 config.routes.ts)
- **DEVE:** Bloquear alteração de gate via config e direcionar para /ops/gate/promote
- **DEVE:** Retornar reason_code específico, nunca 400 genérico
