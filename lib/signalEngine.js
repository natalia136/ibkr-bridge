// Computes momentum as the % change between the first and last close in a bar series.
function computeMomentum(bars) {
  const points = bars?.data || bars?.points || (Array.isArray(bars) ? bars : null);
  if (!points || points.length < 2) return 0;
  const first = points[0].c ?? points[0].close;
  const last = points[points.length - 1].c ?? points[points.length - 1].close;
  if (!first) return 0;
  return (last - first) / first;
}

// Combines price momentum with news sentiment into a single trade signal.
// Deliberately conservative: a signal only fires when BOTH momentum and sentiment
// agree on direction and clear the configured thresholds. This is the main defense
// against noisy/false news signals when running fully automated.
function computeSignal({ momentum, sentimentScore }, config) {
  const momentumThreshold = config.MOMENTUM_THRESHOLD;
  const sentimentThreshold = config.SENTIMENT_THRESHOLD;

  const momentumBullish = momentum >= momentumThreshold;
  const momentumBearish = momentum <= -momentumThreshold;
  const sentimentBullish = sentimentScore >= sentimentThreshold;
  const sentimentBearish = sentimentScore <= -sentimentThreshold;

  let action = 'HOLD';
  if (momentumBullish && sentimentBullish) action = 'BUY';
  else if (momentumBearish && sentimentBearish) action = 'SELL';

  const confidence = Math.min(1, (Math.abs(momentum) / (momentumThreshold || 1) + Math.abs(sentimentScore) / (sentimentThreshold || 1)) / 2);

  return { action, confidence, momentum, sentimentScore };
}

module.exports = { computeMomentum, computeSignal };
