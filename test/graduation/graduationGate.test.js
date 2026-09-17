const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { checkGraduation } = require('../../lib/graduation/graduationGate');
const backtestStore = require('../../lib/backtest/reportStore');
const equityHistory = require('../../lib/equityHistory');

const BACKTESTS_DIR = path.join(__dirname, '..', '..', 'data', 'backtests');
const EQUITY_FILE = path.join(__dirname, '..', '..', 'data', 'equity-history.json');

function cleanState() {
  fs.rmSync(BACKTESTS_DIR, { recursive: true, force: true });
  fs.rmSync(EQUITY_FILE, { force: true });
}

test.beforeEach(cleanState);
test.after(cleanState);

function daysAgo(n) {
  return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
}

test('not graduated with no backtest run and no paper history', () => {
  const result = checkGraduation({ MIN_PAPER_DAYS: 5 });
  assert.equal(result.graduated, false);
  assert.ok(result.reasons.includes('no_backtest_run_found'));
});

test('not graduated when the latest backtest failed its gate, even with clean paper days', () => {
  backtestStore.saveRun('run-1', { config: {}, equityCurve: {}, trades: {}, report: { passesGate: false } });
  for (let i = 0; i < 5; i++) {
    equityHistory.recordDailySnapshot({ date: daysAgo(i), reachedDailyLossLimit: false, killSwitchActive: false });
  }
  const result = checkGraduation({ MIN_PAPER_DAYS: 5 });
  assert.equal(result.graduated, false);
  assert.ok(result.reasons.includes('latest_backtest_did_not_pass_gate'));
});

test('not graduated with too few clean paper days', () => {
  backtestStore.saveRun('run-1', { config: {}, equityCurve: {}, trades: {}, report: { passesGate: true } });
  equityHistory.recordDailySnapshot({ date: daysAgo(0), reachedDailyLossLimit: false, killSwitchActive: false });
  const result = checkGraduation({ MIN_PAPER_DAYS: 5 });
  assert.equal(result.graduated, false);
  assert.ok(result.reasons.some(r => r.startsWith('insufficient_paper_track_record')));
});

test('a day that breached the daily loss limit does not count as clean', () => {
  backtestStore.saveRun('run-1', { config: {}, equityCurve: {}, trades: {}, report: { passesGate: true } });
  for (let i = 0; i < 4; i++) {
    equityHistory.recordDailySnapshot({ date: daysAgo(i), reachedDailyLossLimit: false, killSwitchActive: false });
  }
  equityHistory.recordDailySnapshot({ date: daysAgo(4), reachedDailyLossLimit: true, killSwitchActive: false });
  const result = checkGraduation({ MIN_PAPER_DAYS: 5 });
  assert.equal(result.graduated, false);
  assert.equal(result.paperDaysClean, 4);
});

test('graduated when the backtest passed and enough clean recent paper days exist', () => {
  backtestStore.saveRun('run-1', { config: {}, equityCurve: {}, trades: {}, report: { passesGate: true } });
  for (let i = 0; i < 14; i++) {
    equityHistory.recordDailySnapshot({ date: daysAgo(i), reachedDailyLossLimit: false, killSwitchActive: false });
  }
  const result = checkGraduation({ MIN_PAPER_DAYS: 14 });
  assert.equal(result.graduated, true);
  assert.deepEqual(result.reasons, []);
});

test('stale paper history (all clean days from long ago) is rejected', () => {
  backtestStore.saveRun('run-1', { config: {}, equityCurve: {}, trades: {}, report: { passesGate: true } });
  for (let i = 100; i < 114; i++) {
    equityHistory.recordDailySnapshot({ date: daysAgo(i), reachedDailyLossLimit: false, killSwitchActive: false });
  }
  const result = checkGraduation({ MIN_PAPER_DAYS: 14, MAX_STALENESS_MULTIPLIER: 3 });
  assert.equal(result.graduated, false);
  assert.ok(result.reasons.includes('paper_track_record_too_stale_rerun_recently'));
});
