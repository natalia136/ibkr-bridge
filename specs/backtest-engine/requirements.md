# Requirements — Motor de Backtesting

## Por qué existe

`lib/signalEngine.js` y `lib/riskManager.js` hoy operan en vivo (paper) sin
haber sido probados contra historia. Ningún capital, ni siquiera simulado en
serio, debería correr contra una estrategia que no ha demostrado una ventaja
estadística sobre datos que el modelo nunca vio. Este es el gate de la capa
**Alpha** del framework APEC — nada más avanza hasta que esto exista.

## Alcance

Simular la misma lógica de `computeSignal` + `riskManager` que ya corre en
`tradingCycle.js`, pero sobre datos históricos, para medir si la estrategia
tiene una ventaja real antes de tocar más capital (ni siquiera paper).

Fuera de alcance por ahora: optimización automática de parámetros
(walk-forward optimization completo), ejecución con order book real,
backtesting de shorts (SHORT_ENABLED sigue en false).

## Requisitos funcionales

### R1 — Datos históricos de precio
- **R1.1** El sistema debe poder cargar velas OHLC diarias para un símbolo
  dado, para un rango de fechas configurable (mínimo 2 años).
- **R1.2** Los datos deben venir de una fuente reproducible (mismo símbolo +
  rango de fechas → mismos datos), cacheados en disco para no re-descargar
  en cada corrida.
- **R1.3** El sistema debe reportar explícitamente huecos de datos (días
  faltantes, splits no ajustados) en vez de fallar en silencio.

### R2 — Datos históricos de noticias/sentimiento
- **R2.1** El sistema debe poder obtener un sentimiento diario aproximado por
  símbolo para el mismo rango de fechas.
- **R2.2** Dado que sentimiento histórico granular es caro/difícil de
  conseguir gratis, el spec acepta una fuente degradada explícita: si no hay
  proveedor histórico disponible, usar un sentimiento neutro (0) marcado
  como `sentiment_unavailable: true` en el resultado, NUNCA sentimiento
  inventado o "rellenado" para que la señal dispare.
- **R2.3** El reporte final del backtest debe indicar qué % de las decisiones
  se tomaron con sentimiento real vs. degradado, para poder juzgar cuánto
  del resultado es atribuible al componente de noticias.

### R3 — Simulación
- **R3.1** Debe reutilizar la función real `computeSignal` de
  `lib/signalEngine.js` y las funciones reales de `lib/riskManager.js` — no
  una reimplementación paralela que pueda divergir del código en producción.
- **R3.2** Debe simular, día por día (o barra por barra según `BAR_SIZE`):
  apertura/cierre de posiciones, aplicación de stop-loss/take-profit
  intrabar (usando high/low de la vela, no solo el cierre), límites de
  riesgo (máx. posiciones abiertas, máx. trades/día, límite de pérdida
  diaria) exactamente como en `tradingCycle.js`.
- **R3.3** Debe modelar costos de fricción: comisión por operación y
  slippage estimado (parámetro configurable, no cero) — un backtest sin
  fricción es optimista de forma engañosa.
- **R3.4** Debe soportar correr sobre una lista de símbolos y capital
  inicial configurables.

### R4 — Métricas de resultado
El reporte final debe incluir, como mínimo:
- **R4.1** Retorno total y anualizado (CAGR)
- **R4.2** Sharpe ratio (y Sortino como complemento)
- **R4.3** Máximo drawdown (% y duración en días)
- **R4.4** Win rate y profit factor (ganancia bruta / pérdida bruta)
- **R4.5** Número total de operaciones y operaciones por símbolo
- **R4.6** Curva de equity (serie temporal) exportable para graficar
- **R4.7** Comparación contra un benchmark simple (buy & hold del mismo
  universo de símbolos en el mismo período)

### R5 — Validación fuera de muestra
- **R5.1** El sistema debe soportar dividir el rango de fechas en un período
  de ajuste (in-sample) y uno de prueba (out-of-sample) que nunca se usa
  para tunear parámetros.
- **R5.2** El reporte debe mostrar las métricas de R4 separadas para
  in-sample y out-of-sample — una estrategia que solo funciona in-sample
  está sobreajustada (overfitting) y se descarta.

### R6 — Reproducibilidad y trazabilidad
- **R6.1** Cada corrida debe guardar sus parámetros de entrada
  (config/thresholds usados) junto con el resultado, para poder comparar
  corridas entre sí.
- **R6.2** Los resultados deben persistirse a disco (JSON) con timestamp,
  no solo imprimirse en consola.

## Criterios de aceptación (gate para pasar a producción/paper real)

Una estrategia **no** se considera lista para arriesgar capital (ni
siquiera se recomienda seguir en paper) a menos que, en el período
out-of-sample:

- Sharpe ratio ≥ 1.0
- Max drawdown ≤ 20%
- Profit factor > 1.3
- Al menos 30 operaciones (para que las métricas no sean ruido estadístico)

Estos umbrales son puntos de partida razonables para una estrategia
sistemática simple, no una garantía — se documentan aquí para que la
decisión de "¿esto sirve?" no sea subjetiva el día que veamos los números.

## Decisiones (resueltas)

1. **Precios históricos**: Stooq (gratis, sin API key) — `lib/backtest/priceHistory.js`.
2. **Sentimiento histórico**: degradado (solo momentum) para la primera
   versión — `lib/backtest/sentimentHistory.js`. `SENTIMENT_THRESHOLD` se
   neutraliza automáticamente cuando la fuente está 100% degradada (ver
   nota en design.md) para que la puerta de "acuerdo" no bloquee todo.
3. **Universo de validación**: amplio (ej. S&P 100), no solo la watchlist
   planeada — para entender en qué tipo de acciones funciona/falla la
   estrategia antes de fijar la watchlist real (pendiente de ejecutar, ver
   tasks.md T9 — requiere correr fuera de este sandbox, que bloquea salida
   de red hacia proveedores de datos financieros).
