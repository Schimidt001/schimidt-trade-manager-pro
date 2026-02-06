# Documento do Contrato do Executor (Brain-Side)

**Versão do Contrato:** 1.0.0

**Autor:** Agente 6 (Manus AI)

**Data:** 2026-02-06

## 1. Visão Geral

Este documento define o contrato de API REST que o **Schimidt Brain** espera que o **Executor (Schimidt Trader System Pro)** implemente. O objetivo é estabelecer uma comunicação clara e padronizada para envio de comandos, leitura de status e recebimento de eventos.

O Brain implementa um `ExecutorAdapter` que segue este contrato. Para fins de teste e desenvolvimento desacoplado, um `ExecutorSimulator` também foi implementado, mimetizando o comportamento aqui descrito.

**Regra de Ouro:** O Brain **não** modifica o Executor. O Executor deve, no futuro, alinhar-se a este contrato.

## 2. Autenticação

A comunicação entre o Brain e o Executor é protegida por dois mecanismos:

| Mecanismo | Header | Valor | Descrição |
| :--- | :--- | :--- | :--- |
| **API Key** | `Authorization` | `Bearer <EXECUTOR_API_KEY>` | Usado em todas as chamadas do Brain para o Executor (`/status`, `/command`). A chave é fornecida via variável de ambiente. |
| **Webhook Secret** | `X-Executor-Secret` | `<EXECUTOR_WEBHOOK_SECRET>` | Usado em todas as chamadas do Executor para o Brain (`/events`). Garante que os webhooks são legítimos. |

## 3. Endpoints da API (Implementados pelo Executor)

O Executor deve expor os seguintes endpoints na sua URL base (`$EXECUTOR_BASE_URL`):

### 3.1. Obter Status

Retorna o estado atual do executor, suas configurações e métricas de saúde.

- **Endpoint:** `GET /status`
- **Autenticação:** API Key (Bearer)
- **Resposta de Sucesso (200 OK):**

```json
{
  "connected": true,
  "timestamp": "2026-02-06T18:00:00.000Z",
  "mode": "ICMARKETS",
  "active_strategy": "B3_H1",
  "active_symbols": ["EURUSD", "GBPUSD"],
  "risk_profile": {
    "max_risk_per_trade_pct": 1.5,
    "max_daily_loss_pct": 5,
    "max_positions": 10
  },
  "health": {
    "latency_ms": 45,
    "error_rate": 0.01,
    "execution_state": "OK"
  }
}
```

### 3.2. Enviar Comando

Recebe um comando do Brain para ser executado.

- **Endpoint:** `POST /command`
- **Autenticação:** API Key (Bearer)
- **Payload de Exemplo (Request Body):**

```json
{
  "type": "SET_STRATEGY",
  "payload": {
    "strategy": "C3_M15",
    "brain_id": "C3",
    "timeframe": "M15"
  }
}
```

- **Resposta de Sucesso (200 OK):**

```json
{
  "ok": true,
  "message": "Estratégia alterada para C3_M15"
}
```

- **Resposta de Falha (Ex: 400 Bad Request ou 500 Internal Server Error):**

```json
{
  "ok": false,
  "message": "Payload inválido: strategy deve ser string não vazia",
  "reason_code": "EXEC_ORDER_FAILED"
}
```

## 4. Comandos Suportados

O campo `type` no payload do comando `POST /command` pode ter os seguintes valores:

| Comando | Payload (`payload`) | Descrição |
| :--- | :--- | :--- |
| `ARM` | `{ "reason": "..." }` | Arma o executor, permitindo que ele abra novas posições. | 
| `DISARM` | `{ "reason": "..." }` | Desarma o executor, impedindo novas posições. | 
| `SET_STRATEGY` | `{ "strategy": "..." }` | Define a estratégia de trading ativa. | 
| `SET_PARAMS` | `{ "params": { ... } }` | Envia parâmetros específicos para a estratégia ativa (ex: `entry_price`, `stop_loss`). | 
| `SET_RISK` | `{ "risk_profile": { ... } }` | Ajusta o perfil de risco (ex: `max_risk_per_trade_pct`). | 
| `CLOSE_DAY` | `{ "reason": "..." }` | Comando de emergência para encerrar todas as operações do dia. **Fallback para `CLOSE_POSITIONS`**. | 
| `SET_SYMBOLS_ACTIVE` | `{ "symbols": ["..."], "action": "add"\|"remove"\|"set" }` | Gerencia a lista de símbolos ativos para trading. |

> **Nota sobre `CLOSE_DAY`**: Este é um comando de segurança. Se o executor suportar um comando mais granular como `CLOSE_POSITIONS(symbol)`, o `mapping.ts` no Brain deve ser atualizado para usá-lo. Atualmente, `CLOSE_DAY` é o fallback esperado.

## 5. Webhook de Eventos (Implementado pelo Brain)

O Executor deve notificar o Brain sobre eventos de execução enviando um `POST` para o seguinte endpoint:

- **Endpoint:** `POST /executor/events` (no servidor da API do Brain)
- **Autenticação:** Webhook Secret (`X-Executor-Secret`)
- **Payload de Exemplo (Request Body):**

```json
{
  "type": "ORDER_FILLED",
  "symbol": "EURUSD",
  "strategy": "B3_H1",
  "details": {
    "orderId": "123456",
    "price": 1.0850,
    "size": 0.1,
    "side": "BUY"
  },
  "timestamp": "2026-02-06T18:05:00.000Z"
}
```

### 5.1. Eventos Esperados

O campo `type` no payload do webhook pode ter os seguintes valores:

| Evento | Detalhes (`details`) | Descrição |
| :--- | :--- | :--- |
| `ORDER_FILLED` | `{ "orderId", "price", "size", "side" }` | Uma ordem foi executada com sucesso. |
| `SL_HIT` | `{ "orderId", "price", "pnl" }` | Um stop-loss foi atingido. |
| `TP_HIT` | `{ "orderId", "price", "pnl" }` | Um take-profit foi atingido. |
| `ERROR` | `{ "message", "command_type?" }` | Ocorreu um erro no executor ao processar um comando ou durante a operação. |
| `INFO` | `{ "message" }` | Evento informativo geral do executor. |

## 6. Safety e Error Handling

- **Timeouts:** O Brain utiliza um timeout curto (3 segundos) para todas as chamadas ao Executor.
- **Retries:** O Brain tenta reenviar um comando uma vez (1 retry) em caso de falha de rede ou timeout.
- **Modo de Segurança:** Se o Brain detecta que o Executor está `DOWN` (não responde) ou `BROKEN` (latência muito alta, taxa de erros excessiva), ele entra em modo de segurança:
  1. O `ExecutionState` global é alterado para `BROKEN`.
  2. O `PortfolioManager` (PM) entra em modo `RISK_OFF` automaticamente.
  3. Nenhum novo comando de execução é enviado até que a conexão seja restabelecida e a saúde do executor melhore.
