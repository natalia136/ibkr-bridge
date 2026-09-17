// Historical news sentiment is expensive/unavailable for free at any real depth
// (see specs/backtest-engine/requirements.md R2.2). This degraded implementation
// always returns neutral sentiment and marks it as such, so the backtest reports
// honestly measure only the momentum half of the strategy until a real historical
// sentiment provider is wired in here.
async function getScore(symbol, date) {
  return { date, score: 0, degraded: true };
}

// Batch helper mirroring getScore's shape over a date range, for simulator convenience.
async function getScoresForRange(symbol, dates) {
  return dates.map(date => ({ date, score: 0, degraded: true }));
}

module.exports = { getScore, getScoresForRange };
