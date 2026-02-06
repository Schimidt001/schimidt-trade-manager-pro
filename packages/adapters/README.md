# @schimidt-brain/adapters

Este pacote é da responsabilidade do **Agente 5**.

Contém os adaptadores para fontes de dados externas, primariamente o calendário económico. É responsável por:

1.  **Buscar dados** de provedores externos (Trading Economics e Finnhub).
2.  **Normalizar** os dados para um formato interno canónico (`EconomicEventNormalized`).
3.  **Garantir a saúde e a resiliência** do feed de notícias através de um mecanismo de fallback.
4.  **Avaliar a saúde (health)** do provedor de dados e reportar o seu estado (`OK`, `DEGRADED`, `DOWN`).
5.  **Calcular e expor janelas de no-trade** (`EventWindow`) em torno de eventos de alto impacto para consumo pelo `core` (MCL/PM) e `api`.

## Estrutura

```
packages/adapters/
  src/
    news/
      types.ts                # Modelos de dados normalizados e brutos
      normalize.ts            # Funções de normalização e helpers
      tradingEconomics.ts     # Provider primário
      finnhub.ts              # Provider de fallback
      providerHealth.ts       # Lógica de avaliação de saúde do provider
      calendarService.ts      # Interface principal para a API
    index.ts                  # Ponto de entrada público do pacote
  package.json
  tsconfig.json
  README.md
```

## Variáveis de Ambiente

Para que o `calendarService` funcione, as seguintes variáveis de ambiente devem ser configuradas no seu ficheiro `.env`:

```bash
# Chave de API para o provider primário de calendário económico
TRADING_ECONOMICS_API_KEY="SUA_CHAVE_AQUI"

# Chave de API para o provider de fallback
FINNHUB_API_KEY="SUA_CHAVE_AQUI"
```

## Como Testar Localmente

Para testar o fetch de dados de um provider individualmente, pode criar um script de teste simples. Crie um ficheiro `test.ts` na raiz do pacote `packages/adapters`:

```typescript
// test.ts
import { config } from 'dotenv';
import { fetchTradingEconomicsCalendar } from './src/news/tradingEconomics';
import { fetchFinnhubCalendar } from './src/news/finnhub';

config({ path: '../../.env' }); // Carrega as variáveis de ambiente

async function runTest() {
  const testDate = new Date();

  try {
    console.log('--- Testing Trading Economics ---');
    const teApiKey = process.env.TRADING_ECONOMICS_API_KEY;
    if (!teApiKey) throw new Error('TRADING_ECONOMICS_API_KEY is not set');
    const teEvents = await fetchTradingEconomicsCalendar(testDate, teApiKey);
    console.log(`[SUCCESS] Fetched ${teEvents.length} events from TE.`);
    if (teEvents.length > 0) {
      console.log('Sample:', JSON.stringify(teEvents[0], null, 2));
    }
  } catch (error) {
    console.error('[ERROR] Trading Economics failed:', error);
  }

  console.log('\n--- Testing Finnhub ---');
  try {
    const finnhubApiKey = process.env.FINNHUB_API_KEY;
    if (!finnhubApiKey) throw new Error('FINNHUB_API_KEY is not set');
    const finnhubEvents = await fetchFinnhubCalendar(testDate, finnhubApiKey);
    console.log(`[SUCCESS] Fetched ${finnhubEvents.length} events from Finnhub.`);
    if (finnhubEvents.length > 0) {
      console.log('Sample:', JSON.stringify(finnhubEvents[0], null, 2));
    }
  } catch (error) {
    console.error('[ERROR] Finnhub failed:', error);
  }
}

runTest();
```

Para executar, precisa do `ts-node` e `dotenv`:

```bash
npm install -D ts-node dotenv

# Executar o teste
# Assegure-se que o seu .env está na raiz do monorepo
ts-node test.ts
```

## Exemplo de Retorno Normalizado

O `calendarService.getDayCalendar()` retorna um objeto `CalendarServiceResponse`. O campo `events` contém uma lista de `EconomicEventNormalized`.

**Exemplo de um evento `EconomicEventNormalized`:**

```json
{
  "id": "d2a7a8f5b1e9d0c3b3a4c1b3e8d9a7c6b5a4d3c2",
  "timestamp": "2025-02-06T09:30:00-03:00",
  "country": "United States",
  "currency": "USD",
  "title": "Non Farm Payrolls",
  "impact": "HIGH",
  "previous": 142,
  "forecast": 175,
  "actual": null,
  "source": "TE",
  "updated_at": "2025-02-06T12:30:00-03:00",
  "raw": { ...dados brutos da API... }
}
```

## Política de Fallback e Saúde do Provider

O sistema foi desenhado para ser resiliente a falhas de um único provedor de dados.

1.  **Provider Primário**: **Trading Economics (TE)** é sempre a primeira fonte a ser consultada.
2.  **Provider de Fallback**: Se a chamada à API do TE falhar (por timeout, erro de rede, erro 5xx, etc.), o `calendarService` automaticamente tenta buscar os mesmos dados do **Finnhub**.
3.  **Estado DOWN**: Se **ambos** os providers falharem, o estado do provider é marcado como `DOWN`. A API receberá uma lista de eventos vazia e o `reason_code` `PROV_DISCONNECTED`.

### Quando o Brain D2 é Desligado (`EVENT_DATA_DEGRADED_D2_OFF`)

A regra institucional é clara: **o Brain D2 (News Trader) não pode operar "às cegas"**. Ele depende de um feed de calendário económico confiável e completo.

O `providerHealth.evaluateProviderHealth()` marca o estado como `DEGRADED` e o `calendarService` emite o `reason` `EVENT_DATA_DEGRADED_D2_OFF` nas seguintes condições:

-   **Campos Essenciais Faltando**: Se uma percentagem significativa de eventos (ex: >30%) não contiver campos essenciais como `timestamp`, `currency`, `title` ou `impact`.
-   **Dados Incompletos para HIGH Impact**: Se uma percentagem significativa de eventos de **alto impacto** (ex: >50%) não tiver os campos `previous` ou `forecast`. O D2 precisa destes dados para modelar o desvio e a surpresa.
-   **Volume Anormal**: Se o número de eventos for excessivamente alto (sugerindo duplicação) ou baixo (sugerindo feed incompleto em dia útil).

Quando a API recebe um estado `DEGRADED` ou `DOWN`, é da sua responsabilidade:

1.  Emitir um evento `PROVIDER_STATE_CHANGE` para o ledger.
2.  **Bloquear a ativação do Brain D2**, garantindo que ele não gere `Intents` com base em dados não confiáveis.

Esta salvaguarda é crítica para a estabilidade e segurança do sistema.
