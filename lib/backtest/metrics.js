function dailyReturns(equityCurve) {
  const returns = [];
  for (let i = 1; i < equityCurve.length; i++) {
    const prev = equityCurve[i - 1].equity;
    const curr = equityCurve[i].equity;
    if (prev > 0) returns.push((curr - prev) / prev);
  }
  return returns;
}

function mean(arr) {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function stdDev(arr) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  const variance = arr.reduce((sum, x) => sum + (x - m) ** 2, 0) / (arr.length - 1);
  return Math.sqrt(variance);
}

function sharpeRatio(equityCurve, periodsPerYear = 252) {
  const returns = dailyReturns(equityCurve);
  const sd = stdDev(returns);
  if (sd === 0) return 0;
  return (mean(returns) / sd) * Math.sqrt(periodsPerYear);
}

function sortinoRatio(equityCurve, periodsPerYear = 252) {
  const returns = dailyReturns(equityCurve);
  const downside = returns.filter(r => r < 0);
  const downsideSd = stdDev(downside.length > 1 ? downside : [...downside, 0]);
  if (downsideSd === 0) return 0;
  return (mean(returns) / downsideSd) * Math.sqrt(periodsPerYear);
}

// Returns the deepest peak-to-trough decline and how many days it took to
// recover back to the prior peak (or null if it never recovered in the window).
function maxDrawdown(equityCurve) {
  let peak = -Infinity;
  let peakDate = null;
  let worst = 0;
  let worstStart = null;
  let worstTroughDate = null;
  let worstRecoveryDate = null;
  let currentDrawdownStart = null;

  for (const point of equityCurve) {
    if (point.equity >= peak) {
      // recovered (or new high) — close out any drawdown episode we were tracking
      if (currentDrawdownStart && worstStart === currentDrawdownStart && !worstRecoveryDate) {
        worstRecoveryDate = point.date;
      }
      peak = point.equity;
      peakDate = point.date;
      currentDrawdownStart = null;
      continue;
    }
    if (!currentDrawdownStart) currentDrawdownStart = peakDate;
    const dd = (point.equity - peak) / peak;
    if (dd < worst) {
      worst = dd;
      worstStart = currentDrawdownStart;
      worstTroughDate = point.date;
      worstRecoveryDate = null; // reset — hasn't recovered from this new worst yet
    }
  }

  const durationDays = worstStart && worstTroughDate
    ? Math.round((new Date(worstTroughDate) - new Date(worstStart)) / 86400000)
    : 0;

  return {
    maxDrawdownPct: worst,
    peakDate: worstStart,
    troughDate: worstTroughDate,
    recoveryDate: worstRecoveryDate, // null = never recovered within the simulated period
    durationDays,
  };
}

function profitFactor(trades) {
  let gains = 0;
  let losses = 0;
  for (const t of trades) {
    if (t.netPnl >= 0) gains += t.netPnl;
    else losses += t.netPnl;
  }
  if (losses === 0) return gains > 0 ? Infinity : 0;
  return gains / Math.abs(losses);
}

function winRate(trades) {
  if (!trades.length) return 0;
  return trades.filter(t => t.netPnl > 0).length / trades.length;
}

function cagr(equityCurve) {
  if (equityCurve.length < 2) return 0;
  const start = equityCurve[0];
  const end = equityCurve[equityCurve.length - 1];
  const days = (new Date(end.date) - new Date(start.date)) / 86400000;
  if (days <= 0 || start.equity <= 0) return 0;
  return (end.equity / start.equity) ** (365 / days) - 1;
}

function totalReturn(equityCurve) {
  if (equityCurve.length < 2) return 0;
  const start = equityCurve[0].equity;
  const end = equityCurve[equityCurve.length - 1].equity;
  if (start <= 0) return 0;
  return (end - start) / start;
}

// Computes the full metrics bundle (R4) for one equity curve + trade list.
function computeMetrics(equityCurve, trades) {
  return {
    totalReturnPct: totalReturn(equityCurve),
    cagr: cagr(equityCurve),
    sharpeRatio: sharpeRatio(equityCurve),
    sortinoRatio: sortinoRatio(equityCurve),
    ...maxDrawdown(equityCurve),
    profitFactor: profitFactor(trades),
    winRate: winRate(trades),
    totalTrades: trades.length,
  };
}

module.exports = {
  dailyReturns, mean, stdDev, sharpeRatio, sortinoRatio, maxDrawdown,
  profitFactor, winRate, cagr, totalReturn, computeMetrics,
};
