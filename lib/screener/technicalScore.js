const { sma, rsi, pctFrom52wLow } = require('./indicators');

function clamp(x, lo, hi) {
  return Math.max(lo, Math.min(hi, x));
}

// Trend: full uptrend (price above both moving averages, short above long) scores
// highest; a mixed picture scores partial credit; a clear downtrend scores zero.
function trendComponent(price, sma50, sma200) {
  if (sma50 === null || sma200 === null) return { points: 0, note: 'insufficient_history' };
  if (price > sma50 && sma50 > sma200) return { points: 40, note: 'uptrend' };
  if (price > sma200) return { points: 20, note: 'mixed' };
  return { points: 0, note: 'downtrend' };
}

// Momentum: RSI near 55 (healthy bullish push, not yet overbought) scores highest,
// tapering to zero at the extremes (oversold <=25 or overbought >=85).
function momentumComponent(rsiValue) {
  if (rsiValue === null) return { points: 0, note: 'insufficient_history' };
  const points = clamp(30 * (1 - Math.abs(rsiValue - 55) / 30), 0, 30);
  return { points, note: rsiValue >= 70 ? 'overbought_risk' : rsiValue <= 30 ? 'oversold' : 'healthy' };
}

// Position: rewards having moved off the 52-week low (confirms the trend isn't
// just noise) without having already run up so far that it looks chased/extended.
function positionComponent(pctFromLow) {
  if (pctFromLow === null) return { points: 0, note: 'insufficient_history' };
  if (pctFromLow < 0.10) return { points: clamp((pctFromLow / 0.10) * 30, 0, 30), note: 'near_52w_low' };
  if (pctFromLow <= 0.50) return { points: 30, note: 'healthy_recovery' };
  const points = clamp(30 - (pctFromLow - 0.50) * 30, 0, 30);
  return { points, note: 'extended_above_low' };
}

// Combines the three components into a 0-100 technical score, with the
// components exposed so the dashboard can show *why*, not just a number.
function computeTechnicalScore(bars) {
  if (!bars || bars.length < 20) {
    return { score: 0, insufficientData: true };
  }
  const price = bars[bars.length - 1].c;
  const sma50 = sma(bars, 50);
  const sma200 = sma(bars, 200);
  const rsiValue = rsi(bars, 14);
  const pctFromLow = pctFrom52wLow(bars);

  const trend = trendComponent(price, sma50, sma200);
  const momentum = momentumComponent(rsiValue);
  const position = positionComponent(pctFromLow);

  return {
    score: Math.round(trend.points + momentum.points + position.points),
    price, sma50, sma200, rsi: rsiValue, pctFrom52wLow: pctFromLow,
    components: { trend, momentum, position },
  };
}

module.exports = { computeTechnicalScore };
