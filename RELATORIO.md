# Relatório de Implementação: Market Data Provider Real (FOREX)

**Autor**: Manus AI
**Data**: 2026-02-09

## 1. Resumo da Implementação

O objetivo desta tarefa foi substituir completamente o Market Data Provider Yahoo Finance por uma fonte de dados FX-grade institucional no projeto Schimidt Brain. A implementação foi concluída com sucesso utilizando a **cTrader Open API (Spotware)** como provider definitivo. O sistema agora opera em Shadow Mode com dados de mercado reais de FOREX via conexão WebSocket direta com o backend cTrader.

As alterações foram comitadas na branch `feature/real-market-data-ctrader`.

## 2. Fonte de Dados Utilizada

- **Provider**: cTrader Open API (Spotware)
- **Protocolo**: WebSocket JSON (porta 5036)
- **Ambiente**: DEMO (demo.ctraderapi.com) — configurável para LIVE
- **Justificativa**: Conforme as diretrizes, a cTrader Open API é uma fonte FX-grade com candles intraday reais, sessões corretas e qualidade institucional. Substitui definitivamente o Yahoo Finance, que não era aceitável para validação institucional intraday em Forex.

## 3. Autenticação cTrader

O fluxo de autenticação segue o padrão OAuth da cTrader Open API:

1. **Application Auth** (`ProtoOAApplicationAuthReq`): Autentica a aplicação com `clientId` e `clientSecret`.
2. **Account Auth** (`ProtoOAAccountAuthReq`): Autentica a conta do trader com `ctidTraderAccountId` e `accessToken`.
3. **Heartbeat**: Mantém a conexão viva com mensagens a cada 10 segundos.
4. **Reconexão automática**: Em caso de perda de conexão ou erro de autenticação, o sistema reconecta automaticamente.

## 4. Mapeamento de Símbolos

Os symbolIds numéricos do cTrader são resolvidos dinamicamente via `ProtoOASymbolsListReq` na primeira conexão. O mapeamento é cacheado com TTL de 1 hora para evitar requests desnecessárias.

| Símbolo Interno | Nome cTrader | Resolução |
|-----------------|-------------|-----------|
| EURUSD | EURUSD | Dinâmica (symbolId + digits) |
| GBPUSD | GBPUSD | Dinâmica (symbolId + digits) |
| USDJPY | USDJPY | Dinâmica (symbolId + digits) |
| AUDUSD | AUDUSD | Dinâmica (symbolId + digits) |
| USDCHF | USDCHF | Dinâmica (symbolId + digits) |
| USDCAD | USDCAD | Dinâmica (symbolId + digits) |
| NZDUSD | NZDUSD | Dinâmica (symbolId + digits) |

Se a resolução falhar para um símbolo, o sistema retorna NO_TRADE com reason, sem quebrar o tick.

## 5. Conversão de Dados

Os trendbars do cTrader usam formato relativo (low + deltas). A conversão para OHLC absoluto é feita considerando:

- `low` = preço low em unidades de 1/100000
- `open` = low + deltaOpen
- `close` = low + deltaClose
- `high` = low + deltaHigh
- Precisão: respeitando o campo `digits` do símbolo

## 6. Data Quality Gate

Antes de aceitar dados, o sistema verifica:

| Condição | Status | Comportamento |
|----------|--------|---------------|
| Mercado fechado (fim de semana) | MARKET_CLOSED | NO_TRADE (não erro) |
| Dados atrasados (stale) | DEGRADED | Sinaliza no MCL_SNAPSHOT |
| Sem dados | DOWN | Ignora símbolo, continua com outros |
| Gaps detectados | OK/DEGRADED | Sinaliza gaps_detected |
| Volume ausente | OK | volume_ratio = 1.0, volume_missing = true |

## 7. Volume em FOREX

O volume retornado pelo cTrader é em ticks (não volume financeiro real, pois FOREX é OTC). Quando o volume é 0 ou ausente:

- `volume_ratio` = 1.0 (proxy baseado em range de candle)
- `volume_missing` = true
- Nunca usa 0 silenciosamente

## 8. Substituição no Pipeline

A função `fetchMultipleMarketData` agora conecta ao cTrader via WebSocket, autentica, resolve symbolIds e busca trendbars para todos os timeframes (M15, H1, H4, D1). O fluxo no `decisionEngine.ts` permanece o mesmo:

`fetchMultipleMarketData` → `buildRealMclInput` → `computeMarketContext`

Todas as referências a `data_source: "YAHOO_FINANCE"` foram substituídas por `data_source: "CTRADER"`.

## 9. Configuração (Railway)

Variáveis de ambiente necessárias:

```
CTRADER_CLIENT_ID=<client_id>
CTRADER_CLIENT_SECRET=<client_secret>
CTRADER_REDIRECT_URI=<redirect_uri>
CTRADER_ACCESS_TOKEN=<access_token>
CTRADER_REFRESH_TOKEN=<refresh_token>
CTRADER_CTID_TRADER_ACCOUNT_ID=<account_id>
CTRADER_ENV=DEMO
MARKET_DATA_PROVIDER=CTRADER
MARKET_DATA_TIMEOUT_MS=5000
```

## 10. Validação e Replay

- **Compilação**: Todos os pacotes do monorepo foram compilados com sucesso.
- **Replay Real**: O script `tests/replay-real-market.ts` executa o pipeline completo com dados reais do cTrader para 7 pares de FOREX.
- **Checklist de validação**:
  - data_source = CTRADER em todos os snapshots
  - Candles com preços coerentes (EURUSD ~ 1.x, USDJPY ~ 1xx)
  - Nenhum preço fora de escala
  - Replay com timestamps reais
  - Brains gerando INTENT/SKIP explicáveis
  - Sistema não quebra se faltar dado
  - Yahoo Finance não existe mais no código

## 11. Limitações Conhecidas

- **Volume em FOREX**: O volume é em ticks (não financeiro). O proxy baseado em range de candle é usado como complemento.
- **Event State**: O `event_state` (proximidade de notícias) está fixado em `NONE`. A integração com o `calendarService` existente é o próximo passo lógico.
- **Rate Limiting**: O cTrader limita a 5 requests/segundo para dados históricos. O sistema respeita esse limite com delays entre requests.
- **Token Refresh**: O refresh automático do access token ainda não está implementado. Tokens expirados requerem renovação manual.
