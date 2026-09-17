# Tasks — Motor de Backtesting

Cada tarea es independientemente verificable. No empezar la siguiente hasta
que la anterior pase su verificación.

- [x] **T1 — `priceHistory.js`**: descarga velas diarias desde Stooq para un
      símbolo + rango de fechas, cachea en `data/price-cache/`, detecta y
      reporta huecos de fechas faltantes (R1).
      *Verificación*: hecho con tests unitarios sobre el parser CSV y la
      detección de huecos (`test/backtest/priceHistory.test.js`) con datos
      sintéticos. **Pendiente**: probar la descarga real contra Stooq — el
      sandbox de esta sesión bloquea salida de red hacia proveedores de
      datos financieros por política de la organización, así que esto debe
      verificarse la primera vez que se corra `scripts/backtest.js` fuera
      de este sandbox (local o en Railway).

- [x] **T2 — `sentimentHistory.js`**: implementación degradada (R2.2) que
      devuelve `{ score: 0, degraded: true }` para cualquier fecha/símbolo.
      Punto de extensión documentado para un proveedor real futuro.
      *Verificación*: shape de datos usado y probado indirectamente vía
      `runBacktest.test.js` (confirma `sentimentThresholdOverridden: true`).

- [x] **T3 — `metrics.js`**: funciones puras de Sharpe, Sortino, max
      drawdown, profit factor, CAGR sobre una serie de retornos/equity.
      *Verificación*: 8 tests unitarios pasando (`test/backtest/metrics.test.js`),
      incluyendo el caso de drawdown del 50% y su recuperación.

- [x] **T4 — `simulator.js`**: motor día-por-día que reutiliza
      `signalEngine.computeSignal` y `riskManager.*`, aplica stops
      intrabar, comisión y slippage (R3).
      *Verificación*: 4 tests pasando (`test/backtest/simulator.test.js`) —
      entrada y salida por take-profit, salida por stop-loss ante una
      reversión brusca, ninguna apertura en una caída sostenida (long-only),
      y respeto de `MAX_OPEN_POSITIONS` entre símbolos correlacionados.

- [x] **T5 — split in-sample / out-of-sample**: parametrizado en
      `runBacktest.js` (`startDate`→`splitDate` e independientemente
      `splitDate+1`→`endDate`, cada uno con su propio capital inicial, sin
      compartir estado) (R5).
      *Verificación*: cubierto por `runBacktest.test.js`, que confirma que
      ambos reportes se generan por separado.

- [x] **T6 — `reportStore.js` + `runBacktest.js`**: orquestador que junta
      todo, guarda `config.json`, `equity-curve.json`, `trades.json`,
      `report.json` con un `runId` (timestamp) (R6).
      *Verificación*: `runBacktest.test.js` guarda una corrida y la vuelve
      a leer con `loadRun`, confirmando que el reporte persistido es
      idéntico al generado en memoria (incluyendo el caso `Infinity` de
      `profitFactor`, que requirió un replacer/reviver JSON — ver commit).

- [x] **T7 — benchmark buy & hold**: `buildBuyHoldCurve` en `runBacktest.js`,
      equal-weight, comprado al inicio de cada tramo y mantenido, marcado a
      mercado diariamente con forward-fill de huecos.

- [x] **T8 — endpoint `POST /backtest`** en `server.js` (+ `GET /backtest`,
      `GET /backtest/:runId`) y script `scripts/backtest.js` para CLI.
      *Verificación*: server probado localmente (`GET /backtest` vacío,
      `POST /backtest` con campos faltantes → 400, `GET /backtest/:id`
      inexistente → 404). **Pendiente T8 completo**: una corrida real
      end-to-end contra datos de Stooq (bloqueado en este sandbox, ver T1).

- [ ] **T9 — evaluar el gate de aceptación**: correr el backtest sobre el
      universo real candidato (decisión: universo amplio tipo S&P 100) y
      decidir, con los umbrales del spec (Sharpe ≥ 1.0, max drawdown ≤ 20%,
      profit factor > 1.3, ≥30 trades), si la estrategia pasa a seguir en
      paper trading o si hay que ajustar
      `MOMENTUM_THRESHOLD`/`SENTIMENT_THRESHOLD`/stops y volver a correr.
      **Bloqueado**: requiere ejecutar `scripts/backtest.js` desde un
      entorno con salida de red hacia Stooq (local o Railway) — no se puede
      completar dentro de este sandbox de desarrollo.

## No incluido en este spec (fuera de alcance, futuro)

- Optimización automática de parámetros (grid search / walk-forward
  optimization) — antes de esto, correr T9 manualmente varias veces para
  entender la sensibilidad de la estrategia a sus umbrales.
- Sentimiento histórico real (degradado por decisión explícita para esta
  primera versión — ver requirements.md).
- Position sizing por ATR y filtro de correlación/liquidez — son tareas de
  las capas **P** y **E** del framework APEC, specs separados una vez este
  (**A**) esté validado.
