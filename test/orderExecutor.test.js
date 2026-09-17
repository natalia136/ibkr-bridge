const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { assertSafeToTrade } = require('../lib/orderExecutor');
const backtestStore = require('../lib/backtest/reportStore');
const equityHistory = require('../lib/equityHistory');

const BACKTESTS_DIR = path.join(__dirname, '..', 'data', 'backtests');
const EQUITY_FILE = path.join(__dirname, '..', 'data', 'equity-history.json');

function cleanState() {
  fs.rmSync(BACKTESTS_DIR, { recursive: true, force: true });
  fs.rmSync(EQUITY_FILE, { force: true });
}
test.beforeEach(cleanState);
test.after(cleanState);

function daysAgo(n) {
  return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
}

const baseConfig = { PAPER_MODE: true, LIVE_TRADING_CONFIRM: '', GRADUATION_MIN_PAPER_DAYS: 5 };

test('paper mode requires a paper (DU-prefixed) account', () => {
  assert.throws(() => assertSafeToTrade('U1234567', baseConfig), /does not look like an IBKR paper account/);
  assert.doesNotThrow(() => assertSafeToTrade('DU1234567', baseConfig));
});

test('live mode without LIVE_TRADING_CONFIRM is refused', () => {
  const config = { ...baseConfig, PAPER_MODE: false };
  assert.throws(() => assertSafeToTrade('U1234567', config), /LIVE_TRADING_CONFIRM/);
});

test('live mode with confirm but no graduation is refused', () => {
  const config = { ...baseConfig, PAPER_MODE: false, LIVE_TRADING_CONFIRM: 'I_UNDERSTAND_THE_RISK' };
  assert.throws(() => assertSafeToTrade('U1234567', config), /graduation gate not satisfied/);
});

test('live mode passes once graduated', () => {
  backtestStore.saveRun('run-1', { config: {}, equityCurve: {}, trades: {}, report: { passesGate: true } });
  for (let i = 0; i < 5; i++) {
    equityHistory.recordDailySnapshot({ date: daysAgo(i), reachedDailyLossLimit: false, killSwitchActive: false });
  }
  const config = { ...baseConfig, PAPER_MODE: false, LIVE_TRADING_CONFIRM: 'I_UNDERSTAND_THE_RISK' };
  assert.doesNotThrow(() => assertSafeToTrade('U1234567', config));
});
