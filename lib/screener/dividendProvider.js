const fs = require('fs');
const path = require('path');
const { httpGetJson } = require('../httpGet');

const FMP_API_KEY = process.env.FMP_API_KEY || '';
const CACHE_DIR = path.join(__dirname, '..', '..', 'data', 'dividend-cache');
const CACHE_TTL_MS = 20 * 60 * 60 * 1000; // fundamentals barely move intraday — cache ~1 day

function cachePath(symbol) {
  return path.join(CACHE_DIR, `${symbol.toUpperCase()}.json`);
}

function readCache(symbol) {
  try {
    const cached = JSON.parse(fs.readFileSync(cachePath(symbol), 'utf8'));
    if (Date.now() - new Date(cached.fetchedAt).getTime() < CACHE_TTL_MS) return cached.profile;
    return null;
  } catch {
    return null;
  }
}

function writeCache(symbol, profile) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(cachePath(symbol), JSON.stringify({ fetchedAt: new Date().toISOString(), profile }, null, 2));
}

// Groups a dividend history (array of {date, dividend}) into calendar-year totals,
// then counts how many consecutive years (ending last year) had a strictly higher
// total than the year before — a simple, honest proxy for "dividend growth streak".
function consecutiveGrowthYears(dividendHistory) {
  const byYear = {};
  for (const d of dividendHistory) {
    const year = d.date.slice(0, 4);
    byYear[year] = (byYear[year] || 0) + d.dividend;
  }
  const years = Object.keys(byYear).map(Number).sort((a, b) => b - a);
  const currentYear = new Date().getUTCFullYear();
  const completeYears = years.filter(y => y < currentYear); // exclude the still-in-progress year
  let streak = 0;
  for (let i = 0; i < completeYears.length - 1; i++) {
    if (byYear[completeYears[i]] > byYear[completeYears[i + 1]]) streak++;
    else break;
  }
  return streak;
}

function trailingYield(dividendHistory, price) {
  if (!price || price <= 0) return null;
  const cutoff = Date.now() - 366 * 86400000;
  const sum = dividendHistory
    .filter(d => new Date(d.date).getTime() >= cutoff)
    .reduce((acc, d) => acc + d.dividend, 0);
  return (sum / price) * 100;
}

// Fetches a dividend profile for a symbol from Financial Modeling Prep (free tier).
// Degrades explicitly (documented per field) rather than guessing when data is
// missing — the same honesty principle used for news sentiment (see newsProvider.js).
async function getDividendProfile(symbol) {
  const cached = readCache(symbol);
  if (cached) return cached;

  if (!FMP_API_KEY) {
    return { yieldPct: null, consecutiveGrowthYears: null, payoutRatioPct: null, degraded: true, reason: 'no_fmp_api_key' };
  }

  try {
    const [profileRes, dividendsRes, ratiosRes] = await Promise.all([
      httpGetJson(`https://financialmodelingprep.com/api/v3/profile/${symbol}?apikey=${FMP_API_KEY}`),
      httpGetJson(`https://financialmodelingprep.com/api/v3/historical-price-full/stock_dividend/${symbol}?apikey=${FMP_API_KEY}`),
      httpGetJson(`https://financialmodelingprep.com/api/v3/ratios-ttm/${symbol}?apikey=${FMP_API_KEY}`).catch(() => null),
    ]);

    const price = profileRes?.[0]?.price ?? null;
    const history = (dividendsRes?.historical || []).map(d => ({ date: d.date, dividend: d.adjDividend ?? d.dividend }));
    const payoutRatioPct = ratiosRes?.[0]?.payoutRatioTTM != null ? ratiosRes[0].payoutRatioTTM * 100 : null;

    const profile = {
      yieldPct: history.length ? trailingYield(history, price) : null,
      consecutiveGrowthYears: history.length ? consecutiveGrowthYears(history) : null,
      payoutRatioPct,
      degraded: history.length === 0,
      reason: history.length === 0 ? 'no_dividend_history' : (payoutRatioPct === null ? 'payout_ratio_unavailable' : null),
    };
    writeCache(symbol, profile);
    return profile;
  } catch (e) {
    console.error(`[dividends] failed for ${symbol}: ${e.message}`);
    return { yieldPct: null, consecutiveGrowthYears: null, payoutRatioPct: null, degraded: true, reason: 'fetch_error' };
  }
}

module.exports = { getDividendProfile, consecutiveGrowthYears, trailingYield };
