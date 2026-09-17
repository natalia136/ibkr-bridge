// Standalone service: the stock screener. Deliberately separate from server.js
// (the IBKR bridge) — this only reads public market/dividend data, never touches
// an IBKR account, so it can run anywhere (designed for Cloud Run) without needing
// network access to your IB Gateway. See specs/screener/ and README's GCP section.
const express = require('express');
const cors = require('cors');

const { runScreener } = require('./lib/screener/runScreener');
const resultsStore = require('./lib/screener/resultsStore');
const { renderDashboard } = require('./lib/screener/dashboard');

const app = express();
app.use(cors());
app.use(express.json());

// Optional shared-secret check for the trigger endpoint, so this doesn't run for
// just anyone who finds the URL. Set SCREENER_RUN_TOKEN to enable it (Cloud
// Scheduler sends it as a header); leave unset only for local/dev use.
function requireRunToken(req, res, next) {
  const expected = process.env.SCREENER_RUN_TOKEN;
  if (!expected) return next();
  if (req.get('X-Run-Token') !== expected) return res.status(401).json({ error: 'invalid or missing X-Run-Token' });
  next();
}

app.get('/health', (req, res) => {
  res.json({ status: 'ok', resultsBackend: resultsStore.activeBackend, time: new Date().toISOString() });
});

app.post('/run', requireRunToken, async (req, res) => {
  try {
    const universe = Array.isArray(req.body?.universe) ? req.body.universe : undefined;
    const result = await runScreener({ universe });
    res.json({ runId: result.runId, candidateCount: result.candidates.length, failedCount: result.failed.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/results', async (req, res) => {
  const latest = await resultsStore.getLatest();
  res.json(latest || { message: 'no runs yet — POST /run first' });
});

app.get('/runs', async (req, res) => {
  res.json({ runs: await resultsStore.listRuns() });
});

app.get('/', async (req, res) => {
  const latest = await resultsStore.getLatest();
  res.type('html').send(renderDashboard(latest));
});

const PORT = process.env.PORT || 8080; // Cloud Run injects PORT
app.listen(PORT, () => {
  console.log(`Screener service listening on ${PORT} (results backend: ${resultsStore.activeBackend})`);
});
