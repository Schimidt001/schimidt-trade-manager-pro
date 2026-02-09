# Scenario Controller — Mapa de Implementação

## Arquitectura Actual

```
RUN TICK (UI) → POST /ops/tick { symbols } → runTick()
  → buildMockMclInput(symbol) → computeMarketContext(input) → MclSnapshot
  → BRAIN_REGISTRY.forEach(brain => brain(snapshot)) → BrainIntent | null
  → evaluateIntent(intent) → PmDecision
  → persistEvent() → ledger_events
  → Replay lê de ledger_events
```

## Ficheiros a Alterar

| Ficheiro | Alteração |
|----------|-----------|
| `apps/api/src/services/decisionEngine.ts` | Aceitar `scenario` em `TickInput`, aplicar perfil ao `buildMockMclInput` |
| `apps/api/src/routes/ops.routes.ts` | Aceitar `scenario` no body, validar gate G0/G1 |
| `apps/ui/src/components/cockpit/QuickActions.tsx` | Dropdown de cenário, esconder em G2+ |

## Ficheiros Novos

| Ficheiro | Propósito |
|----------|-----------|
| `apps/api/src/config/scenarioProfiles.ts` | Definições dos 7 cenários + AUTO |

## Cenários e Perfis Esperados

| Cenário | structure | volatility | liquidity | event_proximity | Brain esperado |
|---------|-----------|------------|-----------|-----------------|----------------|
| AUTO | (actual) | (actual) | (actual) | (actual) | Depende do símbolo |
| RANGE | RANGE | NORMAL | BUILDUP | NONE | A2 (Liquidity Predator) |
| TREND_CLEAN | TREND | NORMAL | CLEAN | NONE | C3 (Momentum) |
| HIGH_VOL | TRANSITION | HIGH | CLEAN | NONE | Nenhum (todos bloqueiam) |
| PRE_NEWS | RANGE | NORMAL | CLEAN | PRE_EVENT | D2 (News) — A2 bloqueia |
| POST_NEWS | RANGE | NORMAL | CLEAN | POST_EVENT | D2 (News) |
| LOW_LIQUIDITY | RANGE | LOW | BUILDUP | NONE | A2 (com vol LOW) |
| STRESS | TRANSITION | HIGH | RAID | PRE_EVENT | D2 hedge (se possível) |

## Regras Duras

1. Cenário NÃO persiste após o tick
2. Cenário NÃO altera config global
3. Cenário NÃO existe em G2+
4. Replay DEVE registrar `"scenario": "PRE_NEWS"` no payload
5. Em G2+, seletor some da UI
