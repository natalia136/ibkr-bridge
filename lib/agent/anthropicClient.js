const Anthropic = require('@anthropic-ai/sdk');

// Returns undefined (not a client) when no credential is configured, so
// analystAgent.getAnalystVerdict can fail safe to HOLD instead of throwing.
function createAnthropicClient() {
  if (!process.env.ANTHROPIC_API_KEY) return undefined;
  return new Anthropic();
}

module.exports = { createAnthropicClient };
