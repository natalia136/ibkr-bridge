const test = require('node:test');
const assert = require('node:assert/strict');
const { computeTechnicalScore } = require('../../lib/screener/technicalScore');

function makeBars(days, fn) {
  const bars = [];
  for (let i = 0; i < days; i++) {
    const c = fn(i);
    bars.push({ date: `d${i}`, o: c, h: c * 1.001, l: c * 0.999, c, v: 1000 });
  }
  return bars;
}

test('a steady long uptrend scores well above a flat/declining series', () => {
  const uptrend = makeBars(260, i => 50 + i * 0.3); // steadily rising for a year+
  const downtrend = makeBars(260, i => 300 - i * 0.3);

  const up = computeTechnicalScore(uptrend);
  const down = computeTechnicalScore(downtrend);

  assert.ok(up.score > down.score, `expected uptrend score (${up.score}) > downtrend score (${down.score})`);
  assert.equal(down.components.trend.note, 'downtrend');
});

test('insufficient history returns a zero score flagged as such', () => {
  const result = computeTechnicalScore(makeBars(5, i => 100 + i));
  assert.equal(result.score, 0);
  assert.equal(result.insufficientData, true);
});
