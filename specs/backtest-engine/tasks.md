# Tasks — Motor de Backtesting

Cada tarea es independientemente verificable. No empezar la siguiente hasta
que la anterior pase su verificación.

- [ ] **T1 — `priceHistory.js`**: descarga velas diarias desde Stooq para un
      símbolo + rango de fechas, cachea en `data/price-cache/`, detecta y
      reporta huecos de fechas faltantes (R1).
      *Verificación*: correr para 2-3 símbolos conocidos y confirmar
      visualmente que el número de velas coincide con días hábiles
      esperados del período.

- [ ] **T2 — `sentimentHistory.js`**: implementación degradada (R2.2) que
      devuelve `{ score: 0, degraded: true }` para cualquier fecha/símbolo.
      Dejar el punto de extensión documentado para un proveedor real futuro.
      *Verificación*: trivial, solo confirmar el shape de datos.

- [ ] **T3 — `metrics.js`**: funciones puras de Sharpe, Sortino, max
      drawdown, profit factor, CAGR sobre una serie de retornos/equity.
      *Verificación*: tests unitarios con series conocidas (ej. una curva
      de equity constante → Sharpe indefinido/0; una serie con una caída
      del 50% → drawdown de -50% detectado correctamente).

- [ ] **T4 — `simulator.js`**: motor día-por-día que reutiliza
      `signalEngine.computeSignal` y `riskManager.*`, aplica stops
      intrabar, comisión y slippage (R3).
      *Verificación*: correr con un solo símbolo y datos sintéticos
      (precio sube monótonamente) y confirmar que abre una posición y la
      cierra por take-profit, no por fin de período.

- [ ] **T5 — split in-sample / out-of-sample**: parametrizar el rango de
      fechas en dos tramos y correr el simulador en cada uno por separado
      (R5).
      *Verificación*: confirmar que el out-of-sample nunca reutiliza datos
      del in-sample para nada (ni siquiera para "lookback" de momentum en
      el primer día del tramo).

- [ ] **T6 — `reportStore.js` + `runBacktest.js`**: orquestador que junta
      todo, guarda `config.json`, `equity-curve.json`, `trades.json`,
      `report.json` con un `runId` (timestamp) (R6).
      *Verificación*: correr dos veces con los mismos parámetros y
      confirmar que ambos reportes tienen resultados idénticos
      (reproducibilidad, R1.2).

- [ ] **T7 — benchmark buy & hold**: calcular las mismas métricas (R4)
      para una estrategia de comprar el universo al inicio y mantener,
      para comparar contra la estrategia real.

- [ ] **T8 — endpoint `POST /backtest`** en `server.js` + script
      `scripts/backtest.js` para correr desde CLI.
      *Verificación*: correr end-to-end sobre 2 años de 5-10 símbolos
      reales y revisar que `report.json` tenga sentido (sin NaN, sin
      valores imposibles).

- [ ] **T9 — evaluar el gate de aceptación**: correr el backtest sobre el
      universo real candidato a watchlist y decidir, con los umbrales del
      spec (Sharpe ≥ 1.0, max drawdown ≤ 20%, profit factor > 1.3, ≥30
      trades), si la estrategia pasa a seguir en paper trading o si hay
      que ajustar `MOMENTUM_THRESHOLD`/`SENTIMENT_THRESHOLD`/stops y
      volver a correr.

## No incluido en este spec (fuera de alcance, futuro)

- Optimización automática de parámetros (grid search / walk-forward
  optimization) — antes de esto, correr T9 manualmente varias veces para
  entender la sensibilidad de la estrategia a sus umbrales.
- Sentimiento histórico real (depende de la decisión de la pregunta
  abierta #2 del spec de requisitos).
- Position sizing por ATR y filtro de correlación/liquidez — son tareas de
  las capas **P** y **E** del framework APEC, specs separados una vez este
  (**A**) esté validado.
