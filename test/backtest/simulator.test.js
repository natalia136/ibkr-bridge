const test = require('node:test');
const assert = require('node:assert/strict');
const { runSimulation } = require('../../lib/backtest/simulator');

function makeRisingBars(startDate, days, startPrice, dailyGainPct) {
  const bars = [];
  let price = startPrice;
  const date = new Date(startDate);
  for (let i = 0; i < days; i++) {
    const iso = date.toISOString().slice(0, 10);
    const open = price;
    price = price * (1 + dailyGainPct);
    bars.push({ date: iso, o: open, h: Math.max(open, price) * 1.001, l: Math.min(open, price) * 0.999, c: price, v: 100000 });
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return bars;
}

const baseConfig = {
  MAX_POSITION_PCT: 0.5,
  MAX_OPEN_POSITIONS: 5,
  MAX_TRADES_PER_DAY: 50,
  DAILY_LOSS_LIMIT_PCT: 0.5,
  STOP_LOSS_PCT: 0.02,
  TAKE_PROFIT_PCT: 0.04,
  MOMENTUM_THRESHOLD: 0.005,
  SENTIMENT_THRESHOLD: 0, // degraded-sentiment override, see design.md
  LOOKBACK_DAYS: 3,
  BACKTEST_COMMISSION_PER_TRADE: 1,
  BACKTEST_SLIPPAGE_BPS: 5,
};

test('a steadily rising price triggers a BUY and eventually a take-profit exit', () => {
  const bars = makeRisingBars('2024-01-02', 20, 100, 0.02); // +2%/day compounding
  const result = runSimulation({
    symbols: [{ symbol: 'TEST', bars }],
    sentiment: {},
    startDate: bars[0].date,
    endDate: bars[bars.length - 1].date,
    initialEquity: 100000,
    config: baseConfig,
  });

  assert.ok(result.trades.length >= 1, 'expected at least one trade');
  const firstTrade = result.trades[0];
  assert.equal(firstTrade.side, 'BUY');
  assert.equal(firstTrade.exitReason, 'take_profit');
  assert.ok(firstTrade.netPnl > 0, 'take-profit exit should be a net winner after costs');
  assert.equal(result.dataQuality.sentimentDegradedPct, 1);
});

test('a steadily falling price never opens a long (long-only, no short signal)', () => {
  const bars = makeRisingBars('2024-01-02', 20, 100, -0.02);
  const result = runSimulation({
    symbols: [{ symbol: 'TEST', bars }],
    sentiment: {},
    startDate: bars[0].date,
    endDate: bars[bars.length - 1].date,
    initialEquity: 100000,
    config: baseConfig,
  });

  // A steady decline never satisfies the BUY momentum gate, and shorting is
  // out of scope (long-only), so no trade should ever open.
  assert.equal(result.trades.length, 0);
});

test('a sharp reversal after entry triggers a stop-loss exit', () => {
  const bars = [
    { date: '2024-01-02', o: 100, h: 100.5, l: 99.5, c: 100, v: 100000 },
    { date: '2024-01-03', o: 100, h: 102, l: 99.8, c: 101.5, v: 100000 },
    { date: '2024-01-04', o: 101.5, h: 104, l: 101.3, c: 103.5, v: 100000 }, // entry fills at ~103.5 close
    { date: '2024-01-05', o: 103.5, h: 103.6, l: 99.0, c: 100.0, v: 100000 }, // gaps down through the 2% stop
  ];
  const result = runSimulation({
    symbols: [{ symbol: 'TEST', bars }],
    sentiment: {},
    startDate: bars[0].date,
    endDate: bars[bars.length - 1].date,
    initialEquity: 100000,
    config: baseConfig,
  });

  assert.equal(result.trades.length, 1);
  assert.equal(result.trades[0].exitReason, 'stop_loss');
  assert.ok(result.trades[0].netPnl < 0, 'a stop-loss exit should be a net loss');
});

test('respects MAX_OPEN_POSITIONS across multiple symbols', () => {
  const rising = makeRisingBars('2024-01-02', 15, 100, 0.02);
  const symbols = ['A', 'B', 'C'].map(symbol => ({ symbol, bars: rising.map(b => ({ ...b })) }));
  const result = runSimulation({
    symbols,
    sentiment: {},
    startDate: rising[0].date,
    endDate: rising[rising.length - 1].date,
    initialEquity: 100000,
    config: { ...baseConfig, MAX_OPEN_POSITIONS: 1, MAX_POSITION_PCT: 0.9 },
  });

  assert.ok(result.trades.length >= 2, 'expected multiple sequential trades across symbols');
  // With MAX_OPEN_POSITIONS=1 and 3 identically-moving symbols, no two trades
  // should ever overlap in time — only one slot is available at a time.
  const sorted = [...result.trades].sort((a, b) => a.entryDate.localeCompare(b.entryDate));
  for (let i = 1; i < sorted.length; i++) {
    assert.ok(sorted[i].entryDate >= sorted[i - 1].exitDate,
      `trade ${i} (${sorted[i].symbol} on ${sorted[i].entryDate}) overlaps previous exit (${sorted[i - 1].exitDate})`);
  }
});
