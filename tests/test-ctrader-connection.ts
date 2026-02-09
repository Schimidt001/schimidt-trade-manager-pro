// ═════════════════════════════════════════════════════════════
// Teste de Conexão cTrader — Validação do Adapter
// ═════════════════════════════════════════════════════════════
// Este script testa:
// 1. Conexão WebSocket com cTrader
// 2. Autenticação App + Account
// 3. Resolução de symbolId
// 4. Fetch de trendbars (candles)
// 5. Conversão de formato relativo para OHLC absoluto
// 6. Data Quality Gate
//
// Uso: CTRADER_CLIENT_ID=... npx ts-node tests/test-ctrader-connection.ts
// ═════════════════════════════════════════════════════════════

import { fetchMarketData, closeCTraderConnection } from "../packages/adapters/src/market/index";
import type { MarketDataSnapshot } from "../packages/adapters/src/market/index";

const TEST_SYMBOL = "EURUSD";

async function main(): Promise<void> {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  TESTE DE CONEXÃO cTrader — Schimidt Brain");
  console.log("═══════════════════════════════════════════════════════════════\n");

  console.log(`Testando símbolo: ${TEST_SYMBOL}\n`);

  try {
    const snapshot: MarketDataSnapshot = await fetchMarketData(TEST_SYMBOL);

    console.log(`✓ Dados obtidos com sucesso para ${TEST_SYMBOL}`);
    console.log(`  fetchedAt: ${snapshot.fetchedAt}`);
    console.log(`  D1 candles: ${snapshot.D1.length}`);
    console.log(`  H4 candles: ${snapshot.H4.length}`);
    console.log(`  H1 candles: ${snapshot.H1.length}`);
    console.log(`  M15 candles: ${snapshot.M15.length}`);

    // Validar preços coerentes
    if (snapshot.H1.length > 0) {
      const lastH1 = snapshot.H1[snapshot.H1.length - 1];
      console.log(`\n  Último H1:`);
      console.log(`    timestamp: ${new Date(lastH1.timestamp * 1000).toISOString()}`);
      console.log(`    open:  ${lastH1.open}`);
      console.log(`    high:  ${lastH1.high}`);
      console.log(`    low:   ${lastH1.low}`);
      console.log(`    close: ${lastH1.close}`);
      console.log(`    volume: ${lastH1.volume}`);

      // EURUSD deve estar entre 0.9 e 1.5
      const price = lastH1.close;
      if (price > 0.9 && price < 1.5) {
        console.log(`\n  ✅ Preço EURUSD coerente: ${price}`);
      } else {
        console.log(`\n  ❌ Preço EURUSD FORA DE ESCALA: ${price}`);
      }
    }

    if (snapshot.M15.length > 0) {
      const lastM15 = snapshot.M15[snapshot.M15.length - 1];
      console.log(`\n  Último M15:`);
      console.log(`    timestamp: ${new Date(lastM15.timestamp * 1000).toISOString()}`);
      console.log(`    open:  ${lastM15.open}`);
      console.log(`    high:  ${lastM15.high}`);
      console.log(`    low:   ${lastM15.low}`);
      console.log(`    close: ${lastM15.close}`);
      console.log(`    volume: ${lastM15.volume}`);
    }

    if (snapshot.D1.length > 0) {
      const lastD1 = snapshot.D1[snapshot.D1.length - 1];
      console.log(`\n  Último D1:`);
      console.log(`    timestamp: ${new Date(lastD1.timestamp * 1000).toISOString()}`);
      console.log(`    open:  ${lastD1.open}`);
      console.log(`    high:  ${lastD1.high}`);
      console.log(`    low:   ${lastD1.low}`);
      console.log(`    close: ${lastD1.close}`);
    }

  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error(`\n✗ Erro: ${err.message}`);
    console.error(err.stack);
  } finally {
    await closeCTraderConnection();
    console.log("\n═══════════════════════════════════════════════════════════════");
  }
}

main().catch((error) => {
  console.error("Erro fatal:", error);
  process.exit(1);
});
