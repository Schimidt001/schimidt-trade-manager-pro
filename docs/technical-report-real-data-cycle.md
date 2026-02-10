# Relatório Técnico: Fechamento do Ciclo de Dados Reais

**Autor:** Manus AI
**Data:** 09 de fevereiro de 2026
**Status:** Concluído

## 1. Resumo Executivo

Este relatório detalha a auditoria e as correções implementadas no projeto Schimidt Brain para fechar o ciclo de dados reais, eliminando dependências de dados mock e fallbacks silenciosos. O trabalho seguiu rigorosamente as diretrizes institucionais, garantindo que o pipeline de decisão opere exclusivamente com dados reais ou entre em estado de risco controlado (RISK_OFF) na ausência deles. Todas as correções foram implementadas cirurgicamente no pacote `apps/api`, especificamente no `decisionEngine.ts`, sem alterar a lógica de negócio dos cérebros, do Portfolio Manager (PM) ou do core do sistema.

## 2. Fluxo de Dados Validado

O pipeline de decisão foi validado e sua integridade confirmada. O fluxo de dados segue a arquitetura obrigatória, sem desvios:

```mermaid
graph TD
    A[Fontes de Dados Reais] --> B(Market & News Providers);
    B --> C{API Service};
    C --> D[MCL - Market Context Layer];
    D --> E{Brains (A2, B3, C3, D2)};
    E --> F[Portfolio Manager];
    F --> G[Executor Adapter];
    G --> H(Plataforma Externa);
    C --> I(Ledger & Replay Service);
    D --> I;
    E --> I;
    F --> I;
```

- **Dados Reais**: O sistema agora consome exclusivamente dados do Market Data Provider (cTrader) e do News Provider (Trading Economics/Finnhub).
- **Sem Fallback Silencioso**: A falha na obtenção de dados de mercado resulta em um estado de **RISK_OFF** e no aborto do ciclo (tick), em vez de um fallback para dados mock.
- **Rastreabilidade**: Todos os eventos, decisões e mudanças de estado são persistidos no Ledger (PostgreSQL) com um `correlation_id` único, garantindo auditoria completa.

## 3. Auditoria e Correções Implementadas

A auditoria inicial revelou quatro pontos críticos que violavam as diretrizes. Todos foram corrigidos.

| Problema Identificado | Causa Raiz | Correção Implementada |
| :--- | :--- | :--- |
| **1. Fallback Silencioso para Mock** | O `decisionEngine.ts` continha um bloco `try/catch` que, em caso de falha do `fetchMultipleMarketData`, ativava o modo mock (`setMockMode(true)`). | O bloco `catch` foi reescrito para **ativar o RISK_OFF** (`setRiskOff(true)`), registrar um evento `RISK_OFF_ACTIVATED` no ledger e **abortar o tick imediatamente**. O fallback para mock foi removido. |
| **2. Símbolo Individual sem Dados** | Se um único símbolo falhasse no `fetchMultipleMarketData`, o `decisionEngine.ts` utilizava `buildMockMclInput` para aquele símbolo. | A lógica foi alterada para **excluir o símbolo do tick atual**. Um evento de `MCL_SNAPSHOT` com status `EXCLUDED` é registrado no ledger para rastreabilidade, mas nenhum dado mock é gerado. |
| **3. News Provider Não Integrado** | O `decisionEngine.ts` passava um valor fixo (`EventProximity.NONE`) para o `buildRealMclInput`, ignorando o `calendarService` existente. | O `calendarService` foi integrado no início do `runTick`. Agora, o `getDayCalendar()` é chamado, as `computeEventWindows()` são calculadas, e a função `resolveEventProximity()` determina o estado de proximidade de evento real para cada símbolo. |
| **4. `DATA_DEGRADED` Não Propagado** | O `evaluateDataQuality` no `fetchCandles.ts` identificava dados degradados, mas o `decisionEngine.ts` não utilizava essa informação. | Uma nova função, `resolveDataQualityHealth`, foi adicionada ao `decisionEngine.ts`. Ela utiliza o `evaluateDataQuality` do adapter e mapeia o status `DEGRADED` para `ExecutionHealth.DEGRADED` no `MclInput`, informando o core do sistema sobre a baixa qualidade dos dados. |

## 4. Mapeamento: REAL vs. MOCK vs. PLACEHOLDER

O estado atual do sistema, após as correções, é o seguinte:

| Componente | Status | Justificativa |
| :--- | :--- | :--- |
| **Market Data Provider** | **REAL** | Conecta-se à API do cTrader para obter candles OHLC em tempo real. Não há mais fallbacks para dados mock. |
| **News Provider** | **REAL** | Utiliza o `calendarService` para buscar eventos econômicos das APIs do Trading Economics e Finnhub. As chaves de API são lidas das variáveis de ambiente. |
| **MCL (Market Context Layer)** | **REAL** | Processa os dados **reais** dos providers para gerar o contexto de mercado. |
| **Brains (A2, B3, C3, D2)** | **REAL** | A lógica de decisão dos cérebros permanece inalterada e agora opera sobre o contexto de mercado **real**. |
| **Portfolio Manager (PM)** | **REAL** | Governa o risco e arbitra as intenções dos cérebros com base em dados **reais**. |
| **Executor (Shadow Mode)** | **REAL** | A execução é **simulada**, mas as decisões que a originam são baseadas em dados e lógica **reais**. Os comandos gerados são persistidos no ledger como `EXEC_SIMULATED_COMMAND`. |
| **Ledger & Replay** | **REAL** | O banco de dados PostgreSQL armazena todos os eventos gerados pelo pipeline real, garantindo replays 100% auditáveis e fiéis ao que ocorreu. |
| **Test Scenarios (G0/G1)** | **MOCK** | O uso de cenários de teste (`scenario != "AUTO"`) ativa intencionalmente o `buildMockMclInput`. Este é o **único** local onde dados mock são utilizados, e seu uso é restrito aos gates G0/G1, registrado no ledger e explicitamente acionado pelo operador. |

## 5. Evidências e Conclusão

As correções garantem que o sistema opere com um nível institucional de robustez e rastreabilidade. O fallback silencioso para dados mock foi completamente erradicado, e a integração dos providers de dados de mercado e notícias está completa.

Como evidência, o arquivo `replay_real_evidence.json` em anexo demonstra um ciclo de decisão (`tick`) onde:
1. O Market Data Provider falha, acionando um evento `RISK_OFF_ACTIVATED`.
2. Em um segundo ciclo, o News Provider identifica um evento de alto impacto, resultando em `EventProximity.PRE_EVENT`.
3. O cérebro D2 gera uma intenção de `NO_TRADE` devido ao risco do evento, que é acatada pelo PM.

O sistema está em conformidade com todas as diretrizes da tarefa. O próximo passo recomendado é a promoção para o gate G1 (Paper Trading) para observar o comportamento do sistema em um ambiente simulado, mas armado.
