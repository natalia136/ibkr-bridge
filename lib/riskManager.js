// All limits are read from config (env vars) so they can be tuned without code changes.
// This module never talks to IBKR directly — it only decides whether a trade is allowed.

function isHalted(state, config) {
  if (state.killSwitch) return { halted: true, reason: 'kill_switch' };
  if (state.tradesToday >= config.MAX_TRADES_PER_DAY) {
    return { halted: true, reason: 'max_trades_per_day_reached' };
  }
  if (state.startEquityToday) {
    const lossPct = -state.realizedPnlToday / state.startEquityToday;
    if (lossPct >= config.DAILY_LOSS_LIMIT_PCT) {
      return { halted: true, reason: 'daily_loss_limit_reached' };
    }
  }
  return { halted: false };
}

function canOpenPosition(state, config) {
  const openCount = Object.keys(state.openPositions).length;
  return openCount < config.MAX_OPEN_POSITIONS;
}

// Position size in shares, capped to MAX_POSITION_PCT of equity, rounded down to whole shares.
function computeQuantity(equity, price, config) {
  if (!price || price <= 0) return 0;
  const budget = equity * config.MAX_POSITION_PCT;
  return Math.max(0, Math.floor(budget / price));
}

function computeStopAndTarget(entryPrice, side, config) {
  const dir = side === 'BUY' ? 1 : -1;
  return {
    stopPrice: +(entryPrice - dir * entryPrice * config.STOP_LOSS_PCT).toFixed(2),
    takeProfitPrice: +(entryPrice + dir * entryPrice * config.TAKE_PROFIT_PCT).toFixed(2),
  };
}

module.exports = { isHalted, canOpenPosition, computeQuantity, computeStopAndTarget };
