#!/usr/bin/env node
// CLI runner for the backtest engine — see specs/backtest-engine/.
// Usage:
//   node scripts/backtest.js --symbols AAPL,MSFT,NVDA --start 2022-01-01 --split 2023-07-01 --end 2024-01-01 [--equity 100000]

const { runBacktest, ACCEPTANCE_GATE } = require('../lib/backtest/runBacktest');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      args[key] = argv[i + 1];
      i++;
    }
  }
  return args;
}

function printSummary(label, m) {
  console.log(`\n  ${label}`);
  console.log(`    Return: ${(m.totalReturnPct * 100).toFixed(2)}%  CAGR: ${(m.cagr * 100).toFixed(2)}%`);
  console.log(`    Sharpe: ${m.sharpeRatio.toFixed(2)}  Sortino: ${m.sortinoRatio.toFixed(2)}`);
  console.log(`    Max drawdown: ${(m.maxDrawdownPct * 100).toFixed(2)}% (${m.durationDays}d, recovered: ${m.recoveryDate ? 'yes' : 'no'})`);
  console.log(`    Win rate: ${(m.winRate * 100).toFixed(1)}%  Profit factor: ${m.profitFactor}  Trades: ${m.totalTrades}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.symbols || !args.start || !args.split || !args.end) {
    console.error('Usage: node scripts/backtest.js --symbols AAPL,MSFT --start YYYY-MM-DD --split YYYY-MM-DD --end YYYY-MM-DD [--equity 100000]');
    process.exit(1);
  }

  const universe = args.symbols.split(',').map(s => s.trim().toUpperCase());
  const initialEquity = args.equity ? parseFloat(args.equity) : 100000;

  console.log(`Running backtest: ${universe.join(', ')} | ${args.start} -> split ${args.split} -> ${args.end}`);
  const { runId, report } = await runBacktest({
    universe, startDate: args.start, splitDate: args.split, endDate: args.end, initialEquity,
  });

  console.log(`\nRun ID: ${runId}`);
  if (report.dataQuality.sentimentThresholdOverridden) {
    console.log('NOTE: sentiment data is degraded (no historical provider configured) — this run measures momentum only.');
  }
  const gapSymbols = Object.keys(report.dataQuality.priceGapsFound);
  if (gapSymbols.length) {
    console.log(`NOTE: price gaps detected for: ${gapSymbols.join(', ')} (see report.json for dates)`);
  }

  printSummary('IN-SAMPLE (strategy)', report.inSample);
  printSummary('IN-SAMPLE (buy & hold benchmark)', report.benchmark.inSample);
  printSummary('OUT-OF-SAMPLE (strategy)', report.outOfSample);
  printSummary('OUT-OF-SAMPLE (buy & hold benchmark)', report.benchmark.outOfSample);

  console.log(`\nAcceptance gate (out-of-sample): Sharpe>=${ACCEPTANCE_GATE.minSharpe}, drawdown>=${ACCEPTANCE_GATE.maxDrawdownFloor * 100}%, profitFactor>${ACCEPTANCE_GATE.minProfitFactor}, trades>=${ACCEPTANCE_GATE.minTrades}`);
  console.log(report.passesGate ? '  PASSES — worth continuing to paper trading validation.' : '  DOES NOT PASS — do not move to paper/live with this configuration as-is.');
}

main().catch(e => { console.error('Backtest failed:', e); process.exit(1); });
