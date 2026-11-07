const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { pickDcaCandidates, computeDcaOrders, runDca } = require('../../lib/passive/autoDca');
const screenerResultsStore = require('../../lib/screener/resultsStore');

const SCREENER_RESULTS_DIR = path.join(__dirname, '..', '..', 'data', 'screener-results');
const DCA_STATE_FILE = path.join(__dirname, '..', '..', 'data', 'dca-state.json');

function cleanState() {
  fs.rmSync(SCREENER_RESULTS_DIR, { recursive: true, force: true });
  fs.rmSync(DCA_STATE_FILE, { force: true });
}
test.beforeEach(cleanState);
test.after(cleanState);

function candidate(symbol, dividendScore, { insufficientData = false, price = 100 } = {}) {
  return {
    symbol, conid: symbol.length,
    technical: { score: 50, price },
    dividend: { score: dividendScore, insufficientData },
  };
}

test('pickDcaCandidates ranks by dividend score and excludes insufficient data', () => {
  const candidates = [
    candidate('LOW', 30),
    candidate('HIGH', 90),
    candidate('NODATA', 95, { insufficientData: true }),
    candidate('MID', 60),
  ];
  const picked = pickDcaCandidates({ candidates }, 2);
  assert.deepEqual(picked.map(c => c.symbol), ['HIGH', 'MID']);
});

test('computeDcaOrders splits the contribution equally and rounds down to whole shares', () => {
  const candidates = [candidate('A', 80, { price: 100 }), candidate('B', 70, { price: 50 })];
  const orders = computeDcaOrders(candidates, 300); // $150 per symbol
  assert.deepEqual(orders.find(o => o.symbol === 'A').quantity, 1); // floor(150/100)
  assert.deepEqual(orders.find(o => o.symbol === 'B').quantity, 3); // floor(150/50)
});

test('computeDcaOrders drops a candidate whose budget cannot buy even one share', () => {
  const candidates = [candidate('EXPENSIVE', 80, { price: 10000 })];
  const orders = computeDcaOrders(candidates, 100);
  assert.equal(orders.length, 0);
});

test('runDca refuses with no screener results yet', async () => {
  const result = await runDca({});
  assert.equal(result.contributed, false);
  assert.ok(result.reason.startsWith('no_screener_results'));
});

test('runDca returns a dry-run proposal by default without touching IBKR', async () => {
  await screenerResultsStore.saveRun('run-1', {
    candidates: [candidate('GOOD', 85, { price: 50 }), candidate('ALSO_GOOD', 75, { price: 25 })],
  });
  const result = await runDca({}); // execute not set -> must stay dry-run
  assert.equal(result.contributed, false);
  assert.equal(result.dryRun, true);
  assert.ok(result.proposedOrders.length >= 1);
});

test('runDca refuses to run twice within the minimum interval', async () => {
  await screenerResultsStore.saveRun('run-1', { candidates: [candidate('GOOD', 85, { price: 50 })] });
  fs.mkdirSync(path.dirname(DCA_STATE_FILE), { recursive: true });
  fs.writeFileSync(DCA_STATE_FILE, JSON.stringify({ lastContributionDate: new Date().toISOString().slice(0, 10) }));
  const result = await runDca({ execute: true });
  assert.equal(result.contributed, false);
  assert.ok(result.reason.startsWith('contributed_too_recently'));
});
