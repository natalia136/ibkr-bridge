const express = require('express');
const cors = require('cors');

const ibkr = require('./lib/ibkrClient');
const config = require('./lib/config');
const stateStore = require('./lib/stateStore');
const watchlistStore = require('./lib/watchlist');
const tradingCycle = require('./lib/tradingCycle');
const { runBacktest } = require('./lib/backtest/runBacktest');
const backtestStore = require('./lib/backtest/reportStore');

const app = express();
app.use(cors());
app.use(express.json());

// ---- Basic bridge endpoints (manual/inspection use) ----

app.get('/health', (req, res) => {
  res.json({ status: 'ok', ibkr: `${ibkr.IBKR_HOST}:${ibkr.IBKR_PORT}`, time: new Date().toISOString() });
});

app.get('/test', async (req, res) => {
  try {
    const data = await ibkr.proxyRequest('/iserver/auth/status');
    res.json({ connected: true, data });
  } catch (e) { res.json({ connected: false, error: e.message }); }
});

app.get('/auth', async (req, res) => {
  try { res.json(await ibkr.proxyRequest('/iserver/auth/status')); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/tickle', async (req, res) => {
  try { res.json(await ibkr.proxyRequest('/tickle', 'POST')); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/accounts', async (req, res) => {
  try { res.json(await ibkr.getAccounts()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/search/:symbol', async (req, res) => {
  try { res.json(await ibkr.searchSymbol(req.params.symbol)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/bars/:conid', async (req, res) => {
  try { res.json(await ibkr.getBars(req.params.conid, req.query.period || '1h', req.query.bar || '1min')); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// Raw manual order (no bracket, no risk checks) — kept for manual/ad-hoc use.
// Automated trading goes through /cycle, which applies risk limits and bracket orders.
app.post('/order', async (req, res) => {
  try {
    const { accountId, conid, side, quantity } = req.body;
    const data = await ibkr.placeOrders(accountId, [
      { conid, orderType: 'MKT', side, quantity, tif: 'DAY', acctId: accountId },
    ]);
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/positions/:accountId', async (req, res) => {
  try { res.json(await ibkr.getPositions(req.params.accountId)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ---- Automated trading endpoints ----

app.get('/watchlist', (req, res) => {
  res.json(watchlistStore.load());
});

app.post('/watchlist', async (req, res) => {
  try {
    const { symbol } = req.body;
    if (!symbol) return res.status(400).json({ error: 'symbol is required' });
    res.json(await watchlistStore.addSymbol(symbol));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/watchlist/:symbol', (req, res) => {
  res.json(watchlistStore.removeSymbol(req.params.symbol));
});

app.get('/status', (req, res) => {
  res.json({ config, state: stateStore.load() });
});

// Kill switch: flip on to immediately stop the automated cycle from opening/closing
// any more positions. Existing bracket orders already sitting at IBKR are unaffected —
// their stop-loss/take-profit legs keep working independently.
app.post('/kill', (req, res) => {
  const state = stateStore.load();
  state.killSwitch = req.body?.enabled !== false;
  stateStore.save(state);
  res.json({ killSwitch: state.killSwitch });
});

app.post('/cycle', async (req, res) => {
  try {
    res.json(await tradingCycle.runCycle());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ---- Backtesting (see specs/backtest-engine/) ----
// Validates the strategy against history before it runs against any more capital.

app.post('/backtest', async (req, res) => {
  try {
    const { symbols, start, split, end, equity } = req.body;
    if (!symbols?.length || !start || !split || !end) {
      return res.status(400).json({ error: 'symbols (array), start, split, end are required' });
    }
    const { runId, report } = await runBacktest({
      universe: symbols.map(s => s.toUpperCase()),
      startDate: start, splitDate: split, endDate: end,
      initialEquity: equity || 100000,
    });
    res.json({ runId, report });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/backtest', (req, res) => {
  res.json({ runs: backtestStore.listRuns() });
});

app.get('/backtest/:runId', (req, res) => {
  try { res.json(backtestStore.loadRun(req.params.runId)); }
  catch (e) { res.status(404).json({ error: `run not found: ${req.params.runId}` }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`IBKR Bridge v2 corriendo en puerto ${PORT}`);
  console.log(`Conectando a IB Gateway en: ${ibkr.IBKR_HOST}:${ibkr.IBKR_PORT}`);
  console.log(`PAPER_MODE=${config.PAPER_MODE} AUTOTRADE_ENABLED=${config.AUTOTRADE_ENABLED}`);

  // Keep-alive tickle so the IB Gateway session doesn't expire.
  setInterval(async () => {
    try {
      await ibkr.proxyRequest('/tickle', 'POST');
      console.log('[Keep-alive] OK');
    } catch (e) {
      console.log('[Keep-alive] Error:', e.message);
    }
  }, 50000);

  // Fully automated cycle, off by default. Enable with AUTOTRADE_ENABLED=true
  // once you've validated the strategy manually via POST /cycle in paper trading.
  if (config.AUTOTRADE_ENABLED) {
    setInterval(async () => {
      try {
        const result = await tradingCycle.runCycle();
        console.log('[AutoTrade]', JSON.stringify(result.halted ? result : { actions: result.actions }));
      } catch (e) {
        console.error('[AutoTrade] Error:', e.message);
      }
    }, config.AUTOTRADE_INTERVAL_MS);
  }
});
