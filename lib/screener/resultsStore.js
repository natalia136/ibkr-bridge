const fs = require('fs');
const path = require('path');

const BACKEND = process.env.RESULTS_STORE || 'file'; // 'file' (default, local/dev) | 'firestore' (GCP)
const RESULTS_DIR = path.join(__dirname, '..', '..', 'data', 'screener-results');

// --- file backend (default) ---
// Fine for local dev and for a single Cloud Run instance's own disk, but Cloud Run
// instances are ephemeral/stateless — for a real GCP deployment across restarts
// and multiple instances, set RESULTS_STORE=firestore (see README).
const fileBackend = {
  async saveRun(runId, payload) {
    fs.mkdirSync(RESULTS_DIR, { recursive: true });
    const data = JSON.stringify({ runId, ...payload }, null, 2);
    fs.writeFileSync(path.join(RESULTS_DIR, `${runId}.json`), data);
    fs.writeFileSync(path.join(RESULTS_DIR, 'latest.json'), data);
  },
  async getLatest() {
    try {
      return JSON.parse(fs.readFileSync(path.join(RESULTS_DIR, 'latest.json'), 'utf8'));
    } catch {
      return null;
    }
  },
  async listRuns() {
    try {
      return fs.readdirSync(RESULTS_DIR)
        .filter(f => f.endsWith('.json') && f !== 'latest.json')
        .map(f => f.replace(/\.json$/, ''))
        .sort()
        .reverse();
    } catch {
      return [];
    }
  },
};

// --- firestore backend (GCP) ---
// Lazily required so the `file` backend (and all local/dev/testing) never needs
// @google-cloud/firestore installed-and-authenticated to work.
let firestoreClient = null;
function getFirestore() {
  if (!firestoreClient) {
    const { Firestore } = require('@google-cloud/firestore');
    firestoreClient = new Firestore(); // uses Application Default Credentials on Cloud Run
  }
  return firestoreClient;
}

const firestoreBackend = {
  async saveRun(runId, payload) {
    const db = getFirestore();
    await db.collection('screenerRuns').doc(runId).set({ runId, ...payload });
    await db.collection('screenerMeta').doc('latest').set({ runId, ...payload });
  },
  async getLatest() {
    const db = getFirestore();
    const doc = await db.collection('screenerMeta').doc('latest').get();
    return doc.exists ? doc.data() : null;
  },
  async listRuns() {
    const db = getFirestore();
    const snap = await db.collection('screenerRuns').orderBy('runId', 'desc').limit(50).get();
    return snap.docs.map(d => d.id);
  },
};

const backend = BACKEND === 'firestore' ? firestoreBackend : fileBackend;

module.exports = {
  saveRun: backend.saveRun,
  getLatest: backend.getLatest,
  listRuns: backend.listRuns,
  activeBackend: BACKEND,
};
