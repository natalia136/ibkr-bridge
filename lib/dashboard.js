function pct(x, digits = 1) {
  return typeof x === 'number' ? `${(x * 100).toFixed(digits)}%` : '—';
}

function statusPill(ok, label) {
  const color = ok ? '#1a7f37' : '#cf222e';
  return `<span style="color:${color}; font-weight:600;">${label}</span>`;
}

function graduationSection(graduation, config) {
  const progress = Math.min(100, (graduation.paperDaysClean / graduation.paperDaysRequired) * 100);
  return `
  <section>
    <h2>Graduación a dinero real ${statusPill(graduation.graduated, graduation.graduated ? 'LISTO' : 'BLOQUEADO')}</h2>
    <p class="meta">PAPER_MODE actual: <strong>${config.PAPER_MODE}</strong> · LIVE_TRADING_CONFIRM: <strong>${config.LIVE_TRADING_CONFIRM ? 'set' : 'no set'}</strong></p>
    <p>Backtest más reciente: ${statusPill(graduation.backtestPassed, graduation.backtestPassed ? 'pasó el gate' : 'no pasó / no existe')} (${graduation.backtestRunId || 'sin corridas'})</p>
    <p>Track record en paper: ${graduation.paperDaysClean}/${graduation.paperDaysRequired} días limpios</p>
    <div class="bar"><div class="bar-fill" style="width:${progress}%"></div></div>
    ${graduation.reasons.length ? `<p class="warn">Pendiente: ${graduation.reasons.join(' · ')}</p>` : '<p class="ok">Todos los requisitos cumplidos.</p>'}
  </section>`;
}

function activeEngineSection(state, watchlist, config) {
  const positions = Object.entries(state.openPositions || {});
  return `
  <section>
    <h2>Motor activo (trading)</h2>
    <p class="meta">Kill switch: ${statusPill(!state.killSwitch, state.killSwitch ? 'ACTIVADO (detenido)' : 'apagado (corriendo)')} ·
       Agente híbrido: ${config.AGENT_GATE_ENABLED ? 'activado' : 'desactivado'} · Watchlist: ${watchlist.symbols.length} símbolos</p>
    <p>Trades hoy: ${state.tradesToday} · P&amp;L realizado hoy: ${state.realizedPnlToday?.toFixed(2) ?? '0.00'}</p>
    <table>
      <thead><tr><th>Símbolo</th><th>Cant.</th><th>Entrada</th><th>Stop</th><th>Take profit</th></tr></thead>
      <tbody>
        ${positions.map(([symbol, p]) => `<tr><td class="sym">${symbol}</td><td>${p.quantity}</td><td>${p.entryPrice}</td><td>${p.stopPrice}</td><td>${p.takeProfitPrice}</td></tr>`).join('') || '<tr><td colspan="5" class="meta">Sin posiciones abiertas</td></tr>'}
      </tbody>
    </table>
  </section>`;
}

function passiveSection(allocation, rebalancePreview) {
  const rows = rebalancePreview?.driftRows || [];
  return `
  <section>
    <h2>Cartera pasiva (dividendos / ETFs)</h2>
    <p class="meta">${allocation.targets.length} símbolos objetivo · ${rebalancePreview?.rebalanced === false && rebalancePreview?.reason ? `vista previa: ${rebalancePreview.reason}` : 'vista previa de rebalanceo (dry-run)'}</p>
    <table>
      <thead><tr><th>Símbolo</th><th>Objetivo</th><th>Actual</th><th>Desvío</th></tr></thead>
      <tbody>
        ${rows.map(r => `<tr><td class="sym">${r.symbol}</td><td>${pct(r.targetPct)}</td><td>${pct(r.currentPct)}</td><td style="color:${Math.abs(r.driftPct) > 0.05 ? '#9a6700' : 'inherit'}">${pct(r.driftPct)}</td></tr>`).join('') || '<tr><td colspan="4" class="meta">Sin asignación configurada — POST /passive/allocation</td></tr>'}
      </tbody>
    </table>
  </section>`;
}

// Single-page "mission control" tying together the graduation gate, the
// active trading engine's state, and the passive book's drift — the
// unified view for "is this thing making or losing money, and is it safe
// to give it more capital yet".
function renderMissionControl({ graduation, allocation, rebalancePreview, state, watchlist, config }) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Mission Control</title>
<style>
  body { font-family: -apple-system, sans-serif; max-width: 960px; margin: 2rem auto; padding: 0 1rem; color: #1f2328; }
  h1 { font-size: 1.5rem; } h2 { font-size: 1.1rem; margin-top: 2rem; }
  section { margin-bottom: 1.5rem; }
  .meta { color: #57606a; font-size: 0.9rem; }
  .warn { color: #9a6700; } .ok { color: #1a7f37; }
  table { width: 100%; border-collapse: collapse; font-size: 0.9rem; margin-top: 0.5rem; }
  th, td { text-align: left; padding: 0.4rem; border-bottom: 1px solid #d0d7de; }
  .sym { font-weight: 700; }
  .bar { background: #d0d7de; border-radius: 4px; height: 8px; overflow: hidden; margin: 0.5rem 0; }
  .bar-fill { background: #1a7f37; height: 100%; }
  .disclaimer { margin-top: 2rem; padding: 1rem; background: #f6f8fa; border-radius: 6px; font-size: 0.85rem; color: #57606a; }
</style>
</head>
<body>
  <h1>Mission Control</h1>
  <p class="meta">Actualizado: ${new Date().toLocaleString()}</p>
  ${graduationSection(graduation, config)}
  ${activeEngineSection(state, watchlist, config)}
  ${passiveSection(allocation, rebalancePreview)}
  <div class="disclaimer">
    Nada aquí garantiza rendimiento futuro. El gate de graduación existe para que
    ningún dólar real se mueva sin que el sistema haya demostrado, con datos, que
    vale la pena confiarle capital.
  </div>
</body>
</html>`;
}

module.exports = { renderMissionControl };
