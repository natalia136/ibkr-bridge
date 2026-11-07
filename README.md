# IBKR Bridge + Trading Engine

Servidor puente entre un frontend (bot en Netlify u otro cliente) e IB Gateway
local, con un motor de trading automatizado encima: noticias + momentum de
precio → señal → gestión de riesgo → órdenes bracket (entrada + stop-loss +
take-profit) en IBKR.

## ⚠️ Antes de usar esto con dinero real

- **Ninguna estrategia aquí "predice" el mercado.** El motor de señales combina
  sentimiento de noticias con momentum de precio y solo actúa cuando ambos
  coinciden — esto reduce ruido, no lo elimina.
- Empieza siempre en **cuenta paper de IBKR** (`PAPER_MODE=true`, por defecto).
  El sistema **rechaza órdenes** si `PAPER_MODE=true` y el `accountId` no
  empieza por `DU` (convención de cuentas paper de IBKR).
- Para operar en real hace falta `PAPER_MODE=false` **y**
  `LIVE_TRADING_CONFIRM=I_UNDERSTAND_THE_RISK`. Es intencionalmente incómodo.
- El trading totalmente automático (`AUTOTRADE_ENABLED=true`) está **apagado
  por defecto**. Valida el ciclo manualmente con `POST /cycle` durante
  semanas en paper antes de encenderlo.
- Revisa el formato exacto de las órdenes bracket (`lib/orderExecutor.js`)
  contra la documentación actual de tu IB Gateway antes de confiar en él con
  capital real — la API de IBKR puede variar entre versiones del gateway.

## Deploy

Tres opciones — usa la que prefieras, todas corren el mismo código:

### GCP Cloud Run (recomendado — Claude vía Vertex AI, sin API key aparte)

```bash
# 1. Habilita Claude en Vertex AI Model Garden para tu proyecto:
#    console.cloud.google.com/vertex-ai/model-garden -> busca "Claude" -> Enable
export PROJECT_ID=tu-proyecto-gcp
export IBKR_HOST=tu-ip-o-tunel-ngrok
./scripts/deploy-bridge-gcp.sh
```

Revisa el script antes de correrlo — no fue ejecutado por Claude (esta sesión
no tiene credenciales de GCP). Crea una service account con permiso
`roles/aiplatform.user` y despliega a Cloud Run con `GCP_PROJECT_ID`/`GCP_REGION`
configurados — el agente híbrido llama a Claude usando esas credenciales
automáticamente, sin `ANTHROPIC_API_KEY`.

### VPS en Hostinger (acceso root → Docker)

```bash
# En el VPS, con Docker instalado:
git clone <tu-repo> && cd ibkr-bridge
cp .env.example .env   # completa IBKR_HOST, GCP_PROJECT_ID, etc.

# Vertex AI desde fuera de GCP necesita una key de service account (no gcloud
# login interactivo) — en Google Cloud Console: IAM -> Service Accounts ->
# crea una con rol "Vertex AI User" -> genera una key JSON.
mv ~/Downloads/tu-key.json ./gcp-key.json
echo "GOOGLE_APPLICATION_CREDENTIALS=/app/gcp-key.json" >> .env

docker compose up -d --build
```

Esto levanta tanto el bridge (`:3000`) como el screener (`:8080`) en el mismo
VPS. Pon un reverse proxy (Caddy o nginx) delante con TLS antes de exponer
`/dashboard` públicamente — ninguno de los dos viene con HTTPS propio.

### Railway (como estaba originalmente)

1. Sube esta carpeta a GitHub
2. Conecta el repo en railway.app
3. Configura las variables de entorno (ver `.env.example`) — usa
   `ANTHROPIC_API_KEY` en vez de `GCP_PROJECT_ID` si te quedas aquí, ya que
   Railway no trae credenciales de GCP por defecto.

## Variables de entorno

Ver `.env.example` para la lista completa. Las más importantes:

- `IBKR_HOST` / `IBKR_PORT`: dirección de tu IB Gateway
- `ACCOUNT_ID`: cuenta IBKR a operar (si se omite, usa la primera de `/iserver/accounts`)
- `PAPER_MODE`: `true` por defecto — bloquea trading fuera de cuenta paper
- `AUTOTRADE_ENABLED`: activa el ciclo automático en background
- `FINNHUB_API_KEY`: opcional, mejora el sentimiento de noticias (si no se
  define, cae a un análisis de palabras clave sobre RSS de Yahoo Finance)

## Endpoints

### Bridge manual (inspección / uso puntual)

- `GET /health` — estado del servidor
- `GET /test`, `GET /auth`, `POST /tickle` — estado de sesión con IB Gateway
- `GET /accounts` — cuentas disponibles
- `GET /search/:symbol` — buscar contrato
- `GET /bars/:conid?period=1h&bar=1min` — velas históricas
- `POST /order` — orden de mercado cruda, sin gestión de riesgo (uso manual)
- `GET /positions/:accountId` — posiciones abiertas

### Motor de trading automatizado

- `GET /watchlist` — símbolos vigilados
- `POST /watchlist` `{ "symbol": "AAPL" }` — agrega un símbolo (resuelve su conid)
- `DELETE /watchlist/:symbol` — quita un símbolo
- `POST /cycle` — ejecuta un ciclo completo (noticias + momentum → señal →
  riesgo → orden bracket) sobre todos los símbolos de la watchlist
- `GET /status` — configuración activa y estado (posiciones abiertas, P&L del
  día, trades del día, kill switch)
- `POST /kill` `{ "enabled": true }` — kill switch: detiene el ciclo
  automático de inmediato (no cancela órdenes bracket ya colocadas en IBKR)

## Backtesting (antes de confiar en la estrategia)

Ver `specs/backtest-engine/` para el spec completo. Resumen de uso:

```bash
npm test  # corre los tests unitarios del motor de backtest
node scripts/backtest.js --symbols AAPL,MSFT,NVDA,JPM,XOM \
  --start 2022-01-01 --split 2023-07-01 --end 2024-06-01
```

- Precios históricos vienen de Stooq (gratis, sin API key) y se cachean en
  `data/price-cache/`.
- **Importante**: por ahora el sentimiento histórico está degradado (no hay
  proveedor gratis confiable con histórico) — el motor mide solo el
  componente de momentum. Esto se indica explícitamente en cada reporte
  (`dataQuality.sentimentThresholdOverridden`).
- El reporte separa resultados **in-sample** (usado para ajustar) y
  **out-of-sample** (nunca visto durante el ajuste) — solo el out-of-sample
  decide si la estrategia "pasa" (`report.passesGate`), contra:
  Sharpe ≥ 1.0, max drawdown ≤ 20%, profit factor > 1.3, ≥30 operaciones.
- También disponible como API: `POST /backtest`, `GET /backtest`,
  `GET /backtest/:runId`.
- Resultados persistidos en `data/backtests/<runId>/` (config, curva de
  equity, trades, reporte) para poder comparar corridas entre sí.

**No mover la estrategia a paper trading real (mucho menos a dinero real)
sin que `passesGate` sea `true` en el out-of-sample.**

## Sistema completo: activo + pasivo + agente híbrido + gate de graduación

Esta sección resume cómo encajan todas las piezas para la gestión completa
(activa y pasiva) que construimos:

### El "cerebro" híbrido (LLM investiga, reglas deciden)

`lib/agent/analystAgent.js` llama a Claude (Opus 5) para que actúe como un
analista senior: recibe el momentum técnico y titulares de noticias de un
candidato, y devuelve `{recommendation: BUY|HOLD|AVOID, confidence,
reasoning, riskFlags}` como salida estructurada (`output_config.format` +
Zod). **El agente solo puede restringir operaciones, nunca aprobar una que
la señal determinista ya rechazó, y nunca decide tamaño de posición ni
stops** — eso sigue 100% en `riskManager.js`. Si el agente no está
configurado (`ANTHROPIC_API_KEY` vacío) o falla, cae de forma segura a
`HOLD` — nunca asume BUY por defecto. Cachea su veredicto por símbolo/día
(`data/agent-cache/`) para no llamar al LLM en cada ciclo de 5 minutos.

Actívalo/desactívalo con `AGENT_GATE_ENABLED` (default `true`).

### El gate de graduación (obligatorio para dinero real)

`lib/graduation/graduationGate.js` es una condición **adicional y
automática**, aparte de `PAPER_MODE=false` + `LIVE_TRADING_CONFIRM`, que
bloquea cualquier orden real hasta que:

1. El backtest más reciente (`POST /backtest`) tenga `passesGate: true`.
2. Existan al menos `GRADUATION_MIN_PAPER_DAYS` (default 14) días de
   trading en paper **sin** haber tocado el límite de pérdida diaria.

Revisa el estado en `GET /graduation/status`. Esto existe porque pediste
capital real "desde ya" — el sistema no te va a dejar saltarte la
validación solo porque cambiaste una variable de entorno.

### Cartera pasiva (dividendos / ETFs para la jubilación)

`lib/passive/` tiene **dos mecanismos** distintos, por separado del motor activo:

1. **Rebalanceo a una asignación objetivo que tú defines**: `POST
   /passive/allocation {"symbol":"SCHD","targetPct":0.3}`, y `POST
   /passive/rebalance` calcula el desvío y las órdenes para volver al
   objetivo (sin stops/take profit — es buy-and-hold).
2. **DCA automático** (`lib/passive/autoDca.js`): sin que definas una
   asignación fija, `POST /passive/dca` toma los mejores candidatos del
   **screener** por salud de dividendos (excluyendo cualquiera sin datos de
   dividendo confiables) y reparte un monto de contribución fijo
   (`DCA_MONTHLY_AMOUNT`, default $200) entre los `DCA_TOP_N` mejores —
   dollar-cost averaging clásico, respetando un intervalo mínimo
   (`DCA_MIN_INTERVAL_DAYS`) para no duplicar la contribución del mes.

Ambos son **dry-run por defecto** — pasa `{"execute":true}` y activa
`PASSIVE_AUTOTRADE_ENABLED=true` / `DCA_ENABLED=true` respectivamente para
que ejecuten de verdad, y los dos pasan por el mismo gate de graduación que
el motor activo (una sola puerta de seguridad para todo el sistema, no una
más débil para lo "menos riesgoso").

### Mission Control

`GET /dashboard` — una sola página que muestra: estado del gate de
graduación (con barra de progreso), posiciones abiertas del motor activo,
kill switch, y el desvío de la cartera pasiva. Es la vista para responder
"¿esto está ganando o perdiendo plata, y ya se puede confiar en él?".

## Screener de acciones (descubrimiento, no ejecución)

Servicio **separado** (`screener-server.js`) que no toca tu cuenta IBKR —
solo lee precios (Stooq) y dividendos (Financial Modeling Prep, opcional)
públicos, y te muestra un ranking. **No compra ni vende nada.**

Criterios combinados (peso 50/50 configurable):
- **Técnico**: tendencia (precio vs. SMA50/SMA200), momentum (RSI), posición
  respecto al mínimo de 52 semanas.
- **Dividendos**: yield en rango sano (penaliza yields extremos como posible
  "trampa"), años consecutivos de crecimiento del dividendo, payout ratio.

Cada score muestra sus componentes (no es una caja negra) — la idea es que
investigues el candidato, no que confíes ciegamente en un número.

### Correr localmente

```bash
FMP_API_KEY=tu_key node screener-server.js   # o npm run screener
curl -X POST http://localhost:8080/run       # dispara una corrida
open http://localhost:8080                   # dashboard
```

Sin `FMP_API_KEY`, el criterio de dividendos queda degradado (solo técnico) —
igual que el sentimiento de noticias en el motor de trading, esto se marca
explícitamente en el resultado (`insufficientData`), nunca se inventa un dato.

### Desplegar en GCP (arquitectura propuesta)

**Cloud Scheduler → Cloud Run → Firestore → dashboard.** El screener no
necesita hablar con tu IB Gateway, así que vive separado del bridge (que
sigue en Railway).

```bash
export PROJECT_ID=tu-proyecto-gcp
export SCREENER_RUN_TOKEN=$(openssl rand -hex 16)
export FMP_API_KEY=tu_key   # opcional
./scripts/deploy-screener-gcp.sh
```

El script (revísalo antes de correrlo — no fue ejecutado por Claude, esta
sesión no tiene credenciales de GCP) crea: la base de Firestore, la imagen
en Cloud Build usando `Dockerfile.screener`, el servicio de Cloud Run
(`RESULTS_STORE=firestore`), y un job de Cloud Scheduler que dispara
`POST /run` cada día después del cierre de mercado.

Por defecto el servicio se despliega con `--no-allow-unauthenticated`
(dashboard privado) — usa `gcloud run services proxy` para verlo, o decide
tú si quieres exponerlo públicamente.

## Flujo recomendado

1. `POST /watchlist` para armar tu lista de símbolos
2. `POST /cycle` manualmente varias veces en cuenta paper, revisando `GET
   /status` y los logs — ajusta los umbrales/límites de riesgo en las
   variables de entorno según lo que veas
3. Si quieres automatizarlo, agenda `POST /cycle` externamente (cron) o activa
   `AUTOTRADE_ENABLED=true` para que el propio servidor lo dispare cada
   `AUTOTRADE_INTERVAL_MS`
4. Solo después de suficiente validación en paper, considera pasar a cuenta
   real siguiendo las salvaguardas de arriba
