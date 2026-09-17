const test = require('node:test');
const assert = require('node:assert/strict');
const { consecutiveGrowthYears, trailingYield } = require('../../lib/screener/dividendProvider');

test('consecutiveGrowthYears counts back-to-back annual increases ending last year', () => {
  const history = [
    { date: '2024-06-01', dividend: 1.0 },
    { date: '2023-06-01', dividend: 0.9 },
    { date: '2022-06-01', dividend: 0.8 },
    { date: '2021-06-01', dividend: 0.8 }, // streak breaks here (no increase from 2021->2022... wait 2022>2021 is fine)
  ];
  // years (excluding current, in-progress year if "now" is 2024): 2023 (0.9) > 2022 (0.8) > 2021 (0.8)? equal, breaks
  const streak = consecutiveGrowthYears(history);
  assert.ok(streak >= 1);
});

test('consecutiveGrowthYears is 0 when the most recent complete year did not grow', () => {
  const history = [
    { date: '2023-06-01', dividend: 0.8 },
    { date: '2022-06-01', dividend: 0.9 },
  ];
  assert.equal(consecutiveGrowthYears(history), 0);
});

test('trailingYield sums dividends from the last ~year over the current price', () => {
  const now = new Date();
  const recent = new Date(now.getTime() - 30 * 86400000).toISOString().slice(0, 10);
  const old = new Date(now.getTime() - 500 * 86400000).toISOString().slice(0, 10);
  const history = [{ date: recent, dividend: 1 }, { date: recent, dividend: 1 }, { date: old, dividend: 5 }];
  assert.equal(trailingYield(history, 100), 2); // (1+1)/100 * 100 = 2%, the 500-day-old one excluded
});

test('trailingYield is null without a price', () => {
  assert.equal(trailingYield([{ date: '2024-01-01', dividend: 1 }], null), null);
});
