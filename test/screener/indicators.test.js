const test = require('node:test');
const assert = require('node:assert/strict');
const { sma, rsi, pctFrom52wLow } = require('../../lib/screener/indicators');

function bars(closesArr) {
  return closesArr.map((c, i) => ({ date: `2024-01-${String(i + 1).padStart(2, '0')}`, o: c, h: c, l: c, c, v: 1000 }));
}

test('sma averages the last N closes', () => {
  assert.equal(sma(bars([1, 2, 3, 4, 5]), 5), 3);
  assert.equal(sma(bars([10, 20, 30]), 2), 25);
});

test('sma returns null with insufficient history', () => {
  assert.equal(sma(bars([1, 2]), 5), null);
});

test('rsi is 100 for an unbroken uptrend with no losses', () => {
  const closesArr = Array.from({ length: 15 }, (_, i) => 100 + i);
  assert.equal(rsi(bars(closesArr), 14), 100);
});

test('rsi is 0 for an unbroken downtrend with no gains', () => {
  const closesArr = Array.from({ length: 15 }, (_, i) => 100 - i);
  assert.equal(rsi(bars(closesArr), 14), 0);
});

test('pctFrom52wLow is 0 when the last close is the lowest', () => {
  assert.equal(pctFrom52wLow(bars([10, 9, 8])), 0);
});

test('pctFrom52wLow reflects a recovery off the low', () => {
  assert.equal(pctFrom52wLow(bars([10, 5, 10])), 1); // doubled off the low of 5
});
