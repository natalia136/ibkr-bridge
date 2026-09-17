const https = require('https');
const http = require('http');

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

// Resolves any pending order confirmation messages (IBKR often asks more than one
// question in sequence - e.g. "outside RTH", "price cap", "no borrow available").
async function confirmOrderChain(response, maxSteps = 5) {
  let current = response;
  for (let i = 0; i < maxSteps; i++) {
    if (Array.isArray(current) && current[0]?.id) {
      current = await proxyRequest(`/iserver/reply/${current[0].id}`, 'POST', { confirmed: true });
    } else {
      return current;
    }
  }
  return current;
}

async function getAccounts() {
  return proxyRequest('/iserver/accounts');
}

async function getAccountSummary(accountId) {
  return proxyRequest(`/portfolio/${accountId}/summary`);
}

async function getPositions(accountId) {
  return proxyRequest(`/portfolio/${accountId}/positions/0`);
}

async function searchSymbol(symbol) {
  return proxyRequest(`/iserver/secdef/search?symbol=${encodeURIComponent(symbol)}&name=true&secType=STK`);
}

async function getBars(conid, period = '1d', bar = '5min') {
  return proxyRequest(`/iserver/marketdata/history?conid=${conid}&period=${period}&bar=${bar}&outsideRth=false`);
}

async function placeOrders(accountId, orders) {
  const data = await proxyRequest(`/iserver/account/${accountId}/orders`, 'POST', { orders });
  return confirmOrderChain(data);
}

module.exports = {
  IBKR_HOST,
  IBKR_PORT,
  proxyRequest,
  confirmOrderChain,
  getAccounts,
  getAccountSummary,
  getPositions,
  searchSymbol,
  getBars,
  placeOrders,
};
