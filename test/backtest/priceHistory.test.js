const test = require('node:test');
const assert = require('node:assert/strict');
const { parseStooqCsv, findGaps } = require('../../lib/backtest/priceHistory');

test('parseStooqCsv parses a well-formed CSV', () => {
  const csv = 'Date,Open,High,Low,Close,Volume\n2024-01-02,100,105,99,104,1000\n2024-01-03,104,106,103,105,1200\n';
  const bars = parseStooqCsv(csv);
  assert.equal(bars.length, 2);
  assert.deepEqual(bars[0], { date: '2024-01-02', o: 100, h: 105, l: 99, c: 104, v: 1000 });
});

test('parseStooqCsv returns empty array for an unknown-symbol response', () => {
  const bars = parseStooqCsv('No data found for symbol');
  assert.equal(bars.length, 0);
});

test('findGaps flags a missing weekday and ignores weekends', () => {
  // 2024-01-02 Tue, 2024-01-03 Wed present; 2024-01-04 Thu missing; 01-05/06 are Fri/weekend
  const bars = [{ date: '2024-01-02' }, { date: '2024-01-03' }, { date: '2024-01-05' }];
  const gaps = findGaps(bars, '2024-01-02', '2024-01-07');
  assert.deepEqual(gaps, ['2024-01-04']);
});
