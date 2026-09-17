const { computeMomentum, computeSignal } = require('../signalEngine');
const risk = require('../riskManager');

function applySlippage(price, side, bps) {
  const factor = bps / 10000;
  // A BUY fills slightly worse (higher) than quoted, a SELL slightly worse (lower).
  return side === 'BUY' ? price * (1 + factor) : price * (1 - factor);
}

function indexByDate(bars) {
  const map = new Map();
  bars.forEach((bar, i) => map.set(bar.date, i));
  return map;
}

function collectTradingDates(symbols, startDate, endDate) {
  const dates = new Set();
  for (const { bars } of symbols) {
    for (const bar of bars) {
      if (bar.date >= startDate && bar.date <= endDate) dates.add(bar.date);
    }
  }
  return [...dates].sort();
}

function freshDailyState() {
  return { tradingDay: null, tradesToday: 0, realizedPnlToday: 0, startEquityToday: null };
}

function resetIfNewDay(daily, date) {
  if (daily.tradingDay !== date) {
    return { tradingDay: date, tradesToday: 0, realizedPnlToday: 0, startEquityToday: null };
  }
  return daily;
}

// Runs the same decision logic as tradingCycle.js (signalEngine + riskManager),
// day by day, over historical bars. See specs/backtest-engine/design.md.
//
// Simplifying assumptions (documented, not hidden):
// - New entries/exits from a signal fill at that day's close (not next-day open).
// - When both stop-loss and take-profit fall within a day's high/low range, the
//   stop-loss is assumed to trigger first (conservative — worst case for the trader).
// - Long-only: SELL signals only ever close an existing long, never open a short.
function runSimulation({ symbols, sentiment = {}, startDate, endDate, initialEquity, config }) {
  const lookbackDays = config.LOOKBACK_DAYS || 5;
  const barIndex = new Map(symbols.map(s => [s.symbol, { bars: s.bars, dateIndex: indexByDate(s.bars) }]));
  const tradingDates = collectTradingDates(symbols, startDate, endDate);

  let cash = initialEquity;
  const openPositions = {}; // symbol -> { conidPlaceholder, quantity, side, entryPrice, entryDate, stopPrice, takeProfitPrice }
  const trades = [];
  const equityCurve = [];
  let daily = freshDailyState();
  let sentimentDegradedCount = 0;
  let sentimentTotalCount = 0;

  function markToMarketEquity(date) {
    let value = cash;
    for (const [symbol, pos] of Object.entries(openPositions)) {
      const { bars, dateIndex } = barIndex.get(symbol);
      const idx = dateIndex.get(date);
      const price = idx !== undefined ? bars[idx].c : pos.entryPrice;
      value += pos.quantity * price;
    }
    return value;
  }

  function closePosition(symbol, exitDate, exitPrice, reason) {
    const pos = openPositions[symbol];
    const filledExitPrice = applySlippage(exitPrice, pos.side === 'BUY' ? 'SELL' : 'BUY', config.BACKTEST_SLIPPAGE_BPS);
    const commission = config.BACKTEST_COMMISSION_PER_TRADE;
    const grossPnl = (filledExitPrice - pos.entryPrice) * pos.quantity;
    const slippageCost = Math.abs(exitPrice - filledExitPrice) * pos.quantity;
    const netPnl = grossPnl - commission - slippageCost;

    cash += pos.quantity * filledExitPrice - commission;
    daily.realizedPnlToday += netPnl;
    daily.tradesToday += 1;
    trades.push({
      symbol, side: pos.side, entryDate: pos.entryDate, entryPrice: pos.entryPrice,
      exitDate, exitPrice: filledExitPrice, exitReason: reason, quantity: pos.quantity,
      grossPnl, commission, slippageCost, netPnl,
    });
    delete openPositions[symbol];
  }

  for (const date of tradingDates) {
    daily = resetIfNewDay(daily, date);
    const equityBeforeToday = markToMarketEquity(date);
    if (daily.startEquityToday === null) daily.startEquityToday = equityBeforeToday;

    const state = {
      killSwitch: false,
      tradesToday: daily.tradesToday,
      realizedPnlToday: daily.realizedPnlToday,
      startEquityToday: daily.startEquityToday,
      openPositions,
    };
    const halt = risk.isHalted(state, config);

    for (const { symbol } of symbols) {
      const { bars, dateIndex } = barIndex.get(symbol);
      const idx = dateIndex.get(date);
      if (idx === undefined) continue;
      const bar = bars[idx];

      // 1. Check stop-loss / take-profit on any existing position first.
      const pos = openPositions[symbol];
      if (pos) {
        const hitStop = pos.side === 'BUY' ? bar.l <= pos.stopPrice : bar.h >= pos.stopPrice;
        const hitTarget = pos.side === 'BUY' ? bar.h >= pos.takeProfitPrice : bar.l <= pos.takeProfitPrice;
        if (hitStop) { closePosition(symbol, date, pos.stopPrice, 'stop_loss'); continue; }
        if (hitTarget) { closePosition(symbol, date, pos.takeProfitPrice, 'take_profit'); continue; }
      }

      if (halt.halted) continue; // still process resting stops above even when halted, just no new signals

      // 2. Compute this symbol's signal for today.
      const lookbackSlice = bars.slice(Math.max(0, idx - lookbackDays + 1), idx + 1);
      const momentum = computeMomentum(lookbackSlice);
      const sentimentSeries = sentiment[symbol];
      const sentimentPoint = sentimentSeries ? sentimentSeries.get(date) : null;
      const sentimentScore = sentimentPoint ? sentimentPoint.score : 0;
      sentimentTotalCount += 1;
      if (!sentimentPoint || sentimentPoint.degraded) sentimentDegradedCount += 1;

      const signal = computeSignal({ momentum, sentimentScore }, config);
      const stillOpen = openPositions[symbol];

      if (signal.action === 'BUY' && !stillOpen) {
        if (!risk.canOpenPosition(state, config)) continue;
        const equity = markToMarketEquity(date);
        const quantity = risk.computeQuantity(equity, bar.c, config);
        if (quantity < 1) continue;

        const fillPrice = applySlippage(bar.c, 'BUY', config.BACKTEST_SLIPPAGE_BPS);
        const commission = config.BACKTEST_COMMISSION_PER_TRADE;
        cash -= quantity * fillPrice + commission;
        const { stopPrice, takeProfitPrice } = risk.computeStopAndTarget(fillPrice, 'BUY', config);

        openPositions[symbol] = { quantity, side: 'BUY', entryPrice: fillPrice, entryDate: date, stopPrice, takeProfitPrice };
        daily.tradesToday += 1;
      } else if (signal.action === 'SELL' && stillOpen) {
        closePosition(symbol, date, bar.c, 'signal_reversal');
      }
    }

    equityCurve.push({ date, equity: markToMarketEquity(date) });
  }

  return {
    equityCurve,
    trades,
    dataQuality: {
      sentimentDegradedPct: sentimentTotalCount ? sentimentDegradedCount / sentimentTotalCount : 1,
    },
  };
}

module.exports = { runSimulation };
