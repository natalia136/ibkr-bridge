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
