function closes(bars) {
  return bars.map(b => b.c);
}

function sma(bars, period) {
  const c = closes(bars);
  if (c.length < period) return null;
  const slice = c.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

// Standard Wilder RSI over the trailing `period` bars.
function rsi(bars, period = 14) {
  const c = closes(bars);
  if (c.length < period + 1) return null;
  const recent = c.slice(-(period + 1));
  let gains = 0;
  let losses = 0;
  for (let i = 1; i < recent.length; i++) {
    const diff = recent[i] - recent[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return avgGain === 0 ? 50 : 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function pctFrom52wLow(bars) {
  const c = closes(bars.slice(-252));
  if (!c.length) return null;
  const low = Math.min(...c);
  const last = c[c.length - 1];
  if (low <= 0) return null;
  return (last - low) / low;
}

function pctFrom52wHigh(bars) {
  const c = closes(bars.slice(-252));
  if (!c.length) return null;
  const high = Math.max(...c);
  const last = c[c.length - 1];
  if (high <= 0) return null;
  return (last - high) / high; // negative or zero
}

module.exports = { sma, rsi, pctFrom52wLow, pctFrom52wHigh };
