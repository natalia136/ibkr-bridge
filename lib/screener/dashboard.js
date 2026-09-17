function scoreColor(score) {
  if (score >= 70) return '#1a7f37';
  if (score >= 45) return '#9a6700';
  return '#cf222e';
}

function fmt(n, digits = 1) {
  return typeof n === 'number' ? n.toFixed(digits) : '—';
}

function candidateRow(c) {
  const t = c.technical;
  const d = c.dividend;
  return `
    <tr>
      <td class="sym">${c.symbol}</td>
      <td style="color:${scoreColor(c.combinedScore)}"><strong>${c.combinedScore}</strong></td>
      <td>${t.insufficientData ? '—' : `${t.score} <span class="note">(${t.components.trend.note})</span>`}</td>
      <td>${d.insufficientData ? 'sin datos' : `${d.score} <span class="note">(${d.components.yield.note})</span>`}</td>
      <td>${fmt(t.rsi)}</td>
      <td>${d.yieldPct != null ? fmt(d.yieldPct) + '%' : '—'}</td>
      <td>${d.consecutiveGrowthYears ?? '—'}</td>
    </tr>`;
}

// Plain server-rendered HTML — intentionally simple, no build step, no framework.
// Shows *why* a symbol scored the way it did (component notes), not just a number,
// so it stays a research aid rather than a black-box "buy signal".
function renderDashboard(latest) {
  const rows = latest?.candidates?.map(candidateRow).join('') || '';
  const generatedAt = latest?.generatedAt ? new Date(latest.generatedAt).toLocaleString() : 'nunca';
  const failedNote = latest?.failed?.length
    ? `<p class="warn">No se pudo evaluar: ${latest.failed.map(f => f.symbol).join(', ')}</p>` : '';

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Screener de acciones</title>
<style>
  body { font-family: -apple-system, sans-serif; max-width: 900px; margin: 2rem auto; padding: 0 1rem; color: #1f2328; }
  h1 { font-size: 1.4rem; }
  .meta { color: #57606a; font-size: 0.9rem; margin-bottom: 1rem; }
  table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
  th, td { text-align: left; padding: 0.5rem; border-bottom: 1px solid #d0d7de; }
  th { color: #57606a; font-weight: 600; }
  .sym { font-weight: 700; }
  .note { color: #57606a; font-size: 0.8rem; }
  .warn { color: #9a6700; }
  .disclaimer { margin-top: 2rem; padding: 1rem; background: #f6f8fa; border-radius: 6px; font-size: 0.85rem; color: #57606a; }
</style>
</head>
<body>
  <h1>Screener: tendencia técnica + salud de dividendos</h1>
  <p class="meta">Última corrida: ${generatedAt} · como referencia al momento, no en vivo</p>
  ${failedNote}
  <table>
    <thead>
      <tr><th>Símbolo</th><th>Score</th><th>Técnico</th><th>Dividendo</th><th>RSI</th><th>Yield</th><th>Años creciendo</th></tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="disclaimer">
    Esto es una herramienta de <strong>descubrimiento</strong>, no una recomendación de compra.
    Los scores son reglas simples y transparentes (medias móviles, RSI, yield, historial de
    dividendos) — investiga cada candidato antes de decidir. Nada aquí garantiza rendimiento futuro.
  </div>
</body>
</html>`;
}

module.exports = { renderDashboard };
