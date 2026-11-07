const express = require('express');
const cors = require('cors');

const ibkr = require('./lib/ibkrClient');
const config = require('./lib/config');
const stateStore = require('./lib/stateStore');
const watchlistStore = require('./lib/watchlist');
const tradingCycle = require('./lib/tradingCycle');
const { runBacktest } = require('./lib/backtest/runBacktest');
const backtestStore = require('./lib/backtest/reportStore');
const { checkGraduation } = require('./lib/graduation/graduationGate');
const equityHistory = require('./lib/equityHistory');
const allocationStore = require('./lib/passive/allocation');
const { runRebalance } = require('./lib/passive/portfolioManager');
const { runDca } = require('./lib/passive/autoDca');
const { renderMissionControl } = require('./lib/dashboard');

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

// ---- Graduation gate (see lib/graduation/graduationGate.js) ----
// Whether real-money trading is currently allowed, on top of manually
// flipping PAPER_MODE/LIVE_TRADING_CONFIRM.

app.get('/graduation/status', (req, res) => {
  res.json(checkGraduation({ MIN_PAPER_DAYS: config.GRADUATION_MIN_PAPER_DAYS }));
});

app.get('/equity-history', (req, res) => {
  res.json({ history: equityHistory.load() });
});

// ---- Passive portfolio (long-term dividend/ETF book, see lib/passive/) ----

app.get('/passive/allocation', (req, res) => {
  res.json(allocationStore.load());
});

app.post('/passive/allocation', async (req, res) => {
  try {
    const { symbol, targetPct } = req.body;
    if (!symbol || targetPct == null) return res.status(400).json({ error: 'symbol and targetPct are required' });
    res.json(await allocationStore.setTarget(symbol, targetPct));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/passive/allocation/:symbol', (req, res) => {
  res.json(allocationStore.removeTarget(req.params.symbol));
});

// Dry-run by default — pass {"execute": true} to actually place rebalance
// orders (also requires PASSIVE_AUTOTRADE_ENABLED=true and the same
// paper/live/graduation safety gate as the active engine).
app.post('/passive/rebalance', async (req, res) => {
  try {
    res.json(await runRebalance({ execute: req.body?.execute === true }));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Dollar-cost-averaging into the screener's top dividend candidates — a
// different mechanism from /passive/rebalance (no fixed target allocation,
// just periodically deploying new money into whatever currently ranks best).
// Dry-run by default — pass {"execute": true} to actually place orders
// (also requires DCA_ENABLED=true and the same graduation gate).
app.post('/passive/dca', async (req, res) => {
  try {
    res.json(await runDca({ execute: req.body?.execute === true }));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/dashboard', async (req, res) => {
  try {
    const [graduation, allocation, rebalancePreview] = await Promise.all([
      Promise.resolve(checkGraduation({ MIN_PAPER_DAYS: config.GRADUATION_MIN_PAPER_DAYS })),
      Promise.resolve(allocationStore.load()),
      runRebalance({ execute: false }).catch(e => ({ rebalanced: false, reason: e.message })),
    ]);
    const state = stateStore.load();
    const watchlist = watchlistStore.load();
    res.type('html').send(renderMissionControl({ graduation, allocation, rebalancePreview, state, watchlist, config }));
  } catch (e) { res.status(500).json({ error: e.message }); }
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
