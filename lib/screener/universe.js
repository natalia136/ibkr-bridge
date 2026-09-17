// Default screening universe: a modest, sector-diversified set of large caps
// (mix of growth names and known dividend payers) so a free-tier API budget
// covers a full run. Override with the SCREENER_UNIVERSE env var
// (comma-separated tickers) or by passing `universe` explicitly to /run.
const DEFAULT_UNIVERSE = [
  // Tech / growth
  'AAPL', 'MSFT', 'GOOGL', 'NVDA', 'AVGO',
  // Dividend-oriented / value
  'JNJ', 'PG', 'KO', 'PEP', 'XOM', 'CVX', 'JPM', 'HD', 'MMM', 'VZ',
  // Healthcare
  'UNH', 'ABBV', 'MRK', 'PFE',
  // Industrials / consumer
  'CAT', 'HON', 'MCD', 'WMT', 'COST',
  // Utilities / REITs (classic income sectors)
  'NEE', 'DUK', 'O', 'SO',
];

function getUniverse() {
  if (process.env.SCREENER_UNIVERSE) {
    return process.env.SCREENER_UNIVERSE.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
  }
  return DEFAULT_UNIVERSE;
}

module.exports = { getUniverse, DEFAULT_UNIVERSE };
