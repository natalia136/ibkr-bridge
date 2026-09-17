const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { getAnalystVerdict } = require('../../lib/agent/analystAgent');

const CACHE_DIR = path.join(__dirname, '..', '..', 'data', 'agent-cache');

test.beforeEach(() => { fs.rmSync(CACHE_DIR, { recursive: true, force: true }); });
test.after(() => { fs.rmSync(CACHE_DIR, { recursive: true, force: true }); });

test('fails safe to HOLD when no client is configured', async () => {
  const verdict = await getAnalystVerdict({ symbol: 'AAPL' }, { client: undefined, date: '2024-01-01' });
  assert.equal(verdict.recommendation, 'HOLD');
  assert.equal(verdict.degraded, true);
  assert.ok(verdict.riskFlags.includes('agent_unavailable'));
});

test('returns and caches a parsed verdict from the client', async () => {
  let calls = 0;
  const fakeClient = {
    messages: {
      async parse() {
        calls++;
        return { parsed_output: { recommendation: 'BUY', confidence: 72, reasoning: 'Strong uptrend, healthy payout.', riskFlags: [] } };
      },
    },
  };

  const first = await getAnalystVerdict({ symbol: 'MSFT' }, { client: fakeClient, date: '2024-02-01' });
  assert.equal(first.recommendation, 'BUY');
  assert.equal(calls, 1);

  const second = await getAnalystVerdict({ symbol: 'MSFT' }, { client: fakeClient, date: '2024-02-01' });
  assert.equal(second.recommendation, 'BUY');
  assert.equal(calls, 1, 'second call same day should hit the cache, not the client');
});

test('fails safe to HOLD when the client throws', async () => {
  const fakeClient = { messages: { async parse() { throw new Error('network down'); } } };
  const verdict = await getAnalystVerdict({ symbol: 'XOM' }, { client: fakeClient, date: '2024-03-01' });
  assert.equal(verdict.recommendation, 'HOLD');
  assert.equal(verdict.degraded, true);
  assert.ok(verdict.riskFlags.includes('agent_error'));
});

test('fails safe to HOLD when parsing produced no output', async () => {
  const fakeClient = { messages: { async parse() { return { parsed_output: null }; } } };
  const verdict = await getAnalystVerdict({ symbol: 'JPM' }, { client: fakeClient, date: '2024-04-01' });
  assert.equal(verdict.recommendation, 'HOLD');
  assert.ok(verdict.riskFlags.includes('parse_error'));
});
