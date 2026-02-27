const express = require('express');
const cors = require('cors');
const https = require('https');
const http = require('http');

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
});
