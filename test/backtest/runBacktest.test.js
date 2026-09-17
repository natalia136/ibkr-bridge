const test = require('node:test');
const assert = require('node:assert/strict');
const { runBacktest } = require('../../lib/backtest/runBacktest');

function makeBars(startDate, days, startPrice, dailyGainPct) {
  const bars = [];
  let price = startPrice;
  const date = new Date(startDate);
  for (let i = 0; i < days; i++) {
    // skip weekends so gap detection doesn't flag them
    if (date.getUTCDay() !== 0 && date.getUTCDay() !== 6) {
      const iso = date.toISOString().slice(0, 10);
      const open = price;
      price = price * (1 + dailyGainPct);
      bars.push({ date: iso, o: open, h: Math.max(open, price) * 1.002, l: Math.min(open, price) * 0.998, c: price, v: 500000 });
    }
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return bars;
}

function fakePriceProvider(barsBySymbol) {
  return {
    async getHistoricalBars(symbol, from, to) {
      const all = barsBySymbol[symbol] || [];
      const bars = all.filter(b => b.date >= from && b.date <= to);
      return { symbol, bars, gaps: [] };
    },
  };
}

test('runBacktest produces an in-sample/out-of-sample report and persists it', async () => {
  const bars = makeBars('2023-11-01', 200, 100, 0.006); // mild steady uptrend
  const priceProvider = fakePriceProvider({ AAA: bars });

  const result = await runBacktest({
    universe: ['AAA'],
    startDate: '2024-01-02',
    splitDate: '2024-03-01',
    endDate: '2024-05-01',
    initialEquity: 100000,
    priceProvider,
  });

  assert.ok(result.runId);
  assert.ok(result.report.inSample);
  assert.ok(result.report.outOfSample);
  assert.ok(result.report.benchmark.inSample);
  assert.equal(result.report.dataQuality.sentimentThresholdOverridden, true);
  assert.equal(typeof result.report.passesGate, 'boolean');

  const { loadRun } = require('../../lib/backtest/reportStore');
  const reloaded = loadRun(result.runId);
  assert.deepEqual(reloaded.report, result.report);
});

test('runBacktest rejects a split date outside the start/end range', async () => {
  const priceProvider = fakePriceProvider({});
  await assert.rejects(
    () => runBacktest({ universe: ['AAA'], startDate: '2024-01-01', splitDate: '2024-06-01', endDate: '2024-03-01', priceProvider }),
    /Expected startDate < splitDate < endDate/
  );
});
