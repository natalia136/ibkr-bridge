const fs = require('fs');
const path = require('path');
const ibkr = require('../ibkrClient');

const ALLOCATION_FILE = path.join(__dirname, '..', '..', 'data', 'passive-allocation.json');

function load() {
  try {
    return JSON.parse(fs.readFileSync(ALLOCATION_FILE, 'utf8'));
  } catch {
    return { targets: [] }; // empty by default — set your target allocation before rebalancing
  }
}

function save(allocation) {
  fs.mkdirSync(path.dirname(ALLOCATION_FILE), { recursive: true });
  fs.writeFileSync(ALLOCATION_FILE, JSON.stringify(allocation, null, 2));
}

function totalTargetPct(targets) {
  return targets.reduce((sum, t) => sum + t.targetPct, 0);
}

// Adds or updates a target weight (0-1, e.g. 0.10 = 10% of the passive book).
// Does not require weights to sum to 1 immediately — validated at rebalance time
// so you can build up an allocation one symbol at a time.
async function setTarget(symbol, targetPct) {
  if (targetPct < 0 || targetPct > 1) throw new Error('targetPct must be between 0 and 1');
  const allocation = load();
  symbol = symbol.toUpperCase();
  const existing = allocation.targets.find(t => t.symbol === symbol);
  if (existing) {
    existing.targetPct = targetPct;
  } else {
    const results = await ibkr.searchSymbol(symbol);
    const conid = results?.[0]?.conid;
    if (!conid) throw new Error(`Could not resolve a conid for symbol "${symbol}"`);
    allocation.targets.push({ symbol, conid, targetPct });
  }
  save(allocation);
  return allocation;
}

function removeTarget(symbol) {
  const allocation = load();
  symbol = symbol.toUpperCase();
  allocation.targets = allocation.targets.filter(t => t.symbol !== symbol);
  save(allocation);
  return allocation;
}

module.exports = { load, save, setTarget, removeTarget, totalTargetPct };
