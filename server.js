const express = require('express');
const cors = require('cors');
const https = require('https');
const http = require('http');

const app = express();
app.use(cors());
app.use(express.json());

// IB Gateway corre en localhost:5000 en tu PC
// Este servidor actúa como proxy seguro
const IBKR_HOST = process.env.IBKR_HOST || 'localhost';
const IBKR_PORT = process.env.IBKR_PORT || '5000';

function proxyRequest(path, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: IBKR_HOST,
      port: IBKR_PORT,
      path: `/v1/api${path}`,
      method,
      headers: { 'Content-Type': 'application/json' },
      rejectUnauthorized: false
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve(data); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', ibkr: `${IBKR_HOST}:${IBKR_PORT}` }));

// Auth status
app.get('/auth', async (req, res) => {
  try {
    const data = await proxyRequest('/iserver/auth/status');
    res.json(data);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Keep alive
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

// Get portfolio
app.get('/portfolio/:accountId', async (req, res) => {
  try {
    const data = await proxyRequest(`/portfolio/${req.params.accountId}/summary`);
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
    res.json(data);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Confirm order (IBKR sometimes requires confirmation)
app.post('/confirm/:replyId', async (req, res) => {
  try {
    const data = await proxyRequest(`/iserver/reply/${req.params.replyId}`, 'POST', { confirmed: true });
    res.json(data);
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
  console.log(`IBKR Bridge corriendo en puerto ${PORT}`);
  
  // Keep-alive: hace tickle cada 50 segundos para evitar DISCONNECT_ON_INACTIVITY
  setInterval(async () => {
    try {
      await proxyRequest('/tickle', 'POST');
      console.log('[Keep-alive] Tickle enviado a IB Gateway');
    } catch(e) {
      console.log('[Keep-alive] IB Gateway no responde, reintentando...');
    }
  }, 50000);
});
