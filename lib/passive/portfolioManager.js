const fs = require('fs');
const path = require('path');
const ibkr = require('../ibkrClient');
const orders = require('../orderExecutor');
const allocationStore = require('./allocation');
const config = require('../config');

const STATE_FILE = path.join(__dirname, '..', '..', 'data', 'passive-state.json');
const ALLOCATION_TOLERANCE = 0.02; // targets must sum to 100% ± 2pp to rebalance

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return { lastRebalanceDate: null };
  }
}
function saveState(state) {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function daysSince(dateStr) {
  if (!dateStr) return Infinity;
  return (Date.now() - new Date(dateStr).getTime()) / 86400000;
}

// For each target, compares current weight (position value / total equity) to
// the target weight. Missing positions are treated as 0% (fully underweight).
function computeDrift(targets, positionsBySymbol, pricesBySymbol, totalEquity) {
  return targets.map(t => {
    const position = positionsBySymbol[t.symbol];
    const price = pricesBySymbol[t.symbol] || 0;
    const currentValue = position ? position.quantity * price : 0;
    const currentPct = totalEquity > 0 ? currentValue / totalEquity : 0;
    return {
      symbol: t.symbol, conid: t.conid, targetPct: t.targetPct, currentPct,
      driftPct: currentPct - t.targetPct, currentValue, price,
      currentQuantity: position?.quantity || 0,
    };
  });
}

// Only acts on drifts beyond the threshold, and skips trades too small to be
// worth the commission (MIN_TRADE_VALUE) — a buy-and-hold book shouldn't churn
// over rounding noise.
function generateRebalanceOrders(driftRows, totalEquity, { driftThresholdPct, minTradeValue }) {
  const proposals = [];
  for (const row of driftRows) {
    if (Math.abs(row.driftPct) < driftThresholdPct) continue;
    if (!row.price) { proposals.push({ symbol: row.symbol, skipped: true, reason: 'no_price_available' }); continue; }

    const targetValue = row.targetPct * totalEquity;
    const deltaValue = targetValue - row.currentValue;
    if (Math.abs(deltaValue) < minTradeValue) continue;

    const side = deltaValue > 0 ? 'BUY' : 'SELL';
    const quantity = Math.floor(Math.abs(deltaValue) / row.price);
    if (quantity < 1) continue;

    proposals.push({ symbol: row.symbol, conid: row.conid, side, quantity, estimatedValue: quantity * row.price, driftPct: row.driftPct });
  }
  return proposals;
}

// Dry-run by default (returns proposed trades without sending anything to IBKR).
// Pass execute: true AND set PASSIVE_AUTOTRADE_ENABLED=true to actually place
// orders — same "off until you trust it" default as the active engine's
// AUTOTRADE_ENABLED. Every real order still goes through orderExecutor's
// assertSafeToTrade (paper/live/graduation gate) regardless of this flag.
async function runRebalance({ execute = false, accountId: accountIdOverride } = {}) {
  const allocation = allocationStore.load();
  if (!allocation.targets.length) {
    return { rebalanced: false, reason: 'no_allocation_configured' };
  }
  const total = allocationStore.totalTargetPct(allocation.targets);
  if (Math.abs(total - 1) > ALLOCATION_TOLERANCE) {
    return { rebalanced: false, reason: `allocation_targets_sum_to_${(total * 100).toFixed(1)}pct_not_100pct` };
  }

  const state = loadState();
  const sinceLast = daysSince(state.lastRebalanceDate);
  if (execute && sinceLast < config.REBALANCE_MIN_INTERVAL_DAYS) {
    return { rebalanced: false, reason: `rebalanced_too_recently (${sinceLast.toFixed(1)}d ago, minimum ${config.REBALANCE_MIN_INTERVAL_DAYS}d)` };
  }

  const accounts = await ibkr.getAccounts();
  const accountId = accountIdOverride || config.ACCOUNT_ID || accounts?.accounts?.[0] || accounts?.[0];
  if (!accountId) throw new Error('No IBKR account id available');

  const [summary, positionsRaw] = await Promise.all([
    ibkr.getAccountSummary(accountId),
    ibkr.getPositions(accountId),
  ]);
  const totalEquity = summary?.netliquidation?.amount ?? summary?.netliquidation ?? 0;
  const positionsBySymbol = {};
  for (const p of (Array.isArray(positionsRaw) ? positionsRaw : [])) {
    if (p.contractDesc || p.ticker) positionsBySymbol[(p.ticker || p.contractDesc)] = { quantity: p.position, conid: p.conid };
  }

  const pricesBySymbol = {};
  for (const t of allocation.targets) {
    const bars = await ibkr.getBars(t.conid, '1d', '5min');
    const lastBar = bars?.data?.slice(-1)?.[0];
    pricesBySymbol[t.symbol] = lastBar?.c ?? lastBar?.close;
  }

  const driftRows = computeDrift(allocation.targets, positionsBySymbol, pricesBySymbol, totalEquity);
  const proposals = generateRebalanceOrders(driftRows, totalEquity, {
    driftThresholdPct: config.REBALANCE_DRIFT_THRESHOLD_PCT,
    minTradeValue: config.REBALANCE_MIN_TRADE_VALUE,
  });

  if (!execute || !config.PASSIVE_AUTOTRADE_ENABLED) {
    return { rebalanced: false, dryRun: true, accountId, totalEquity, driftRows, proposals };
  }

  const executed = [];
  for (const p of proposals.filter(x => !x.skipped)) {
    await orders.closePosition({ accountId, conid: p.conid, side: p.side, quantity: p.quantity, config });
    executed.push(p);
  }
  saveState({ lastRebalanceDate: new Date().toISOString().slice(0, 10) });

  return { rebalanced: true, accountId, totalEquity, driftRows, executed };
}

module.exports = { runRebalance, computeDrift, generateRebalanceOrders };
