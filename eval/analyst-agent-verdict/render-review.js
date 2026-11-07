const fs = require('fs');
const cases = JSON.parse(fs.readFileSync(__dirname + '/cases.json', 'utf8'));

let md = '# Casos para el eval del analyst agent\n\n';
md += `${cases.length} casos — ver eval/analyst-agent-verdict/cases.json para el JSON fuente.\n\n`;
md += '## Resumen\n\n| id | esperado | por qué |\n|---|---|---|\n';
for (const c of cases) {
  md += `| ${c.id} | ${c.expected.join(' o ')} | ${c.why} |\n`;
}
md += '\n## Detalle por caso\n\n';
for (const c of cases) {
  md += `### ${c.id}\n\n`;
  md += `**Esperado:** ${c.expected.join(' o ')}  \n**Por qué:** ${c.why}\n\n`;
  md += '```json\n' + JSON.stringify(c.input, null, 2) + '\n```\n\n';
}
fs.writeFileSync(__dirname + '/cases-for-review.md', md);
console.log('wrote', __dirname + '/cases-for-review.md', `(${md.length} bytes)`);
