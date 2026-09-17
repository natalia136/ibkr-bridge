function envFloat(name, fallback) {
  const v = process.env[name];
  return v === undefined ? fallback : parseFloat(v);
}
function envInt(name, fallback) {
  const v = process.env[name];
  return v === undefined ? fallback : parseInt(v, 10);
}
function envBool(name, fallback) {
  const v = process.env[name];
  return v === undefined ? fallback : v.toLowerCase() === 'true';
}

const config = {
  // Safety mode. When true (default), orders are refused unless the IBKR account id
  // looks like an IBKR paper account (starts with "DU"). To trade a real account,
  // set PAPER_MODE=false AND LIVE_TRADING_CONFIRM=I_UNDERSTAND_THE_RISK.
  PAPER_MODE: envBool('PAPER_MODE', true),
  LIVE_TRADING_CONFIRM: process.env.LIVE_TRADING_CONFIRM || '',

  // Whether the automated cycle is allowed to run on its own timer at all.
  AUTOTRADE_ENABLED: envBool('AUTOTRADE_ENABLED', false),
  AUTOTRADE_INTERVAL_MS: envInt('AUTOTRADE_INTERVAL_MS', 5 * 60 * 1000),

  // Long-only by default: shorting real accounts adds margin/assignment risk this
  // MVP does not model. Set SHORT_ENABLED=true only once you understand the implications.
  SHORT_ENABLED: envBool('SHORT_ENABLED', false),

  // Risk limits
  MAX_POSITION_PCT: envFloat('MAX_POSITION_PCT', 0.05),       // 5% of equity per position
  MAX_OPEN_POSITIONS: envInt('MAX_OPEN_POSITIONS', 5),
  MAX_TRADES_PER_DAY: envInt('MAX_TRADES_PER_DAY', 10),
  DAILY_LOSS_LIMIT_PCT: envFloat('DAILY_LOSS_LIMIT_PCT', 0.03), // halt trading for the day past 3% loss
  STOP_LOSS_PCT: envFloat('STOP_LOSS_PCT', 0.02),
  TAKE_PROFIT_PCT: envFloat('TAKE_PROFIT_PCT', 0.04),

  // Signal thresholds
  MOMENTUM_THRESHOLD: envFloat('MOMENTUM_THRESHOLD', 0.005), // 0.5% move over the lookback window
  SENTIMENT_THRESHOLD: envFloat('SENTIMENT_THRESHOLD', 0.2),
  BAR_PERIOD: process.env.BAR_PERIOD || '1d',
  BAR_SIZE: process.env.BAR_SIZE || '5min',

  ACCOUNT_ID: process.env.ACCOUNT_ID || '',
};

module.exports = config;
