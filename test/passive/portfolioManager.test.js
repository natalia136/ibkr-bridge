const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { computeDrift, generateRebalanceOrders, runRebalance } = require('../../lib/passive/portfolioManager');
const allocationStore = require('../../lib/passive/allocation');

const ALLOCATION_FILE = path.join(__dirname, '..', '..', 'data', 'passive-allocation.json');
function cleanState() { fs.rmSync(ALLOCATION_FILE, { force: true }); }
test.beforeEach(cleanState);
test.after(cleanState);

test('computeDrift treats a missing position as fully underweight', () => {
  const targets = [{ symbol: 'VYM', conid: 1, targetPct: 0.5 }, { symbol: 'SCHD', conid: 2, targetPct: 0.5 }];
  const positions = { VYM: { quantity: 100 } };
  const prices = { VYM: 100, SCHD: 50 };
  const drift = computeDrift(targets, positions, prices, 20000);

  const vym = drift.find(d => d.symbol === 'VYM');
  const schd = drift.find(d => d.symbol === 'SCHD');
  assert.equal(vym.currentPct, 0.5); // 100*100 / 20000
  assert.equal(vym.driftPct, 0);
  assert.equal(schd.currentPct, 0);
  assert.equal(schd.driftPct, -0.5);
});

test('generateRebalanceOrders proposes a BUY for an underweight position beyond threshold', () => {
  const driftRows = [{ symbol: 'SCHD', conid: 2, targetPct: 0.5, currentPct: 0, driftPct: -0.5, currentValue: 0, price: 50, currentQuantity: 0 }];
  const proposals = generateRebalanceOrders(driftRows, 20000, { driftThresholdPct: 0.05, minTradeValue: 50 });
  assert.equal(proposals.length, 1);
  assert.equal(proposals[0].side, 'BUY');
  assert.equal(proposals[0].quantity, Math.floor(10000 / 50));
});

test('generateRebalanceOrders ignores drift within threshold', () => {
  const driftRows = [{ symbol: 'SCHD', conid: 2, targetPct: 0.5, currentPct: 0.48, driftPct: -0.02, currentValue: 9600, price: 50, currentQuantity: 192 }];
  const proposals = generateRebalanceOrders(driftRows, 20000, { driftThresholdPct: 0.05, minTradeValue: 50 });
  assert.equal(proposals.length, 0);
});

test('generateRebalanceOrders proposes a SELL for an overweight position', () => {
  const driftRows = [{ symbol: 'VYM', conid: 1, targetPct: 0.2, currentPct: 0.5, driftPct: 0.3, currentValue: 10000, price: 100, currentQuantity: 100 }];
  const proposals = generateRebalanceOrders(driftRows, 20000, { driftThresholdPct: 0.05, minTradeValue: 50 });
  assert.equal(proposals.length, 1);
  assert.equal(proposals[0].side, 'SELL');
});

test('runRebalance refuses with no allocation configured', async () => {
  const result = await runRebalance({});
  assert.equal(result.rebalanced, false);
  assert.equal(result.reason, 'no_allocation_configured');
});

test('runRebalance refuses when targets do not sum to 100%', async () => {
  await allocationStore.save({ targets: [{ symbol: 'VYM', conid: 1, targetPct: 0.3 }] });
  const result = await runRebalance({});
  assert.equal(result.rebalanced, false);
  assert.ok(result.reason.startsWith('allocation_targets_sum_to'));
});
