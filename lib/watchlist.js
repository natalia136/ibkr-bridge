const fs = require('fs');
const path = require('path');
const ibkr = require('./ibkrClient');

const WATCHLIST_FILE = path.join(__dirname, '..', 'data', 'watchlist.json');

function load() {
  try {
    return JSON.parse(fs.readFileSync(WATCHLIST_FILE, 'utf8'));
  } catch {
    return { symbols: [] }; // empty by default — add symbols via POST /watchlist before enabling autotrade
  }
}

function save(watchlist) {
  fs.mkdirSync(path.dirname(WATCHLIST_FILE), { recursive: true });
  fs.writeFileSync(WATCHLIST_FILE, JSON.stringify(watchlist, null, 2));
}

async function addSymbol(symbol) {
  const watchlist = load();
  symbol = symbol.toUpperCase();
  if (watchlist.symbols.some(s => s.symbol === symbol)) return watchlist;

  const results = await ibkr.searchSymbol(symbol);
  const conid = results?.[0]?.conid;
  if (!conid) throw new Error(`Could not resolve a conid for symbol "${symbol}"`);

  watchlist.symbols.push({ symbol, conid });
  save(watchlist);
  return watchlist;
}

function removeSymbol(symbol) {
  const watchlist = load();
  symbol = symbol.toUpperCase();
  watchlist.symbols = watchlist.symbols.filter(s => s.symbol !== symbol);
  save(watchlist);
  return watchlist;
}

module.exports = { load, save, addSymbol, removeSymbol };
