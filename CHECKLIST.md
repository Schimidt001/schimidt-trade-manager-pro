
# Checklist e Mapeamento de Gaps — Projeto Schimidt Brain

Este documento detalha as tarefas a serem executadas, conforme as diretrizes fornecidas, e mapeia os gaps identificados no código-fonte atual que impedem o funcionamento correto do pipeline de `TICK`.

---

## 1. Missão Principal: Implementar o TICK COMPLETO

O objetivo é corrigir o pipeline do endpoint `/ops/tick` para que ele execute a sequência completa: MCL → Brains → Intent Arbitration → Portfolio Manager → Executor Simulator → Ledger.

| ID | Tarefa | Status | Gap Identificado e Análise | Arquivos Relevantes |
|:---|:---|:---|:---|:---|
| 1.1 | **Market Context Layer (MCL)** | ✅ **Completo** | O sistema já gera `MCL_SNAPSHOT` por símbolo. A função `computeMarketContext` é chamada corretamente no início do `runTick`. | `decisionEngine.ts`, `core/mcl/computeMarketContext.ts` |
| 1.2 | **Execução dos Brains** | ❌ **Incompleto** | **GAP CENTRAL:** O `decisionEngine.ts` executa os Brains e o Portfolio Manager (PM) *dentro* do mesmo loop. Para cada `snapshot` de símbolo, ele itera, gera um `intent` e imediatamente o envia para o PM. Isso viola a diretriz de "coletar intents dos brains" antes de passá-los ao PM. O pipeline está truncado conceitualmente. | `decisionEngine.ts`, `core/brains/index.ts` |
| 1.3 | **Intent Arbitration** | ❌ **Inexistente** | **GAP CENTRAL:** Não existe uma fase de "arbitragem" ou consolidação. O fluxo atual é `1 Símbolo → N Brains → N Intents → N Decisões`, em vez de `N Símbolos → M Intents → 1 Decisão Consolidada (ou N decisões sequenciais com estado de portfólio atualizado)`. A lógica precisa ser reestruturada para primeiro coletar *todos* os `BRAIN_INTENT`s de todos os brains e símbolos em uma única coleção. | `decisionEngine.ts`, `core/pm/portfolioManager.ts` |
| 1.4 | **Portfolio Manager (PM)** | ❌ **Incompleto** | O PM (`evaluateIntent`) está funcional, mas é chamado incorretamente (uma vez por `intent`, em vez de operar sobre uma coleção de `intents`). Além disso, ele usa um `defaultPortfolioState` mockado em cada chamada, o que significa que o estado de risco não é persistido ou atualizado entre as decisões dentro de um mesmo `tick`. | `decisionEngine.ts`, `core/pm/portfolioManager.ts` |
| 1.5 | **Executor Simulator** | ⚠️ **Pendente** | A lógica para chamar o `applyCommands` existe, mas como o pipeline não gera `decisions` corretas, ela nunca é alcançada. O `mapping.ts` que traduz `PmDecision` para `ExecutorCommand` parece incompleto e não lida com todos os tipos de `intent`. | `decisionEngine.ts`, `adapters/executor/mapping.ts`, `adapters/executor/executorSimulator.ts` |
| 1.6 | **Persistência no Ledger** | ✅ **Completo** | A infraestrutura para persistir eventos (`persistEvent`) e manter o `correlation_id` está implementada e parece correta. O problema é que os eventos de `BRAIN_INTENT` e `PM_DECISION` não estão sendo gerados para serem persistidos. | `decisionEngine.ts`, `services/ledgerService.ts`, `db/repos/ledgerRepo.ts` |

---

## 2. Correções de UX/Controle (Secundário)

| ID | Tarefa | Status | Gap Identificado e Análise | Arquivos Relevantes |
|:---|:---|:---|:---|:---|
| 2.1 | **ARM em G0** | ⚠️ **Pendente** | O comportamento atual (API retorna 409 e a UI exibe um erro) é funcional, mas a diretriz pede uma melhoria de UX. A opção **(a) Desabilitar o botão ARM em G0 com tooltip** é a mais clara e segura. Será implementada na UI. | `ui/src/components/cockpit/QuickActions.tsx`, `api/src/routes/ops.routes.ts` |
| 2.2 | **Clareza do DISARM** | ⚠️ **Pendente** | A UI já mostra o botão `DISARM` quando o sistema está `ARMED`, e vice-versa. A funcionalidade parece correta. A tarefa é garantir que o estado seja sempre refletido corretamente e que não haja confusão para o usuário. Uma revisão final da UI será feita após a correção do pipeline principal. | `ui/src/components/cockpit/GlobalStatusBar.tsx`, `ui/src/components/cockpit/QuickActions.tsx` |

---

## 3. Critérios de Aceite

| ID | Critério | Status | Verificação |
|:---|:---|:---|:---|
| 3.1 | `RUN TICK` gera `BRAIN_INTENT` e `PM_DECISION` | ❌ **Falha** | Atualmente, a UI mostra "0 intents, 0 decisions". |
| 3.2 | `/decisions/live` (SSE) mostra eventos completos | ❌ **Falha** | O stream SSE só mostra `MCL_SNAPSHOT` e `AUDIT_LOG`. |
| 3.3 | Cada tick gera `intents`, `decisão` e `trace` completo | ❌ **Falha** | O trace por `correlation_id` está incompleto. |
| 3.4 | `G0 → G1` continua bloqueado | ✅ **OK** | A lógica de gates parece estar funcionando como esperado. |
| 3.5 | Nenhuma feature nova adicionada | ✅ **OK** | O plano se restringe a corrigir o pipeline existente. |
| 3.6 | Nenhuma regressão | ⚠️ **Pendente** | A ser validado na fase de testes. |

---

## Plano de Ação

1.  **Refatorar `decisionEngine.ts`:**
    *   Separar o loop de geração de `MCL_SNAPSHOT` do resto do pipeline.
    *   Criar um novo loop que itera sobre os `snapshots` e os `brains` para gerar uma lista completa de `BRAIN_INTENT`s.
    *   Criar um terceiro loop que itera sobre a lista de `intents` e chama o `portfolioManager.evaluateIntent` para cada um, **mantendo e atualizando o estado do portfólio** entre as chamadas.
    *   Coletar todas as `PM_DECISION`s geradas.
2.  **Corrigir `portfolioManager.ts`:**
    *   Remover o uso do `getDefaultPortfolioState()` mockado e, em vez disso, receber o estado atual do portfólio como um parâmetro que evolui durante o `tick`.
3.  **Ajustar `mapping.ts`:**
    *   Garantir que as decisões `ALLOW` e `MODIFY` do PM sejam corretamente traduzidas em comandos para o `ExecutorSimulator`.
4.  **Implementar Correção de UX (ARM em G0):**
    *   Na UI (`QuickActions.tsx`), adicionar lógica para desabilitar o botão `ARM` se o `gate` for `G0`, exibindo um tooltip explicativo.
5.  **Testar e Validar:**
    *   Executar o `RUN TICK` e verificar se a UI e o `ledger` agora mostram `BRAIN_INTENT`s e `PM_DECISION`s para cada símbolo, cumprindo todos os critérios de aceite.
