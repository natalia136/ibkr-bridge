const priceHistory = require('../backtest/priceHistory');
const dividendProvider = require('./dividendProvider');
const { computeTechnicalScore } = require('./technicalScore');
const { computeDividendScore } = require('./dividendScore');
const resultsStore = require('./resultsStore');
const { getUniverse } = require('./universe');

function addDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Combined score is a weighted average of the technical and dividend scores.
// Both default to 50/50 (per the "trend + dividends" criteria chosen), overridable
// via env vars so the weighting can be tuned without a code change.
function weights() {
  const technical = parseFloat(process.env.SCREENER_WEIGHT_TECHNICAL ?? '0.5');
  const dividend = parseFloat(process.env.SCREENER_WEIGHT_DIVIDEND ?? '0.5');
  const total = technical + dividend;
  return { technical: technical / total, dividend: dividend / total };
}

async function scoreSymbol(symbol, endDate, w, priceProvider, dividendProviderImpl) {
  const startDate = addDays(endDate, -400); // >200 trading days for SMA200 + buffer
  const [{ bars }, dividendProfile] = await Promise.all([
    priceProvider.getHistoricalBars(symbol, startDate, endDate),
    dividendProviderImpl.getDividendProfile(symbol),
  ]);

  const technical = computeTechnicalScore(bars);
  const dividend = computeDividendScore(dividendProfile);
  const combinedScore = Math.round(w.technical * technical.score + w.dividend * dividend.score);

  return { symbol, combinedScore, technical, dividend };
}

// Scans the universe, scores each symbol on technical trend + dividend health,
// and persists a ranked report. This never places or suggests a specific trade —
// it only surfaces candidates worth a human researching further (see README).
async function runScreener({
  universe = getUniverse(), asOfDate = new Date().toISOString().slice(0, 10),
  priceProvider = priceHistory, dividendProviderImpl = dividendProvider, // injectable for tests
} = {}) {
  const w = weights();
  const results = [];
  for (const symbol of universe) {
    try {
      results.push(await scoreSymbol(symbol, asOfDate, w, priceProvider, dividendProviderImpl));
    } catch (e) {
      results.push({ symbol, error: e.message });
    }
  }

  const ranked = results
    .filter(r => !r.error)
    .sort((a, b) => b.combinedScore - a.combinedScore);
  const failed = results.filter(r => r.error);

  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  const payload = {
    asOfDate, weights: w, candidates: ranked, failed,
    generatedAt: new Date().toISOString(),
  };
  await resultsStore.saveRun(runId, payload);

  return { runId, ...payload };
}

module.exports = { runScreener, weights };
