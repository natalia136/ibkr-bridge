const ibkr = require('./ibkrClient');
const news = require('./newsProvider');
const { computeMomentum, computeSignal } = require('./signalEngine');
const risk = require('./riskManager');
const orders = require('./orderExecutor');
const stateStore = require('./stateStore');
const watchlistStore = require('./watchlist');
const equityHistory = require('./equityHistory');
const config = require('./config');
const { getAnalystVerdict } = require('./agent/analystAgent');
const { createAnthropicClient } = require('./agent/anthropicClient');

// IBKR's summary field names vary a bit by endpoint/gateway version — try the common ones.
function extractEquity(summary) {
  const candidates = [
    summary?.netliquidation?.amount,
    summary?.netliquidation,
    summary?.totalcashvalue?.amount,
    summary?.equitywithloanvalue?.amount,
  ];
  const value = candidates.find(v => typeof v === 'number' && v > 0);
  return value || 0;
}

async function resolveAccountId() {
  if (config.ACCOUNT_ID) return config.ACCOUNT_ID;
  const accounts = await ibkr.getAccounts();
  const id = accounts?.accounts?.[0] || accounts?.[0];
  if (!id) throw new Error('No IBKR account id available (set ACCOUNT_ID or check /iserver/accounts)');
  return id;
}

// Runs one pass over the watchlist: pulls momentum + news sentiment per symbol,
// computes a signal, and — if risk limits allow it — opens or closes positions.
// Returns a summary of what happened so callers (the API, logs, a future notifier) can see it.
async function runCycle() {
  let state = stateStore.load();
  const today = stateStore.todayStr();
  const halt = risk.isHalted(state, config);
  if (halt.halted) {
    equityHistory.recordDailySnapshot({
      date: today,
      reachedDailyLossLimit: halt.reason === 'daily_loss_limit_reached',
      killSwitchActive: state.killSwitch,
    });
    return { halted: true, reason: halt.reason, state };
  }

  const anthropicClient = config.AGENT_GATE_ENABLED ? createAnthropicClient() : undefined;
  const accountId = await resolveAccountId();
  const summary = await ibkr.getAccountSummary(accountId);
  const equity = extractEquity(summary);
  if (!state.startEquityToday) state.startEquityToday = equity;

  const watchlist = watchlistStore.load().symbols;
  const actions = [];

  for (const { symbol, conid } of watchlist) {
    try {
      const [bars, sentiment] = await Promise.all([
        ibkr.getBars(conid, config.BAR_PERIOD, config.BAR_SIZE),
        news.getNewsSentiment(symbol),
      ]);
      const momentum = computeMomentum(bars);
      const signal = computeSignal({ momentum, sentimentScore: sentiment.score }, config);
      const openPosition = state.openPositions[symbol];

      if (signal.action === 'BUY' && !openPosition) {
        if (!risk.canOpenPosition(state, config)) {
          actions.push({ symbol, action: 'skipped', reason: 'max_open_positions' });
          continue;
        }

        // Hybrid gate: the momentum+sentiment signal above is necessary but not
        // sufficient — the analyst agent must also independently recommend BUY.
        // It can only narrow trades (fails safe to HOLD), never approve one the
        // deterministic signal didn't already clear, and never touches sizing/stops.
        if (config.AGENT_GATE_ENABLED) {
          const verdict = await getAnalystVerdict(
            { symbol, newsHeadlines: sentiment.headlines, portfolioContext: `${Object.keys(state.openPositions).length}/${config.MAX_OPEN_POSITIONS} posiciones abiertas.` },
            { client: anthropicClient, model: config.AGENT_MODEL }
          );
          if (verdict.recommendation !== 'BUY') {
            actions.push({ symbol, action: 'skipped', reason: 'agent_did_not_confirm', verdict });
            continue;
          }
        }

        const lastPrice = bars?.data?.slice(-1)?.[0]?.c ?? bars?.data?.slice(-1)?.[0]?.close;
        const quantity = risk.computeQuantity(equity, lastPrice, config);
        if (quantity < 1) {
          actions.push({ symbol, action: 'skipped', reason: 'position_size_too_small' });
          continue;
        }
        const { stopPrice, takeProfitPrice } = risk.computeStopAndTarget(lastPrice, 'BUY', config);
        await orders.placeBracketOrder({ accountId, conid, side: 'BUY', quantity, stopPrice, takeProfitPrice, config });

        state.openPositions[symbol] = { conid, quantity, side: 'BUY', entryPrice: lastPrice, stopPrice, takeProfitPrice };
        state.tradesToday += 1;
        actions.push({ symbol, action: 'BUY', quantity, entryPrice: lastPrice, stopPrice, takeProfitPrice, signal });
      } else if (signal.action === 'SELL' && openPosition) {
        await orders.closePosition({ accountId, conid, side: 'SELL', quantity: openPosition.quantity, config });
        delete state.openPositions[symbol];
        state.tradesToday += 1;
        actions.push({ symbol, action: 'CLOSE', signal });
      } else if (signal.action === 'SELL' && !openPosition && config.SHORT_ENABLED) {
        actions.push({ symbol, action: 'skipped', reason: 'shorting_not_implemented' });
      } else {
        actions.push({ symbol, action: 'HOLD', signal });
      }
    } catch (e) {
      actions.push({ symbol, action: 'error', error: e.message });
    }
  }

  stateStore.save(state);

  const postHalt = risk.isHalted(state, config);
  equityHistory.recordDailySnapshot({
    date: today, equity, tradesToday: state.tradesToday,
    reachedDailyLossLimit: postHalt.reason === 'daily_loss_limit_reached',
    killSwitchActive: state.killSwitch,
  });

  return { halted: false, accountId, equity, actions, state };
}

module.exports = { runCycle, resolveAccountId, extractEquity };
