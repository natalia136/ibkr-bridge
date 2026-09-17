const { httpGetJson } = require('./httpGet');
const https = require('https');

const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY || '';

const POSITIVE_WORDS = ['beats', 'surge', 'upgrade', 'record', 'growth', 'soar', 'rally', 'strong', 'profit', 'buyback', 'outperform', 'bullish', 'raises guidance'];
const NEGATIVE_WORDS = ['miss', 'plunge', 'downgrade', 'lawsuit', 'recall', 'probe', 'bearish', 'cuts guidance', 'layoffs', 'crash', 'warns', 'investigation', 'fraud'];

function scoreHeadlines(headlines) {
  if (!headlines.length) return 0;
  let score = 0;
  for (const h of headlines) {
    const text = h.toLowerCase();
    for (const w of POSITIVE_WORDS) if (text.includes(w)) score += 1;
    for (const w of NEGATIVE_WORDS) if (text.includes(w)) score -= 1;
  }
  // normalize roughly into [-1, 1]
  return Math.max(-1, Math.min(1, score / (headlines.length * 2)));
}

function fetchRssTitles(symbol) {
  return new Promise((resolve, reject) => {
    const url = `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(symbol)}&region=US&lang=en-US`;
    https.get(url, { timeout: 10000 }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        const titles = [...data.matchAll(/<title>(.*?)<\/title>/g)].map(m => m[1]).slice(1); // drop feed title
        resolve(titles);
      });
    }).on('error', reject).on('timeout', function () { this.destroy(); reject(new Error('timeout')); });
  });
}

// Returns { score, source, headlines } where score is in [-1 (very bearish), 1 (very bullish)].
// Prefers Finnhub's news-sentiment endpoint when FINNHUB_API_KEY is set (real sentiment data
// aggregated from actual news flow). Falls back to a crude keyword scan over Yahoo Finance RSS
// headlines when no key is configured — good enough to develop against, NOT a real sentiment
// model. Set FINNHUB_API_KEY before trusting this for anything beyond paper trading.
async function getNewsSentiment(symbol) {
  if (FINNHUB_API_KEY) {
    try {
      const url = `https://finnhub.io/api/v1/news-sentiment?symbol=${encodeURIComponent(symbol)}&token=${FINNHUB_API_KEY}`;
      const data = await httpGetJson(url);
      const bull = data?.sentiment?.bullishPercent ?? 0;
      const bear = data?.sentiment?.bearishPercent ?? 0;
      const score = Math.max(-1, Math.min(1, bull - bear));
      return { score, source: 'finnhub', articlesLastWeek: data?.buzz?.articlesInLastWeek ?? 0 };
    } catch (e) {
      console.error(`[news] Finnhub failed for ${symbol}, falling back to RSS: ${e.message}`);
    }
  }
  try {
    const titles = await fetchRssTitles(symbol);
    return { score: scoreHeadlines(titles), source: 'rss-keywords', headlines: titles.slice(0, 5) };
  } catch (e) {
    console.error(`[news] RSS fallback failed for ${symbol}: ${e.message}`);
    return { score: 0, source: 'none', headlines: [] };
  }
}

module.exports = { getNewsSentiment };
