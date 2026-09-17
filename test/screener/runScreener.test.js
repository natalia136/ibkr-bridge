const test = require('node:test');
const assert = require('node:assert/strict');
const { runScreener } = require('../../lib/screener/runScreener');
const resultsStore = require('../../lib/screener/resultsStore');

function makeBars(days, fn) {
  const bars = [];
  for (let i = 0; i < days; i++) {
    const c = fn(i);
    bars.push({ date: `2024-01-${String((i % 28) + 1).padStart(2, '0')}`, o: c, h: c * 1.001, l: c * 0.999, c, v: 1000 });
  }
  return bars;
}

function fakePriceProvider(barsBySymbol) {
  return { async getHistoricalBars(symbol) { return { bars: barsBySymbol[symbol] || [], gaps: [] }; } };
}

function fakeDividendProvider(profileBySymbol) {
  return { async getDividendProfile(symbol) { return profileBySymbol[symbol] || { yieldPct: null, consecutiveGrowthYears: null, payoutRatioPct: null, degraded: true }; } };
}

test('runScreener ranks a strong candidate above a weak one and persists the run', async () => {
  const strongBars = makeBars(260, i => 50 + i * 0.3);
  const weakBars = makeBars(260, i => 300 - i * 0.3);

  const priceProvider = fakePriceProvider({ STRONG: strongBars, WEAK: weakBars });
  const dividendProviderImpl = fakeDividendProvider({
    STRONG: { yieldPct: 3, consecutiveGrowthYears: 10, payoutRatioPct: 40, degraded: false },
    WEAK: { yieldPct: null, consecutiveGrowthYears: null, payoutRatioPct: null, degraded: true },
  });

  const result = await runScreener({ universe: ['STRONG', 'WEAK'], priceProvider, dividendProviderImpl });

  assert.equal(result.candidates.length, 2);
  assert.equal(result.candidates[0].symbol, 'STRONG');
  assert.ok(result.candidates[0].combinedScore > result.candidates[1].combinedScore);

  const latest = await resultsStore.getLatest();
  assert.equal(latest.runId, result.runId);
});

test('runScreener continues past a symbol that fails to fetch', async () => {
  const priceProvider = {
    async getHistoricalBars(symbol) {
      if (symbol === 'BROKEN') throw new Error('no data');
      return { bars: makeBars(260, i => 100 + i * 0.1), gaps: [] };
    },
  };
  const dividendProviderImpl = fakeDividendProvider({});

  const result = await runScreener({ universe: ['OK', 'BROKEN'], priceProvider, dividendProviderImpl });
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].symbol, 'OK');
  assert.equal(result.failed.length, 1);
  assert.equal(result.failed[0].symbol, 'BROKEN');
});
