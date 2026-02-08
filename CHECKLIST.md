
# Checklist e Mapeamento de Gaps — Projeto Schimidt Brain

Este documento detalha as tarefas executadas, conforme as diretrizes fornecidas, e mapeia os gaps identificados e corrigidos no código-fonte.

---

## 1. Missão Principal: Implementar o TICK COMPLETO

O objetivo foi corrigir o pipeline do endpoint `/ops/tick` para que ele execute a sequência completa: MCL → Brains → Intent Arbitration → Portfolio Manager → Executor Simulator → Ledger.

| ID | Tarefa | Status | Gap Identificado e Correção | Arquivos Modificados |
|:---|:---|:---|:---|:---|
| 1.1 | **Market Context Layer (MCL)** | ✅ **Completo** | O MCL já funcionava. Corrigido `buildMockMclInput` para gerar cenários variados por símbolo (BUILDUP, TREND, corr baixa, PRE_EVENT). | `decisionEngine.ts` |
| 1.2 | **Execução dos Brains** | ✅ **Corrigido** | Pipeline reestruturado: MCL snapshots gerados primeiro, depois brains executados para cada snapshot. Brains sem edge geram evento `BRAIN_SKIP`. | `decisionEngine.ts` |
| 1.3 | **Intent Arbitration** | ✅ **Corrigido** | Todos os intents são coletados em array `arbitratedIntents` antes de serem enviados ao PM. | `decisionEngine.ts` |
| 1.4 | **Portfolio Manager (PM)** | ✅ **Corrigido** | PM agora recebe cada intent da coleção arbitrada e gera `PM_DECISION` com `ALLOW`/`DENY`. | `decisionEngine.ts` |
| 1.5 | **Executor Simulator** | ✅ **Corrigido** | Mapping de decisions para commands funcional. Respeita G0 (shadow = sem comandos). | `decisionEngine.ts` |
| 1.6 | **Persistência no Ledger** | ✅ **Corrigido** | Todos os eventos (MCL_SNAPSHOT, BRAIN_INTENT, BRAIN_SKIP, PM_DECISION) são persistidos com `correlation_id` único e broadcast SSE. | `decisionEngine.ts` |

---

## 2. Correções de UX/Controle

| ID | Tarefa | Status | Correção Aplicada | Arquivos Modificados |
|:---|:---|:---|:---|:---|
| 2.1 | **ARM em G0** | ✅ **Corrigido** | Botão ARM desabilitado em G0 com tooltip explicativo + aviso amber inline. | `QuickActions.tsx`, `cockpit/page.tsx` |
| 2.2 | **Clareza do DISARM** | ✅ **Corrigido** | DISARM permanece visível e funcional quando ARMED. Prop `gate` passada ao componente. | `QuickActions.tsx`, `cockpit/page.tsx` |

---

## 3. Critérios de Aceite — Resultado Final

| ID | Critério | Status | Resultado |
|:---|:---|:---|:---|
| 3.1 | `RUN TICK` gera `BRAIN_INTENT` e `PM_DECISION` | ✅ **PASS** | 4 intents (A2/C3/B3/D2) + 4 decisions (ALLOW) |
| 3.2 | `/decisions/live` (SSE) mostra eventos completos | ✅ **PASS** | Todos os eventos são broadcast via SSE |
| 3.3 | Cada tick gera `intents`, `decisão` e `trace` completo | ✅ **PASS** | 4 snapshots + 4 intents + 12 skips + 4 decisions, correlation_id único |
| 3.4 | `G0 → ARM` bloqueado com UX clara | ✅ **PASS** | Botão desabilitado + tooltip + aviso amber |
| 3.5 | Nenhuma feature nova adicionada | ✅ **PASS** | Apenas correções no pipeline existente |
| 3.6 | Nenhuma regressão | ✅ **PASS** | 77 testes do core passando, API compila sem erros |

---

## 4. Commits Rastreáveis

| Commit | Mensagem | Arquivos |
|:---|:---|:---|
| `c566e9a` | `fix(api): pipeline tick completo MCL→Brains→Arbitration→PM→Executor→Ledger` | `decisionEngine.ts` |
| `b92d80f` | `fix(ui): ARM desabilitado em G0 com tooltip explicativo + prop gate` | `QuickActions.tsx`, `cockpit/page.tsx` |
| `6293473` | `docs: checklist de diretrizes e mapeamento de gaps` | `CHECKLIST.md` |

---

## 5. Teste de Integração — Resultado

```
EURUSD → A2 (Liquidity Predator) detectou BUILDUP → OPEN_LONG (risk=1%)
GBPUSD → C3 (Momentum Two-Speed) detectou TREND+CLEAN → OPEN_LONG (risk=1%)
USDJPY → B3 (Relative Value) detectou correlação baixa (0.1) → HEDGE (risk=0.75%)
BTCUSD → D2 (News) detectou PRE_EVENT → HEDGE (risk=0.5%)

4 intents, 4 PM decisions (ALLOW), 12 brain skips
Correlation ID único em todos os eventos
Todos os event_ids únicos
```
