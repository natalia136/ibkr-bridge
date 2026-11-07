const fs = require('fs');
const path = require('path');
const screenerResultsStore = require('../screener/resultsStore');
const orders = require('../orderExecutor');
const ibkr = require('../ibkrClient');
const config = require('../config');

const STATE_FILE = path.join(__dirname, '..', '..', 'data', 'dca-state.json');

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return { lastContributionDate: null };
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

// Picks the top N symbols by DIVIDEND score (not the combined technical+dividend
// score) — for new money going into the long-term passive book, income safety
// matters more than short-term momentum. Excludes anything with insufficient
// dividend data: a DCA engine for retirement income shouldn't buy a name it
// can't even confirm pays a sustainable dividend.
function pickDcaCandidates(screenerLatest, topN) {
  const eligible = (screenerLatest?.candidates || [])
    .filter(c => c.dividend && !c.dividend.insufficientData)
    .sort((a, b) => b.dividend.score - a.dividend.score);
  return eligible.slice(0, topN);
}

// Splits a fixed contribution equally across the chosen candidates and
// converts to whole shares at the latest price each candidate's technical
// data was computed from (bars aren't re-fetched here — see note in README
// on using the screener's own freshness).
function computeDcaOrders(candidates, contributionAmount) {
  const perSymbolBudget = contributionAmount / candidates.length;
  return candidates.map(c => {
    const price = c.technical?.price;
    const quantity = price ? Math.floor(perSymbolBudget / price) : 0;
    return { symbol: c.symbol, conid: c.conid, price, quantity, budgetedUsd: perSymbolBudget };
  }).filter(o => o.quantity >= 1);
}

// Classic dollar-cost-averaging: once per period (default monthly), deploys a
// fixed contribution into the current best dividend-health candidates from the
// screener. This is a DIFFERENT mechanism from portfolioManager's drift
// rebalancing — DCA doesn't target a fixed allocation, it just keeps putting
// new money into whatever currently ranks best. Dry-run by default; pass
// execute: true AND set DCA_ENABLED=true to actually place orders. Goes
// through the same paper/live/graduation gate as every other order in this
// system — DCA is lower-risk than active trading, but we don't carve out a
// separate, weaker gate just for that; one gate, one source of truth.
async function runDca({ execute = false, accountId: accountIdOverride } = {}) {
  const screenerLatest = await screenerResultsStore.getLatest();
  if (!screenerLatest || !screenerLatest.candidates?.length) {
    return { contributed: false, reason: 'no_screener_results_yet_run_POST_run_on_the_screener_service' };
  }

  const state = loadState();
  const sinceLast = daysSince(state.lastContributionDate);
  if (execute && sinceLast < config.DCA_MIN_INTERVAL_DAYS) {
    return { contributed: false, reason: `contributed_too_recently (${sinceLast.toFixed(1)}d ago, minimum ${config.DCA_MIN_INTERVAL_DAYS}d)` };
  }

  const candidates = pickDcaCandidates(screenerLatest, config.DCA_TOP_N);
  if (!candidates.length) {
    return { contributed: false, reason: 'no_eligible_dividend_candidates_in_latest_screener_run' };
  }
  const proposedOrders = computeDcaOrders(candidates, config.DCA_MONTHLY_AMOUNT);
  if (!proposedOrders.length) {
    return { contributed: false, reason: 'contribution_amount_too_small_for_any_whole_share', candidates };
  }

  if (!execute || !config.DCA_ENABLED) {
    return { contributed: false, dryRun: true, contributionAmount: config.DCA_MONTHLY_AMOUNT, proposedOrders };
  }

  const accounts = await ibkr.getAccounts();
  const accountId = accountIdOverride || config.ACCOUNT_ID || accounts?.accounts?.[0] || accounts?.[0];
  if (!accountId) throw new Error('No IBKR account id available');

  const executed = [];
  for (const o of proposedOrders) {
    await orders.closePosition({ accountId, conid: o.conid, side: 'BUY', quantity: o.quantity, config });
    executed.push(o);
  }
  saveState({ lastContributionDate: new Date().toISOString().slice(0, 10) });

  return { contributed: true, accountId, contributionAmount: config.DCA_MONTHLY_AMOUNT, executed };
}

module.exports = { runDca, pickDcaCandidates, computeDcaOrders };
