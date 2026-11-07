const Anthropic = require('@anthropic-ai/sdk');
const { AnthropicVertex } = require('@anthropic-ai/vertex-sdk');

// Returns undefined (not a client) when no credential is configured, so
// analystAgent.getAnalystVerdict can fail safe to HOLD instead of throwing.
//
// Two providers, selected by what's configured (no separate on/off flag to
// keep in sync): GCP_PROJECT_ID set -> Vertex AI, using GCP Application
// Default Credentials (gcloud auth application-default login locally, or the
// Cloud Run/Compute service account in production) instead of a standalone
// Anthropic API key. Otherwise, ANTHROPIC_API_KEY -> the direct Anthropic API.
function createAnthropicClient() {
  if (process.env.GCP_PROJECT_ID) {
    return new AnthropicVertex({
      projectId: process.env.GCP_PROJECT_ID,
      region: process.env.GCP_REGION || 'us-east5',
    });
  }
  if (process.env.ANTHROPIC_API_KEY) {
    return new Anthropic();
  }
  return undefined;
}

module.exports = { createAnthropicClient };
