const express = require('express');
const cors = require('cors');
const https = require('https');
const http = require('http');
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

const IBKR_HOST = process.env.IBKR_HOST || 'localhost';
const IBKR_PORT = process.env.IBKR_PORT || '4001';

function proxyRequest(path, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const isNgrok = IBKR_HOST.includes('ngrok') || IBKR_HOST.includes('.app') || IBKR_HOST.includes('.dev');
    const protocol = isNgrok ? https : http;
    const port = isNgrok ? 443 : parseInt(IBKR_PORT);

    const options = {
      hostname: IBKR_HOST,
      port: port,
      path: `/v1/api${path}`,
      method,
      headers: {
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': '1',
        'User-Agent': 'ibkr-bridge/1.0'
      },
      rejectUnauthorized: false,
      timeout: 15000
    };

    const req = protocol.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log(`[${method}] ${path} → ${res.statusCode}: ${data.substring(0,100)}`);
        try { resolve(JSON.parse(data)); }
        catch { resolve({ raw: data, status: res.statusCode }); }
      });
    });

    req.on('error', (e) => {
      console.error(`[ERROR] ${path}: ${e.message}`);
      reject(e);
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', ibkr: `${IBKR_HOST}:${IBKR_PORT}`, time: new Date().toISOString() });
});

// Test connection to IB Gateway
app.get('/test', async (req, res) => {
  try {
    const data = await proxyRequest('/iserver/auth/status');
    res.json({ connected: true, data });
  } catch(e) {
    res.json({ connected: false, error: e.message });
  }
});

// Auth status
app.get('/auth', async (req, res) => {
  try {
    const data = await proxyRequest('/iserver/auth/status');
    res.json(data);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Keep alive tickle
app.post('/tickle', async (req, res) => {
  try {
    const data = await proxyRequest('/tickle', 'POST');
    res.json(data);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Get accounts
app.get('/accounts', async (req, res) => {
  try {
    const data = await proxyRequest('/iserver/accounts');
    res.json(data);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Search contract
app.get('/search/:symbol', async (req, res) => {
  try {
    const data = await proxyRequest(`/iserver/secdef/search?symbol=${req.params.symbol}&name=true&secType=STK`);
    res.json(data);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Get price bars
app.get('/bars/:conid', async (req, res) => {
  try {
    const data = await proxyRequest(`/iserver/marketdata/history?conid=${req.params.conid}&period=1h&bar=1min&outsideRth=false`);
    res.json(data);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Place order
app.post('/order', async (req, res) => {
  try {
    const { accountId, conid, side, quantity } = req.body;
    const data = await proxyRequest(`/iserver/account/${accountId}/orders`, 'POST', {
      orders: [{ conid, orderType: 'MKT', side, quantity, tif: 'DAY', acctId: accountId }]
    });
    // Handle IBKR confirmation requirement
    if (Array.isArray(data) && data[0]?.id) {
      const confirm = await proxyRequest(`/iserver/reply/${data[0].id}`, 'POST', { confirmed: true });
      res.json(confirm);
    } else {
      res.json(data);
    }
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Get positions
app.get('/positions/:accountId', async (req, res) => {
  try {
    const data = await proxyRequest(`/portfolio/${req.params.accountId}/positions/0`);
    res.json(data);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── DCA (Dollar-Cost Averaging): compra automática periódica para inversión
// a largo plazo, en vez de trading activo. Compra un monto fijo en USD de
// cada símbolo configurado, en el horario definido por DCA_SCHEDULE.
//
// Variables de entorno:
//   DCA_ENABLED     - 'true' para activar la ejecución programada (cron)
//   DCA_ACCOUNT_ID  - cuenta IBKR donde se ejecutan las compras programadas
//   DCA_ALLOCATIONS - JSON con símbolo -> monto mensual en USD,
//                     ej: {"VOO":300,"SCHD":200}
//   DCA_SCHEDULE    - expresión cron (default: '0 9 1 * *' → día 1 de cada
//                     mes, 9:00 UTC)

const DCA_HISTORY_FILE = path.join(__dirname, 'dca-history.json');

function loadDcaHistory() {
  try {
    return JSON.parse(fs.readFileSync(DCA_HISTORY_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function appendDcaHistory(entry) {
  const history = loadDcaHistory();
  history.push(entry);
  // Nota: en Railway sin un volumen persistente, este archivo se pierde en
  // cada redeploy/restart. Para llevar un historial confiable, apuntar
  // DCA_HISTORY_FILE a un volumen montado o exportar a un servicio externo.
  fs.writeFileSync(DCA_HISTORY_FILE, JSON.stringify(history, null, 2));
}

function getDcaAllocations() {
  try {
    return JSON.parse(process.env.DCA_ALLOCATIONS || '{}');
  } catch (e) {
    console.error('[DCA] DCA_ALLOCATIONS inválido, debe ser JSON. Ej: {"VOO":300,"SCHD":200}');
    return {};
  }
}

async function resolveConid(symbol) {
  const results = await proxyRequest(`/iserver/secdef/search?symbol=${symbol}&name=true&secType=STK`);
  const match = Array.isArray(results) ? results.find(r => r.symbol === symbol) : null;
  if (!match) throw new Error(`No se encontró conid para ${symbol}`);
  return match.conid;
}

async function getLastPrice(conid) {
  const snapshot = await proxyRequest(`/iserver/marketdata/snapshot?conids=${conid}&fields=31`);
  const price = Array.isArray(snapshot) ? parseFloat(snapshot[0]?.['31']) : NaN;
  if (!price || isNaN(price)) throw new Error(`No se pudo obtener precio para conid ${conid}`);
  return price;
}

// Ejecuta una ronda de compras DCA: por cada símbolo configurado, calcula
// cuántas acciones enteras entran en el monto asignado y compra a mercado.
// Solo acciones enteras (sin fraccionarias) — el remanente no usado queda
// registrado en el historial para ajustar el próximo mes si se desea.
async function runDca(accountId) {
  const allocations = getDcaAllocations();
  const symbols = Object.keys(allocations);
  const results = [];

  for (const symbol of symbols) {
    const usdAmount = allocations[symbol];
    try {
      const conid = await resolveConid(symbol);
      const price = await getLastPrice(conid);
      const quantity = Math.floor(usdAmount / price);

      if (quantity < 1) {
        const skipped = { date: new Date().toISOString(), symbol, price, skipped: true, reason: `Monto $${usdAmount} insuficiente para 1 acción a $${price}` };
        appendDcaHistory(skipped);
        results.push(skipped);
        continue;
      }

      const order = await proxyRequest(`/iserver/account/${accountId}/orders`, 'POST', {
        orders: [{ conid, orderType: 'MKT', side: 'BUY', quantity, tif: 'DAY', acctId: accountId }]
      });

      // Igual que en /order: IBKR puede pedir confirmación antes de ejecutar.
      let finalOrder = order;
      if (Array.isArray(order) && order[0]?.id) {
        finalOrder = await proxyRequest(`/iserver/reply/${order[0].id}`, 'POST', { confirmed: true });
      }

      const entry = {
        date: new Date().toISOString(),
        symbol, conid, price, quantity,
        spent: +(price * quantity).toFixed(2),
        order: finalOrder
      };
      appendDcaHistory(entry);
      results.push(entry);
    } catch (e) {
      const failed = { date: new Date().toISOString(), symbol, error: e.message };
      appendDcaHistory(failed);
      results.push(failed);
    }
  }
  return results;
}

// Dispara manualmente una ronda de compras DCA (útil para probar la
// configuración antes de dejarla en automático).
app.post('/dca/run/:accountId', async (req, res) => {
  try {
    const results = await runDca(req.params.accountId);
    res.json({ results });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Historial de compras DCA ejecutadas (manuales y programadas).
app.get('/dca/history', (req, res) => {
  res.json(loadDcaHistory());
});

// Configuración DCA actual, para verificar qué se va a comprar y cuándo.
app.get('/dca/config', (req, res) => {
  res.json({
    allocations: getDcaAllocations(),
    schedule: process.env.DCA_SCHEDULE || '0 9 1 * *',
    enabled: process.env.DCA_ENABLED === 'true'
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`IBKR Bridge v2 corriendo en puerto ${PORT}`);
  console.log(`Conectando a IB Gateway en: ${IBKR_HOST}:${IBKR_PORT}`);

  // Keep-alive cada 50 segundos
  setInterval(async () => {
    try {
      await proxyRequest('/tickle', 'POST');
      console.log('[Keep-alive] OK');
    } catch(e) {
      console.log('[Keep-alive] Error:', e.message);
    }
  }, 50000);

  // Compras DCA programadas (desactivado por defecto: hay que configurar
  // DCA_ENABLED=true y DCA_ACCOUNT_ID explícitamente para que compre plata real).
  const dcaSchedule = process.env.DCA_SCHEDULE || '0 9 1 * *';
  if (process.env.DCA_ENABLED === 'true' && process.env.DCA_ACCOUNT_ID) {
    cron.schedule(dcaSchedule, async () => {
      console.log('[DCA] Ejecutando compras programadas...');
      const results = await runDca(process.env.DCA_ACCOUNT_ID);
      console.log('[DCA] Resultado:', JSON.stringify(results));
    });
    console.log(`[DCA] Compras automáticas activadas. Horario (cron UTC): ${dcaSchedule}`);
  } else {
    console.log('[DCA] Compras automáticas desactivadas (configurar DCA_ENABLED=true, DCA_ACCOUNT_ID y DCA_ALLOCATIONS para activar)');
  }
});
