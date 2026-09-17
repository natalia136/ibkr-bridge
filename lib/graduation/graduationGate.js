const backtestStore = require('../backtest/reportStore');
const equityHistory = require('../equityHistory');

// Hard, code-enforced precondition before ANY live (non-paper) order is
// allowed — see orderExecutor.assertSafeToTrade. Manually setting
// PAPER_MODE=false and LIVE_TRADING_CONFIRM is a necessary but NOT sufficient
// condition to trade real money; this gate is the second, automatic check.
//
// Requirements:
//   1. The most recent backtest run must have report.passesGate === true.
//   2. At least MIN_PAPER_DAYS of paper-trading track record must exist with
//      no day that breached the daily loss limit, and that history must be
//      recent (not stale runs from months ago).
const DEFAULTS = {
  MIN_PAPER_DAYS: 14,
  MAX_STALENESS_MULTIPLIER: 3, // the required days must appear within MIN_PAPER_DAYS * this many calendar days
};

function latestBacktestReport() {
  const runs = backtestStore.listRuns();
  if (!runs.length) return null;
  return backtestStore.loadRun(runs[0]).report;
}

function paperTrackRecord(minDays) {
  const history = equityHistory.load();
  const cleanDays = history.filter(d => !d.reachedDailyLossLimit && !d.killSwitchActive);
  const recentClean = cleanDays.slice(-minDays);
  return { totalCleanDays: cleanDays.length, recentClean, history };
}

function isStale(history, minDays, stalenessMultiplier) {
  if (history.length < minDays) return false; // not enough data yet, handled separately
  const oldestNeeded = history[history.length - minDays];
  const daysSinceOldest = (Date.now() - new Date(oldestNeeded.date).getTime()) / 86400000;
  return daysSinceOldest > minDays * stalenessMultiplier;
}

function checkGraduation(overrides = {}) {
  const cfg = { ...DEFAULTS, ...overrides };
  const reasons = [];

  const backtestReport = latestBacktestReport();
  const backtestPassed = backtestReport?.passesGate === true;
  if (!backtestReport) reasons.push('no_backtest_run_found');
  else if (!backtestPassed) reasons.push('latest_backtest_did_not_pass_gate');

  const { totalCleanDays, recentClean, history } = paperTrackRecord(cfg.MIN_PAPER_DAYS);
  const enoughPaperDays = recentClean.length >= cfg.MIN_PAPER_DAYS;
  if (!enoughPaperDays) reasons.push(`insufficient_paper_track_record (${recentClean.length}/${cfg.MIN_PAPER_DAYS} clean days)`);

  const stale = isStale(history, cfg.MIN_PAPER_DAYS, cfg.MAX_STALENESS_MULTIPLIER);
  if (stale) reasons.push('paper_track_record_too_stale_rerun_recently');

  return {
    graduated: reasons.length === 0,
    reasons,
    backtestPassed,
    backtestRunId: backtestReport ? backtestStore.listRuns()[0] : null,
    paperDaysClean: totalCleanDays,
    paperDaysRequired: cfg.MIN_PAPER_DAYS,
  };
}

module.exports = { checkGraduation, DEFAULTS };
