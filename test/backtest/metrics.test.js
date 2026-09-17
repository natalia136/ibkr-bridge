const test = require('node:test');
const assert = require('node:assert/strict');
const metrics = require('../../lib/backtest/metrics');

function curve(pairs) {
  return pairs.map(([date, equity]) => ({ date, equity }));
}

test('maxDrawdown detects a 50% drop and its recovery', () => {
  const equityCurve = curve([
    ['2024-01-01', 100],
    ['2024-01-02', 100],
    ['2024-01-03', 50],
    ['2024-01-04', 60],
    ['2024-01-05', 100],
  ]);
  const dd = metrics.maxDrawdown(equityCurve);
  assert.equal(dd.maxDrawdownPct, -0.5);
  assert.equal(dd.troughDate, '2024-01-03');
  assert.equal(dd.recoveryDate, '2024-01-05');
});

test('maxDrawdown reports no recovery when the period ends still down', () => {
  const equityCurve = curve([
    ['2024-01-01', 100],
    ['2024-01-02', 80],
    ['2024-01-03', 70],
  ]);
  const dd = metrics.maxDrawdown(equityCurve);
  assert.equal(dd.maxDrawdownPct, -0.3);
  assert.equal(dd.recoveryDate, null);
});

test('profitFactor is gains over absolute losses', () => {
  const trades = [{ netPnl: 100 }, { netPnl: -50 }, { netPnl: 30 }];
  assert.equal(metrics.profitFactor(trades), 130 / 50);
});

test('profitFactor with no losing trades is Infinity', () => {
  const trades = [{ netPnl: 10 }, { netPnl: 5 }];
  assert.equal(metrics.profitFactor(trades), Infinity);
});

test('winRate counts strictly positive trades', () => {
  const trades = [{ netPnl: 1 }, { netPnl: 0 }, { netPnl: -1 }];
  assert.equal(metrics.winRate(trades), 1 / 3);
});

test('sharpeRatio is zero when returns have no variance', () => {
  const equityCurve = curve([
    ['2024-01-01', 100],
    ['2024-01-02', 100],
    ['2024-01-03', 100],
  ]);
  assert.equal(metrics.sharpeRatio(equityCurve), 0);
});

test('cagr on a flat 1-year doubling is ~100%', () => {
  const equityCurve = curve([
    ['2023-01-01', 100],
    ['2024-01-01', 200],
  ]);
  assert.ok(Math.abs(metrics.cagr(equityCurve) - 1.0) < 0.01);
});

test('totalReturn matches simple percentage change', () => {
  const equityCurve = curve([
    ['2024-01-01', 100],
    ['2024-06-01', 130],
  ]);
  assert.equal(metrics.totalReturn(equityCurve), 0.3);
});
