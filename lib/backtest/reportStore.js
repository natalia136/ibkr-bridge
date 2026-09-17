const fs = require('fs');
const path = require('path');

const RUNS_DIR = path.join(__dirname, '..', '..', 'data', 'backtests');

function newRunId() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

// JSON has no Infinity — profitFactor is Infinity when a strategy has zero
// losing trades, so it must round-trip explicitly instead of silently
// collapsing to null.
function infinitySafeReplacer(_key, value) {
  if (value === Infinity) return '__Infinity__';
  if (value === -Infinity) return '__-Infinity__';
  return value;
}
function infinitySafeReviver(_key, value) {
  if (value === '__Infinity__') return Infinity;
  if (value === '__-Infinity__') return -Infinity;
  return value;
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, infinitySafeReplacer, 2));
}
function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'), infinitySafeReviver);
}

function saveRun(runId, { config, equityCurve, trades, report }) {
  const dir = path.join(RUNS_DIR, runId);
  fs.mkdirSync(dir, { recursive: true });
  writeJson(path.join(dir, 'config.json'), config);
  writeJson(path.join(dir, 'equity-curve.json'), equityCurve);
  writeJson(path.join(dir, 'trades.json'), trades);
  writeJson(path.join(dir, 'report.json'), report);
  return dir;
}

function loadRun(runId) {
  const dir = path.join(RUNS_DIR, runId);
  return {
    config: readJson(path.join(dir, 'config.json')),
    equityCurve: readJson(path.join(dir, 'equity-curve.json')),
    trades: readJson(path.join(dir, 'trades.json')),
    report: readJson(path.join(dir, 'report.json')),
  };
}

function listRuns() {
  try {
    return fs.readdirSync(RUNS_DIR).sort().reverse();
  } catch {
    return [];
  }
}

module.exports = { newRunId, saveRun, loadRun, listRuns };
