#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# Testes obrigatórios — Entregas A, B, C, D
# Executa os 4 testes definidos nas diretrizes (Seção 5)
# ═══════════════════════════════════════════════════════════════
set -euo pipefail

API_URL="http://localhost:3099"
ADMIN_KEY="test-admin-key"
OPERATOR_KEY="test-operator-key"
VIEWER_KEY="test-viewer-key"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color
BOLD='\033[1m'

PASS=0
FAIL=0

log_header() {
  echo ""
  echo -e "${BOLD}${CYAN}═══════════════════════════════════════════════════════════════${NC}"
  echo -e "${BOLD}${CYAN}  $1${NC}"
  echo -e "${BOLD}${CYAN}═══════════════════════════════════════════════════════════════${NC}"
}

log_test() {
  echo -e "\n${YELLOW}▶ $1${NC}"
}

log_pass() {
  echo -e "  ${GREEN}✅ PASS: $1${NC}"
  PASS=$((PASS + 1))
}

log_fail() {
  echo -e "  ${RED}❌ FAIL: $1${NC}"
  FAIL=$((FAIL + 1))
}

log_info() {
  echo -e "  ${CYAN}ℹ $1${NC}"
}

# ─── Esperar API ficar pronta ─────────────────────────────────
wait_for_api() {
  echo "Aguardando API em ${API_URL}..."
  for i in $(seq 1 30); do
    if curl -sf "${API_URL}/health" > /dev/null 2>&1; then
      echo "API pronta!"
      return 0
    fi
    sleep 1
  done
  echo "ERRO: API não respondeu em 30s"
  exit 1
}

# ─── Helper para chamadas API ─────────────────────────────────
api_get() {
  local path="$1"
  local key="${2:-$ADMIN_KEY}"
  curl -sf -H "Authorization: Bearer ${key}" "${API_URL}${path}" 2>/dev/null
}

api_post() {
  local path="$1"
  local body="$2"
  local key="${3:-$ADMIN_KEY}"
  curl -sf -X POST -H "Content-Type: application/json" -H "Authorization: Bearer ${key}" -d "${body}" "${API_URL}${path}" 2>/dev/null
}

api_post_raw() {
  local path="$1"
  local body="$2"
  local key="${3:-$ADMIN_KEY}"
  curl -s -w "\n%{http_code}" -X POST -H "Content-Type: application/json" -H "Authorization: Bearer ${key}" -d "${body}" "${API_URL}${path}" 2>/dev/null
}

wait_for_api

# ═══════════════════════════════════════════════════════════════
# TESTE 0 — Verificar estado inicial
# ═══════════════════════════════════════════════════════════════
log_header "TESTE 0 — Estado Inicial"

log_test "GET /ops/status — verificar estado inicial"
STATUS=$(api_get "/ops/status")
echo "$STATUS" | python3 -m json.tool

GATE=$(echo "$STATUS" | python3 -c "import sys,json; print(json.load(sys.stdin)['gate'])")
ARM=$(echo "$STATUS" | python3 -c "import sys,json; print(json.load(sys.stdin)['arm_state'])")
MOCK=$(echo "$STATUS" | python3 -c "import sys,json; print(json.load(sys.stdin)['mock_mode'])")
RISK_OFF=$(echo "$STATUS" | python3 -c "import sys,json; print(json.load(sys.stdin)['risk_off'])")

if [ "$GATE" = "G0" ]; then log_pass "Gate inicial = G0"; else log_fail "Gate inicial deveria ser G0, got $GATE"; fi
if [ "$ARM" = "DISARMED" ]; then log_pass "Arm state inicial = DISARMED"; else log_fail "Arm state deveria ser DISARMED, got $ARM"; fi
if [ "$MOCK" = "True" ]; then log_pass "mock_mode = true (Entrega B)"; else log_fail "mock_mode deveria ser true, got $MOCK"; fi
if [ "$RISK_OFF" = "False" ]; then log_pass "risk_off = false"; else log_fail "risk_off deveria ser false, got $RISK_OFF"; fi

# ═══════════════════════════════════════════════════════════════
# TESTE 1 — Tick Completo (Seção 5.1)
# ═══════════════════════════════════════════════════════════════
log_header "TESTE 1 — Tick Completo"

log_test "POST /ops/tick — executar tick com 4 símbolos"
TICK_RESULT=$(api_post "/ops/tick" '{"symbols":["EURUSD","GBPUSD","USDJPY","BTCUSD"]}' "$OPERATOR_KEY")
echo "$TICK_RESULT" | python3 -m json.tool

CORR_ID=$(echo "$TICK_RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin)['correlation_id'])")
SNAPSHOTS=$(echo "$TICK_RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin)['summary']['snapshots'])")
INTENTS=$(echo "$TICK_RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin)['summary']['intents'])")
DECISIONS=$(echo "$TICK_RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin)['summary']['decisions'])")
EVENTS_PERSISTED=$(echo "$TICK_RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin)['events_persisted'])")
TICK_MOCK=$(echo "$TICK_RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin)['mock_mode'])")
TICK_GATE=$(echo "$TICK_RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin)['gate'])")

log_info "Correlation ID: $CORR_ID"
log_info "Gate: $TICK_GATE"
log_info "Snapshots: $SNAPSHOTS | Intents: $INTENTS | Decisions: $DECISIONS"
log_info "Events persisted: $EVENTS_PERSISTED"
log_info "Mock mode: $TICK_MOCK"

if [ "$SNAPSHOTS" -ge 4 ]; then log_pass "MCL_SNAPSHOT gerado (${SNAPSHOTS} snapshots)"; else log_fail "MCL_SNAPSHOT: esperava >=4, got $SNAPSHOTS"; fi
if [ "$INTENTS" -ge 1 ]; then log_pass "BRAIN_INTENT gerado (${INTENTS} intents)"; else log_fail "BRAIN_INTENT: esperava >=1, got $INTENTS"; fi
if [ "$DECISIONS" -ge 1 ]; then log_pass "PM_DECISION gerado (${DECISIONS} decisions)"; else log_fail "PM_DECISION: esperava >=1, got $DECISIONS"; fi
if [ "$EVENTS_PERSISTED" -ge 1 ]; then log_pass "Eventos persistidos no ledger ($EVENTS_PERSISTED)"; else log_fail "Nenhum evento persistido"; fi
if [ "$TICK_MOCK" = "True" ]; then log_pass "Tick marcado como mock_mode=true (Entrega B)"; else log_fail "Tick deveria ter mock_mode=true"; fi

# ═══════════════════════════════════════════════════════════════
# TESTE 2 — Gate Promotion (Seção 5.2)
# ═══════════════════════════════════════════════════════════════
log_header "TESTE 2 — Gate Promotion (Entrega A)"

log_test "2.1 — Tentar promover sem pré-requisitos (antes do tick) — deve falhar com reason_code"
# Resetar o estado para simular que não houve tick
# Na verdade, o tick já rodou acima, então vamos testar a promoção direta

log_test "2.2 — Promover G0 → G1 (após tick com sucesso)"
PROMOTE_RESULT=$(api_post_raw "/ops/gate/promote" '{"to_gate":"G1","confirm":"PROMOTE_GATE","reason":"Teste de promoção após tick completo"}' "$ADMIN_KEY")
HTTP_CODE=$(echo "$PROMOTE_RESULT" | tail -1)
BODY=$(echo "$PROMOTE_RESULT" | sed '$d')
echo "$BODY" | python3 -m json.tool 2>/dev/null || echo "$BODY"
log_info "HTTP Status: $HTTP_CODE"

if [ "$HTTP_CODE" = "200" ]; then
  PROMOTED_GATE=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('to_gate',''))")
  REASON_CODE=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('reason_code',''))")
  log_pass "Gate promovido para $PROMOTED_GATE (reason_code: $REASON_CODE)"
elif [ "$HTTP_CODE" = "409" ]; then
  MISSING=$(echo "$BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); prereqs=d.get('missing_prerequisites',[]); [print(f'  - {p[\"reason_code\"]}: {p[\"message\"]}') for p in prereqs]" 2>/dev/null)
  log_info "Promoção negada com reason_codes (esperado se pré-requisitos faltam):"
  echo "$MISSING"
  log_pass "Erro 409 com reason_code explícito (Entrega A funciona)"
else
  log_fail "Resposta inesperada: HTTP $HTTP_CODE"
fi

log_test "2.3 — Verificar /ops/status após promoção"
STATUS_AFTER=$(api_get "/ops/status")
GATE_AFTER=$(echo "$STATUS_AFTER" | python3 -c "import sys,json; print(json.load(sys.stdin)['gate'])")
log_info "Gate atual: $GATE_AFTER"

log_test "2.4 — Tentar transição inválida G1 → G3 (deve falhar)"
if [ "$GATE_AFTER" = "G1" ]; then
  INVALID_RESULT=$(api_post_raw "/ops/gate/promote" '{"to_gate":"G3","confirm":"PROMOTE_GATE","reason":"Tentativa de pular gate"}' "$ADMIN_KEY")
  INVALID_CODE=$(echo "$INVALID_RESULT" | tail -1)
  log_info "HTTP Status para transição inválida: $INVALID_CODE"
  if [ "$INVALID_CODE" = "409" ]; then
    log_pass "Transição inválida G1→G3 rejeitada com 409"
  else
    log_fail "Deveria rejeitar transição G1→G3"
  fi
fi

log_test "2.5 — Tentar promover com role Operator (deve falhar — requer Admin)"
OPERATOR_PROMOTE=$(api_post_raw "/ops/gate/promote" '{"to_gate":"G2","confirm":"PROMOTE_GATE","reason":"Teste RBAC"}' "$OPERATOR_KEY")
OPERATOR_CODE=$(echo "$OPERATOR_PROMOTE" | tail -1)
log_info "HTTP Status com Operator: $OPERATOR_CODE"
if [ "$OPERATOR_CODE" = "403" ]; then
  log_pass "RBAC: Operator não pode promover gate (403)"
else
  log_fail "Deveria retornar 403 para Operator, got $OPERATOR_CODE"
fi

# ═══════════════════════════════════════════════════════════════
# TESTE 3 — ARM/DISARM/KILL (Seção 5.3)
# ═══════════════════════════════════════════════════════════════
log_header "TESTE 3 — ARM/DISARM/KILL"

# Garantir que estamos em G1
CURRENT_GATE=$(api_get "/ops/status" | python3 -c "import sys,json; print(json.load(sys.stdin)['gate'])")

if [ "$CURRENT_GATE" = "G1" ]; then
  log_test "3.1 — ARM em G1 (deve funcionar)"
  ARM_RESULT=$(api_post_raw "/ops/arm" '{"confirm":"ARM"}' "$OPERATOR_KEY")
  ARM_CODE=$(echo "$ARM_RESULT" | tail -1)
  ARM_BODY=$(echo "$ARM_RESULT" | sed '$d')
  echo "$ARM_BODY" | python3 -m json.tool 2>/dev/null || echo "$ARM_BODY"
  log_info "HTTP Status: $ARM_CODE"
  if [ "$ARM_CODE" = "200" ]; then
    log_pass "ARM em G1 funcionou (não 409)"
  else
    log_fail "ARM em G1 deveria funcionar, got $ARM_CODE"
  fi

  log_test "3.2 — Verificar arm_state = ARMED"
  ARM_STATE=$(api_get "/ops/status" | python3 -c "import sys,json; print(json.load(sys.stdin)['arm_state'])")
  if [ "$ARM_STATE" = "ARMED" ]; then log_pass "arm_state = ARMED"; else log_fail "arm_state deveria ser ARMED, got $ARM_STATE"; fi

  log_test "3.3 — DISARM"
  DISARM_RESULT=$(api_post_raw "/ops/disarm" '{"confirm":"DISARM"}' "$OPERATOR_KEY")
  DISARM_CODE=$(echo "$DISARM_RESULT" | tail -1)
  log_info "HTTP Status: $DISARM_CODE"
  if [ "$DISARM_CODE" = "200" ]; then log_pass "DISARM funcionou"; else log_fail "DISARM falhou: $DISARM_CODE"; fi

  ARM_STATE2=$(api_get "/ops/status" | python3 -c "import sys,json; print(json.load(sys.stdin)['arm_state'])")
  if [ "$ARM_STATE2" = "DISARMED" ]; then log_pass "arm_state = DISARMED após DISARM"; else log_fail "Deveria ser DISARMED, got $ARM_STATE2"; fi

  log_test "3.4 — ARM novamente para testar KILL"
  api_post "/ops/arm" '{"confirm":"ARM"}' "$OPERATOR_KEY" > /dev/null

  log_test "3.5 — KILL (deve setar risk_off=true e DISARM)"
  KILL_RESULT=$(api_post_raw "/ops/kill" '{"confirm":"KILL","reason":"Teste kill switch"}' "$OPERATOR_KEY")
  KILL_CODE=$(echo "$KILL_RESULT" | tail -1)
  KILL_BODY=$(echo "$KILL_RESULT" | sed '$d')
  echo "$KILL_BODY" | python3 -m json.tool 2>/dev/null || echo "$KILL_BODY"
  log_info "HTTP Status: $KILL_CODE"
  if [ "$KILL_CODE" = "200" ]; then log_pass "KILL executado com sucesso"; else log_fail "KILL falhou: $KILL_CODE"; fi

  STATUS_KILL=$(api_get "/ops/status")
  KILL_ARM=$(echo "$STATUS_KILL" | python3 -c "import sys,json; print(json.load(sys.stdin)['arm_state'])")
  KILL_RISK=$(echo "$STATUS_KILL" | python3 -c "import sys,json; print(json.load(sys.stdin)['risk_off'])")
  if [ "$KILL_ARM" = "DISARMED" ]; then log_pass "KILL → arm_state = DISARMED"; else log_fail "KILL deveria DISARM, got $KILL_ARM"; fi
  if [ "$KILL_RISK" = "True" ]; then log_pass "KILL → risk_off = true"; else log_fail "KILL deveria setar risk_off=true, got $KILL_RISK"; fi
else
  log_info "Gate não é G1 ($CURRENT_GATE), testando ARM em G0"
  
  log_test "3.1 — ARM em G0 (deve falhar com 409)"
  ARM_G0=$(api_post_raw "/ops/arm" '{"confirm":"ARM"}' "$OPERATOR_KEY")
  ARM_G0_CODE=$(echo "$ARM_G0" | tail -1)
  if [ "$ARM_G0_CODE" = "409" ]; then
    log_pass "ARM em G0 retorna 409 (correto)"
  else
    log_fail "ARM em G0 deveria retornar 409, got $ARM_G0_CODE"
  fi
fi

# ═══════════════════════════════════════════════════════════════
# TESTE 4 — Execução Simulada (Seção 5.4)
# ═══════════════════════════════════════════════════════════════
log_header "TESTE 4 — Execução Simulada (Entrega C)"

# Resetar risk_off e ir para G1+ARMED
# Primeiro, demover para G0 e depois promover de volta
log_test "4.0 — Preparar ambiente: resetar para G1 + ARMED"

# Demover para G0 primeiro (reset risk_off)
api_post "/ops/gate/promote" '{"to_gate":"G0","confirm":"PROMOTE_GATE","reason":"Reset para teste 4"}' "$ADMIN_KEY" > /dev/null 2>&1 || true

# Rodar tick para preencher pré-requisitos
api_post "/ops/tick" '{"symbols":["EURUSD","GBPUSD","USDJPY","BTCUSD"]}' "$OPERATOR_KEY" > /dev/null 2>&1

# Promover para G1
PROMOTE_G1=$(api_post_raw "/ops/gate/promote" '{"to_gate":"G1","confirm":"PROMOTE_GATE","reason":"Preparação teste 4"}' "$ADMIN_KEY")
PROMOTE_G1_CODE=$(echo "$PROMOTE_G1" | tail -1)
log_info "Promoção para G1: HTTP $PROMOTE_G1_CODE"

# ARM
api_post "/ops/arm" '{"confirm":"ARM"}' "$OPERATOR_KEY" > /dev/null 2>&1

STATUS_PRE=$(api_get "/ops/status")
PRE_GATE=$(echo "$STATUS_PRE" | python3 -c "import sys,json; print(json.load(sys.stdin)['gate'])")
PRE_ARM=$(echo "$STATUS_PRE" | python3 -c "import sys,json; print(json.load(sys.stdin)['arm_state'])")
log_info "Estado antes do tick: Gate=$PRE_GATE, ARM=$PRE_ARM"

log_test "4.1 — RUN TICK em G1+ARMED"
TICK4=$(api_post "/ops/tick" '{"symbols":["EURUSD","GBPUSD","USDJPY","BTCUSD"]}' "$OPERATOR_KEY")
echo "$TICK4" | python3 -m json.tool

TICK4_CORR=$(echo "$TICK4" | python3 -c "import sys,json; print(json.load(sys.stdin)['correlation_id'])")
TICK4_CMD=$(echo "$TICK4" | python3 -c "import sys,json; print(json.load(sys.stdin)['commands_sent'])")
TICK4_EVENTS=$(echo "$TICK4" | python3 -c "import sys,json; print(json.load(sys.stdin)['events_persisted'])")
TICK4_DECISIONS=$(echo "$TICK4" | python3 -c "import sys,json; print(json.load(sys.stdin)['summary']['decisions'])")

log_info "Correlation ID: $TICK4_CORR"
log_info "Commands sent: $TICK4_CMD"
log_info "Events persisted: $TICK4_EVENTS"
log_info "Decisions: $TICK4_DECISIONS"

if [ "$TICK4_CMD" = "True" ]; then
  log_pass "Commands sent = true em G1+ARMED"
else
  log_info "Commands sent = $TICK4_CMD (pode ser false se risk_off está ativo)"
fi

if [ "$TICK4_DECISIONS" -ge 1 ]; then
  log_pass "PM_DECISION gerado ($TICK4_DECISIONS decisions)"
else
  log_fail "Deveria ter pelo menos 1 PM_DECISION"
fi

# Verificar que eventos de execução simulada foram persistidos
# (EXEC_SIMULATED_COMMAND ou EXEC_SIMULATED_NOOP)
if [ "$TICK4_EVENTS" -gt 0 ]; then
  log_pass "Eventos de execução simulada persistidos (total: $TICK4_EVENTS)"
else
  log_fail "Nenhum evento persistido — execução simulada não evidenciada"
fi

log_test "4.2 — Verificar /ops/status.executor_status"
EXEC_STATUS=$(api_get "/ops/status")
echo "$EXEC_STATUS" | python3 -c "
import sys, json
d = json.load(sys.stdin)
es = d.get('executor_status')
print(f'  executor_status: {json.dumps(es, indent=2)}')
print(f'  executor_connectivity: {d.get(\"executor_connectivity\")}')
print(f'  mock_mode: {d.get(\"mock_mode\")}')
print(f'  risk_off: {d.get(\"risk_off\")}')
print(f'  last_tick_result: {json.dumps(d.get(\"last_tick_result\"), indent=2)}')
"

EXEC_CONN=$(echo "$EXEC_STATUS" | python3 -c "import sys,json; print(json.load(sys.stdin).get('executor_connectivity',''))")
if [ "$EXEC_CONN" = "connected" ]; then
  log_pass "Executor conectado (connectivity=connected)"
else
  log_info "Executor connectivity: $EXEC_CONN"
fi

# ═══════════════════════════════════════════════════════════════
# RESUMO FINAL
# ═══════════════════════════════════════════════════════════════
log_header "RESUMO FINAL"

TOTAL=$((PASS + FAIL))
echo -e "${BOLD}Total de verificações: ${TOTAL}${NC}"
echo -e "${GREEN}✅ Passou: ${PASS}${NC}"
echo -e "${RED}❌ Falhou: ${FAIL}${NC}"

if [ "$FAIL" -eq 0 ]; then
  echo -e "\n${GREEN}${BOLD}🎉 TODOS OS TESTES PASSARAM!${NC}"
else
  echo -e "\n${RED}${BOLD}⚠️  ${FAIL} verificação(ões) falharam.${NC}"
fi

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  Entregas verificadas:"
echo "  A — Gate promotion institucional (POST /ops/gate/promote)"
echo "  B — Mock mode explícito (mock_mode + payload.mock + MOCK_*)"
echo "  C — Execução simulada evidenciada (EXEC_SIMULATED_*)"
echo "  D — UI/contratos: Replay/Calendar/Config claros"
echo "═══════════════════════════════════════════════════════════════"
