const fs = require('fs');
const path = require('path');

const STATE_FILE = path.join(__dirname, '..', 'data', 'state.json');

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function defaultState() {
  return {
    killSwitch: false,
    tradingDay: todayStr(),
    tradesToday: 0,
    realizedPnlToday: 0,
    startEquityToday: null,
    openPositions: {}, // symbol -> { conid, quantity, side, entryPrice, stopPrice, takeProfitPrice }
  };
}

function load() {
  try {
    const raw = fs.readFileSync(STATE_FILE, 'utf8');
    const state = JSON.parse(raw);
    return resetIfNewDay(state);
  } catch {
    return defaultState();
  }
}

function save(state) {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// Daily counters (trade count, realized P&L) reset at the start of each new trading day.
// Open positions and the kill switch persist across the reset.
function resetIfNewDay(state) {
  const today = todayStr();
  if (state.tradingDay !== today) {
    return { ...state, tradingDay: today, tradesToday: 0, realizedPnlToday: 0, startEquityToday: null };
  }
  return state;
}

module.exports = { load, save, defaultState, todayStr };
