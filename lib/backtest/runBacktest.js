const priceHistory = require('./priceHistory');
const sentimentHistory = require('./sentimentHistory');
const { runSimulation } = require('./simulator');
const { computeMetrics } = require('./metrics');
const reportStore = require('./reportStore');
const baseConfig = require('../config');

const ACCEPTANCE_GATE = {
  minSharpe: 1.0,
  maxDrawdownFloor: -0.20, // i.e. drawdown must be no worse than -20%
  minProfitFactor: 1.3,
  minTrades: 30,
};

function addDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function buildSentimentMaps(universe, tradingDates) {
  const map = {};
  for (const symbol of universe) {
    const series = new Map();
    for (const date of tradingDates) {
      // sentimentHistory.getScore is currently a degraded stub (see requirements R2.2);
      // swapping in a real historical provider only requires changing this call.
      series.set(date, { score: 0, degraded: true });
    }
    map[symbol] = series;
  }
  return map;
}

// Equal-weight buy-at-start-close-and-hold benchmark, marked to market daily
// using each symbol's last known close (forward-filled across any gaps).
function buildBuyHoldCurve(symbolsBars, startDate, endDate, initialEquity) {
  const perSymbolBudget = initialEquity / symbolsBars.length;
  const dateSet = new Set();
  const holdings = symbolsBars.map(({ bars }) => {
    const inRange = bars.filter(b => b.date >= startDate && b.date <= endDate);
    inRange.forEach(b => dateSet.add(b.date));
    const entry = inRange[0];
    return { shares: entry ? perSymbolBudget / entry.c : 0, byDate: new Map(inRange.map(b => [b.date, b.c])) };
  });

  const dates = [...dateSet].sort();
  return dates.map(date => {
    let equity = 0;
    for (const holding of holdings) {
      const price = holding.byDate.get(date) ?? holding.lastClose;
      if (price !== undefined) { equity += holding.shares * price; holding.lastClose = price; }
    }
    return { date, equity };
  });
}

// Orchestrates a full backtest run: fetches data, runs the simulator over an
// in-sample and out-of-sample split, computes metrics + a buy&hold benchmark,
// evaluates the acceptance gate, and persists everything. See
// specs/backtest-engine/{requirements,design}.md.
async function runBacktest({
  universe, startDate, splitDate, endDate, initialEquity = 100000, configOverrides = {},
  priceProvider = priceHistory, // injectable for tests — avoids hitting Stooq in unit tests
}) {
  if (!(startDate < splitDate && splitDate < endDate)) {
    throw new Error('Expected startDate < splitDate < endDate');
  }

  const warmupStart = addDays(startDate, -30); // buffer so lookback has data on day 1

  const symbolsData = [];
  const gapsBySymbol = {};
  for (const symbol of universe) {
    const { bars, gaps } = await priceProvider.getHistoricalBars(symbol, warmupStart, endDate);
    symbolsData.push({ symbol, bars });
    if (gaps.length) gapsBySymbol[symbol] = gaps;
  }

  const allDates = [...new Set(symbolsData.flatMap(s => s.bars.map(b => b.date)))]
    .filter(d => d >= startDate && d <= endDate)
    .sort();
  const sentiment = buildSentimentMaps(universe, allDates);
  const sentimentIsFullyDegraded = Object.values(sentiment)
    .every(series => [...series.values()].every(p => p.degraded));

  const config = {
    ...baseConfig,
    LOOKBACK_DAYS: 5,
    BACKTEST_COMMISSION_PER_TRADE: 1.0,
    BACKTEST_SLIPPAGE_BPS: 5,
    ...configOverrides,
  };
  // See design.md: an "agreement" gate against permanently-neutral sentiment
  // would never fire, so neutralize the sentiment threshold when degraded.
  if (sentimentIsFullyDegraded) config.SENTIMENT_THRESHOLD = 0;

  const inSample = runSimulation({
    symbols: symbolsData, sentiment, startDate, endDate: splitDate, initialEquity, config,
  });
  const outOfSample = runSimulation({
    symbols: symbolsData, sentiment, startDate: addDays(splitDate, 1), endDate, initialEquity, config,
  });

  const benchmarkIn = buildBuyHoldCurve(symbolsData, startDate, splitDate, initialEquity);
  const benchmarkOut = buildBuyHoldCurve(symbolsData, addDays(splitDate, 1), endDate, initialEquity);

  const report = {
    universe,
    period: { start: startDate, split: splitDate, end: endDate },
    inSample: computeMetrics(inSample.equityCurve, inSample.trades),
    outOfSample: computeMetrics(outOfSample.equityCurve, outOfSample.trades),
    benchmark: {
      inSample: computeMetrics(benchmarkIn, []),
      outOfSample: computeMetrics(benchmarkOut, []),
    },
    dataQuality: {
      sentimentDegradedPct: sentimentIsFullyDegraded ? 1 : outOfSample.dataQuality.sentimentDegradedPct,
      sentimentThresholdOverridden: sentimentIsFullyDegraded,
      priceGapsFound: gapsBySymbol,
    },
  };

  const oos = report.outOfSample;
  report.passesGate = (
    oos.sharpeRatio >= ACCEPTANCE_GATE.minSharpe &&
    oos.maxDrawdownPct >= ACCEPTANCE_GATE.maxDrawdownFloor &&
    oos.profitFactor > ACCEPTANCE_GATE.minProfitFactor &&
    oos.totalTrades >= ACCEPTANCE_GATE.minTrades
  );
  report.gateThresholds = ACCEPTANCE_GATE;

  const runId = reportStore.newRunId();
  const savedTo = reportStore.saveRun(runId, {
    config: { ...config, universe, startDate, splitDate, endDate, initialEquity },
    equityCurve: { inSample: inSample.equityCurve, outOfSample: outOfSample.equityCurve },
    trades: { inSample: inSample.trades, outOfSample: outOfSample.trades },
    report,
  });

  return { runId, savedTo, report };
}

module.exports = { runBacktest, ACCEPTANCE_GATE };
