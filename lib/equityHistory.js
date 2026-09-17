const fs = require('fs');
const path = require('path');

const HISTORY_FILE = path.join(__dirname, '..', 'data', 'equity-history.json');

// One entry per calendar day the live/paper engine actually ran a cycle.
// This is the track record the graduation gate checks before allowing real
// money — see lib/graduation/graduationGate.js.
function load() {
  try {
    return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function save(history) {
  fs.mkdirSync(path.dirname(HISTORY_FILE), { recursive: true });
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
}

// Idempotent per day — later calls the same day overwrite that day's entry
// with the latest numbers rather than appending duplicates.
function recordDailySnapshot(entry) {
  const history = load();
  const idx = history.findIndex(h => h.date === entry.date);
  if (idx >= 0) history[idx] = entry;
  else history.push(entry);
  save(history);
  return history;
}

module.exports = { load, recordDailySnapshot };
