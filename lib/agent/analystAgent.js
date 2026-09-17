const fs = require('fs');
const path = require('path');
const { z } = require('zod');

const CACHE_DIR = path.join(__dirname, '..', '..', 'data', 'agent-cache');

// The LLM only ever narrows what the deterministic engine is allowed to do —
// it recommends BUY/HOLD/AVOID and explains why, but it never sets quantity,
// stops, or touches risk limits (see lib/tradingCycle.js and riskManager.js).
// This is the "hybrid: LLM investiga, reglas deciden" design the user chose.
const VerdictSchema = z.object({
  recommendation: z.enum(['BUY', 'HOLD', 'AVOID']),
  confidence: z.number().min(0).max(100),
  reasoning: z.string(),
  riskFlags: z.array(z.string()),
});

const SYSTEM_PROMPT = `Eres un gestor de portafolio senior de Wall Street, conocido por proteger el capital de tus clientes antes que por perseguir rendimientos. Analizas una acción candidata usando datos técnicos, salud de dividendos, y titulares de noticias recientes.

Reglas estrictas:
- Tu recomendación es solo un insumo. NUNCA decides tamaño de posición, stop-loss, ni límites de riesgo — eso lo maneja un sistema determinista aparte.
- Sé conservador: en caso de duda o de datos insuficientes, recomienda HOLD, no BUY.
- AVOID cuando detectes señales de alerta genuinas (deterioro fundamental, riesgo de titular negativo reciente, valuación desconectada de fundamentales, "yield trap").
- No inventes datos que no te dieron. Si falta información, dilo en el razonamiento y ajusta tu confianza hacia abajo.
- Sé breve y específico en el razonamiento (2-4 oraciones) — nada de relleno motivacional.`;

function cachePath(symbol, date) {
  return path.join(CACHE_DIR, date, `${symbol.toUpperCase()}.json`);
}

function readCache(symbol, date) {
  try {
    return JSON.parse(fs.readFileSync(cachePath(symbol, date), 'utf8'));
  } catch {
    return null;
  }
}

function writeCache(symbol, date, verdict) {
  const p = cachePath(symbol, date);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(verdict, null, 2));
}

function buildUserPrompt({ symbol, technical, dividend, newsHeadlines, portfolioContext }) {
  return JSON.stringify({
    symbol,
    technical: technical ? {
      score: technical.score,
      trend: technical.components?.trend?.note,
      momentum: technical.components?.momentum?.note,
      rsi: technical.rsi,
      pctFrom52wLow: technical.pctFrom52wLow,
    } : 'unavailable',
    dividend: dividend && !dividend.insufficientData ? {
      score: dividend.score,
      yieldPct: dividend.yieldPct,
      consecutiveGrowthYears: dividend.consecutiveGrowthYears,
      payoutRatioPct: dividend.payoutRatioPct,
    } : 'unavailable',
    recentHeadlines: newsHeadlines?.slice(0, 8) || [],
    portfolioContext: portfolioContext || 'sin contexto adicional de portafolio',
  }, null, 2);
}

// Returns a cached verdict for (symbol, date) if we already asked today —
// this is a daily research view, not a per-cycle call, to keep cost and
// latency sane on a system that may run a cycle every few minutes.
async function getAnalystVerdict(input, { client, model = 'claude-opus-5', date = new Date().toISOString().slice(0, 10) } = {}) {
  const cached = readCache(input.symbol, date);
  if (cached) return cached;

  if (!client) {
    return { recommendation: 'HOLD', confidence: 0, reasoning: 'Agent unavailable (no Anthropic client configured) — failing safe to HOLD.', riskFlags: ['agent_unavailable'], degraded: true };
  }

  try {
    const zodOutputFormatModule = require('@anthropic-ai/sdk/helpers/zod');
    const response = await client.messages.parse({
      model,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildUserPrompt(input) }],
      output_config: { format: zodOutputFormatModule.zodOutputFormat(VerdictSchema) },
    });

    if (!response.parsed_output) {
      return { recommendation: 'HOLD', confidence: 0, reasoning: 'Agent response failed to parse — failing safe to HOLD.', riskFlags: ['parse_error'], degraded: true };
    }
    const verdict = { ...response.parsed_output, degraded: false };
    writeCache(input.symbol, date, verdict);
    return verdict;
  } catch (e) {
    console.error(`[agent] analysis failed for ${input.symbol}: ${e.message}`);
    return { recommendation: 'HOLD', confidence: 0, reasoning: `Agent call failed (${e.message}) — failing safe to HOLD.`, riskFlags: ['agent_error'], degraded: true };
  }
}

module.exports = { getAnalystVerdict, VerdictSchema };
