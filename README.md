# IBKR Bridge Server

Servidor puente entre el bot en Netlify e IB Gateway local.

## Deploy en Railway
1. Sube esta carpeta a GitHub
2. Conecta el repo en railway.app
3. Agrega variable de entorno: IBKR_HOST = tu IP pública

## Variables de entorno
- IBKR_HOST: IP pública de tu PC (ver abajo)
- IBKR_PORT: 5000 (por defecto)
- PORT: asignado por Railway automáticamente

## DCA (compras periódicas para inversión a largo plazo)
En vez de trading activo, el bridge puede comprar automáticamente un monto
fijo en USD de las acciones/ETFs que definas, en un horario programado
(dollar-cost averaging).

- DCA_ENABLED: 'true' para activar la ejecución automática (por defecto desactivado)
- DCA_ACCOUNT_ID: cuenta IBKR donde se ejecutan las compras
- DCA_ALLOCATIONS: JSON símbolo -> monto mensual en USD, ej: `{"VOO":300,"SCHD":200}`
- DCA_SCHEDULE: expresión cron en UTC (por defecto `0 9 1 * *`, día 1 de cada mes a las 9:00 UTC)

Endpoints:
- `POST /dca/run/:accountId` — dispara una ronda de compras manualmente (útil para probar antes de dejarlo en automático)
- `GET /dca/history` — historial de compras ejecutadas
- `GET /dca/config` — configuración actual (allocations, horario, si está activado)
