function clamp(x, lo, hi) {
  return Math.max(lo, Math.min(hi, x));
}

// Rewards a "sensible" yield range and explicitly flags very high yields as a
// possible yield trap (often a symptom of a falling price or an unsustainable payout)
// rather than scoring them as simply "better".
function yieldComponent(yieldPct) {
  if (yieldPct === null) return { points: 0, note: 'unavailable' };
  if (yieldPct <= 0) return { points: 0, note: 'no_dividend' };
  if (yieldPct < 2) return { points: 40 * (yieldPct / 2), note: 'low' };
  if (yieldPct <= 6) return { points: 40, note: 'sweet_spot' };
  if (yieldPct <= 12) return { points: clamp(40 * (1 - (yieldPct - 6) / 6), 0, 40), note: 'elevated' };
  return { points: 0, note: 'yield_trap_risk' };
}

function streakComponent(years) {
  if (years === null) return { points: 0, note: 'unavailable' };
  return { points: clamp((years / 10) * 30, 0, 30), note: years >= 5 ? 'consistent_grower' : 'short_history' };
}

// Payout ratio unavailable is treated as neutral (half credit), not "safe" —
// this is a real unknown, so it shouldn't score as well as a confirmed-safe payout.
function payoutComponent(payoutRatioPct) {
  if (payoutRatioPct === null) return { points: 15, note: 'unavailable' };
  if (payoutRatioPct <= 60) return { points: 30, note: 'safe' };
  if (payoutRatioPct <= 80) return { points: clamp(30 * (1 - (payoutRatioPct - 60) / 20) + 10, 10, 30), note: 'moderate' };
  if (payoutRatioPct <= 100) return { points: clamp(10 * (1 - (payoutRatioPct - 80) / 20), 0, 10), note: 'stretched' };
  return { points: 0, note: 'unsustainable' };
}

function computeDividendScore({ yieldPct, consecutiveGrowthYears, payoutRatioPct, degraded }) {
  if (degraded && yieldPct === null) {
    return { score: 0, insufficientData: true, reason: 'no_dividend_data' };
  }
  const yieldC = yieldComponent(yieldPct);
  const streakC = streakComponent(consecutiveGrowthYears);
  const payoutC = payoutComponent(payoutRatioPct);

  return {
    score: Math.round(yieldC.points + streakC.points + payoutC.points),
    yieldPct, consecutiveGrowthYears, payoutRatioPct,
    components: { yield: yieldC, streak: streakC, payout: payoutC },
  };
}

module.exports = { computeDividendScore };
