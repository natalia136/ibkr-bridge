const ibkr = require('./ibkrClient');
const graduationGate = require('./graduation/graduationGate');

// Refuses to trade a real account unless explicitly, deliberately unlocked
// AND the system has earned it (backtest passed + a clean paper track record).
// Manually flipping PAPER_MODE/LIVE_TRADING_CONFIRM is necessary but not
// sufficient — see lib/graduation/graduationGate.js for why.
function assertSafeToTrade(accountId, config) {
  if (config.PAPER_MODE) {
    if (!accountId.startsWith('DU')) {
      throw new Error(
        `PAPER_MODE is on but account "${accountId}" does not look like an IBKR paper account (expected it to start with "DU"). Refusing to place an order.`
      );
    }
    return;
  }
  if (config.LIVE_TRADING_CONFIRM !== 'I_UNDERSTAND_THE_RISK') {
    throw new Error(
      'PAPER_MODE is off but LIVE_TRADING_CONFIRM=I_UNDERSTAND_THE_RISK is not set. Refusing to place a real-money order.'
    );
  }
  const graduation = graduationGate.checkGraduation({ MIN_PAPER_DAYS: config.GRADUATION_MIN_PAPER_DAYS });
  if (!graduation.graduated) {
    throw new Error(
      `Refusing to place a real-money order — graduation gate not satisfied: ${graduation.reasons.join(', ')}. ` +
      `Check GET /graduation/status.`
    );
  }
}

// Places a bracket order: a market entry plus a stop-loss and a take-profit child order.
// IBKR links bracket legs via a client order id (cOid) on the parent and matching
// parentId on the children. Verify this shape against your IB Gateway's current
// /iserver/account/{accountId}/orders docs before relying on it with real capital —
// this is the documented pattern but API details can shift between gateway versions.
async function placeBracketOrder({ accountId, conid, side, quantity, stopPrice, takeProfitPrice, config }) {
  assertSafeToTrade(accountId, config);

  const closingSide = side === 'BUY' ? 'SELL' : 'BUY';
  const cOid = `sig-${conid}-${Date.now()}`;

  const orders = [
    {
      conid, orderType: 'MKT', side, quantity, tif: 'DAY', acctId: accountId, cOid,
    },
    {
      conid, orderType: 'STP', side: closingSide, quantity, tif: 'DAY', acctId: accountId,
      auxPrice: stopPrice, parentId: cOid,
    },
    {
      conid, orderType: 'LMT', side: closingSide, quantity, tif: 'DAY', acctId: accountId,
      price: takeProfitPrice, parentId: cOid,
    },
  ];

  return ibkr.placeOrders(accountId, orders);
}

async function closePosition({ accountId, conid, side, quantity, config }) {
  assertSafeToTrade(accountId, config);
  const orders = [{ conid, orderType: 'MKT', side, quantity, tif: 'DAY', acctId: accountId }];
  return ibkr.placeOrders(accountId, orders);
}

module.exports = { placeBracketOrder, closePosition, assertSafeToTrade };
