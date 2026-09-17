const test = require('node:test');
const assert = require('node:assert/strict');
const { computeDividendScore } = require('../../lib/screener/dividendScore');

test('a healthy dividend profile (sweet-spot yield, long streak, safe payout) scores near max', () => {
  const result = computeDividendScore({ yieldPct: 3.5, consecutiveGrowthYears: 12, payoutRatioPct: 45, degraded: false });
  assert.ok(result.score >= 90, `expected a high score, got ${result.score}`);
});

test('an extreme yield is flagged as a possible trap and scores worse than a moderate one', () => {
  const trap = computeDividendScore({ yieldPct: 18, consecutiveGrowthYears: 0, payoutRatioPct: 95, degraded: false });
  const moderate = computeDividendScore({ yieldPct: 3, consecutiveGrowthYears: 0, payoutRatioPct: 95, degraded: false });
  assert.equal(trap.components.yield.note, 'yield_trap_risk');
  assert.ok(trap.score < moderate.score);
});

test('no dividend data at all is flagged as insufficient, not scored as zero-quality', () => {
  const result = computeDividendScore({ yieldPct: null, consecutiveGrowthYears: null, payoutRatioPct: null, degraded: true });
  assert.equal(result.insufficientData, true);
});

test('an unknown payout ratio scores worse than a confirmed-safe one, better than a confirmed-unsafe one', () => {
  const unknown = computeDividendScore({ yieldPct: 3, consecutiveGrowthYears: 5, payoutRatioPct: null, degraded: false });
  const safe = computeDividendScore({ yieldPct: 3, consecutiveGrowthYears: 5, payoutRatioPct: 40, degraded: false });
  const unsafe = computeDividendScore({ yieldPct: 3, consecutiveGrowthYears: 5, payoutRatioPct: 150, degraded: false });
  assert.ok(unsafe.score < unknown.score && unknown.score < safe.score);
});
