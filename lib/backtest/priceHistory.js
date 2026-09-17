const fs = require('fs');
const path = require('path');
const https = require('https');

const CACHE_DIR = path.join(__dirname, '..', '..', 'data', 'price-cache');

function stooqSymbol(symbol) {
  // Stooq's US equity tickers are suffixed ".us" (e.g. aapl.us).
  return `${symbol.toLowerCase()}.us`;
}

function fetchCsv(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: 20000 }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function parseStooqCsv(csv) {
  const lines = csv.trim().split('\n');
  if (lines.length < 2 || !lines[0].toLowerCase().startsWith('date')) {
    return []; // Stooq returns a plain-text "No data" message for unknown symbols
  }
  return lines.slice(1).map(line => {
    const [date, o, h, l, c, v] = line.split(',');
    return { date, o: parseFloat(o), h: parseFloat(h), l: parseFloat(l), c: parseFloat(c), v: parseInt(v, 10) };
  }).filter(bar => bar.date && !Number.isNaN(bar.c));
}

function cachePath(symbol) {
  return path.join(CACHE_DIR, `${symbol.toUpperCase()}.json`);
}

function readCache(symbol) {
  try {
    return JSON.parse(fs.readFileSync(cachePath(symbol), 'utf8'));
  } catch {
    return null;
  }
}

function writeCache(symbol, bars) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(cachePath(symbol), JSON.stringify({ fetchedAt: new Date().toISOString(), bars }, null, 2));
}

// Full history is fetched and cached once per symbol (R1.2 reproducibility);
// callers slice the range they need out of it. Pass forceRefresh to re-download.
async function ensureFullHistory(symbol, { forceRefresh = false } = {}) {
  if (!forceRefresh) {
    const cached = readCache(symbol);
    if (cached?.bars?.length) return cached.bars;
  }
  const url = `https://stooq.com/q/d/l/?s=${stooqSymbol(symbol)}&d1=19900101&d2=${todayCompact()}&i=d`;
  const csv = await fetchCsv(url);
  const bars = parseStooqCsv(csv);
  if (!bars.length) {
    throw new Error(`No historical data returned by Stooq for "${symbol}" — check the ticker.`);
  }
  writeCache(symbol, bars);
  return bars;
}

function todayCompact() {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '');
}

// Business-day (Mon-Fri) gap detection, ignoring market holidays — an approximation
// per R1.3: good enough to flag suspiciously large holes, not a holiday calendar.
function findGaps(bars, from, to) {
  const present = new Set(bars.map(b => b.date));
  const gaps = [];
  const cursor = new Date(from);
  const end = new Date(to);
  while (cursor <= end) {
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) {
      const iso = cursor.toISOString().slice(0, 10);
      if (!present.has(iso)) gaps.push(iso);
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return gaps;
}

async function getHistoricalBars(symbol, from, to, opts = {}) {
  const allBars = await ensureFullHistory(symbol, opts);
  const bars = allBars.filter(b => b.date >= from && b.date <= to);
  const gaps = findGaps(bars, from, to);
  return { symbol, bars, gaps };
}

module.exports = { getHistoricalBars, parseStooqCsv, findGaps };
