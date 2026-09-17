# Design — Motor de Backtesting

## Principio rector

Reutilizar la lógica de decisión real (`signalEngine`, `riskManager`) y solo
reemplazar las fuentes de datos en vivo (`ibkrClient`, `newsProvider`) por
versiones históricas con la misma forma de datos. Así el backtest prueba
exactamente el código que corre en producción, no una reimplementación que
puede divergir con el tiempo.

## Arquitectura

```
lib/backtest/
  priceHistory.js     — descarga/cachea velas históricas (fuente externa)
  sentimentHistory.js — sentimiento histórico diario por símbolo (o degradado)
  simulator.js         — motor día-por-día que reutiliza signalEngine + riskManager
  metrics.js           — Sharpe, Sortino, drawdown, profit factor, etc.
  reportStore.js        — persiste resultados de cada corrida a disco
  runBacktest.js        — orquestador: junta todo, expone la función pública

data/backtests/
  <run-id>/
    config.json     — parámetros usados en esta corrida (R6.1)
    equity-curve.json
    trades.json
    report.json      — métricas finales (R4, R5)
```

Se agrega un endpoint `POST /backtest` en `server.js` para disparar una
corrida (útil también para automatizar re-validaciones periódicas más
adelante), y un script CLI `scripts/backtest.js` para correrlo sin levantar
el servidor.

## Contratos de datos

### Vela histórica (mismo shape que usa `signalEngine.computeMomentum`)
```ts
{ date: "2024-03-15", o: number, h: number, l: number, c: number, v: number }
```

### Sentimiento histórico diario
```ts
{ date: "2024-03-15", score: number /* [-1,1] */, degraded: boolean }
```
`degraded: true` cuando no hubo dato real disponible ese día (ver R2.2) — el
simulador usa `score: 0` pero el reporte cuenta estos días por separado (R2.3).

### Trade simulado
```ts
{
  symbol, side, entryDate, entryPrice, exitDate, exitPrice, exitReason,
  // exitReason: "stop_loss" | "take_profit" | "signal_reversal" | "end_of_period"
  quantity, grossPnl, commission, slippageCost, netPnl,
}
```

### Reporte final
```ts
{
  runId, config, universe: string[], period: { start, end, split },
  inSample: { ...métricas R4 },
  outOfSample: { ...métricas R4 },
  benchmark: { ...métricas R4 sobre buy&hold },
  dataQuality: { sentimentDegradedPct: number, priceGapsFound: [...] },
  passesGate: boolean, // evaluado contra los umbrales de aceptación del spec
}
```

## Fuentes de datos (decisión pendiente de R.abiertas #1 y #2)

- **Precios**: por defecto, Stooq (`stooq.com`, CSV público, sin API key,
  suficiente para velas diarias) vía un fetch simple con caché en
  `data/price-cache/<symbol>.json`. Si más adelante se prefiere IBKR o un
  proveedor pago, `priceHistory.js` expone una sola función
  `getHistoricalBars(symbol, from, to)` — cambiar de fuente no toca el resto
  del sistema.
- **Sentimiento**: por defecto, degradado (R2.2) — todos los días
  `score: 0, degraded: true`. Esto hace que el backtest inicial mida
  principalmente el componente de momentum solo, lo cual es honesto dado
  que no hay histórico de noticias gratis confiable. Si se decide pagar un
  proveedor con histórico, `sentimentHistory.js` es el único punto de
  cambio.

Esto significa que la **primera corrida de backtest solo validará la mitad
momentum de la estrategia** — se documenta explícitamente en el reporte
(`dataQuality.sentimentDegradedPct: 100`) para que nadie confunda ese
resultado con "la estrategia completa está probada".

## Motor de simulación (`simulator.js`)

Pseudocódigo del loop principal, barra por barra:

```
for each date in period:
  state = resetIfNewDay(state)  // reutiliza stateStore semantics
  if riskManager.isHalted(state, config): continue

  for each symbol in universe:
    bar = priceHistory.getBar(symbol, date)
    sentiment = sentimentHistory.getScore(symbol, date)
    momentum = signalEngine.computeMomentum(recentBars(symbol, date, lookback))
    signal = signalEngine.computeSignal({ momentum, sentimentScore: sentiment.score }, config)

    openPosition = state.openPositions[symbol]

    // Primero: ¿el bar de hoy dispara el stop-loss o take-profit de una posición abierta?
    // (se chequea con high/low del día, no solo el cierre — R3.2)
    if openPosition and bar touches stopPrice or takeProfitPrice:
      closeSimulatedPosition(...)  // aplica comisión + slippage (R3.3)

    else if signal.action === 'BUY' and !openPosition and riskManager.canOpenPosition(...):
      quantity = riskManager.computeQuantity(equity, bar.c, config)
      openSimulatedPosition(...)   // aplica comisión + slippage

    else if signal.action === 'SELL' and openPosition:
      closeSimulatedPosition(..., reason: 'signal_reversal')

  recordEquitySnapshot(date, state)
```

## Métricas (`metrics.js`)

- Sharpe: `mean(daily_returns) / std(daily_returns) * sqrt(252)`
- Sortino: igual pero con desviación solo de retornos negativos
- Max drawdown: pico a valle más profundo de la curva de equity, y su
  duración en días hasta recuperar el pico anterior
- Profit factor: `sum(ganancias brutas) / abs(sum(pérdidas brutas))`
- CAGR: `(equity_final / equity_inicial) ^ (365 / días_totales) - 1`

## Comisión y slippage (R3.3)

Parámetros configurables (nuevas env vars, con default conservador):
- `BACKTEST_COMMISSION_PER_TRADE` (default: 1.0 USD, aproximando IBKR)
- `BACKTEST_SLIPPAGE_BPS` (default: 5 bps sobre el precio de ejecución)

## Qué NO cambia

`lib/signalEngine.js` y `lib/riskManager.js` no se modifican para el
backtest — se importan tal cual. Si el backtest necesitara que se
comporten distinto, sería una señal de que estamos probando algo distinto
de lo que corre en vivo, lo cual invalida el propósito del spec.

## Plan de implementación

Ver `tasks.md` para el desglose en pasos concretos y el orden sugerido.
