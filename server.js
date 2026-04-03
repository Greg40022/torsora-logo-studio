'use strict';

const express = require('express');
const fs      = require('fs');
const path    = require('path');

// ── Config ────────────────────────────────────────────────────
const PORT      = process.env.PORT      || 3000;
// .trim() protects against Portainer adding accidental whitespace/quotes in env vars
const AUTH_USER = (process.env.AUTH_USER || 'admin').trim().replace(/^["']|["']$/g, '');
const AUTH_PASS = (process.env.AUTH_PASS || 'changeme').trim().replace(/^["']|["']$/g, '');

const DATA_DIR     = path.join(__dirname, 'data');
const STATE_FILE   = path.join(DATA_DIR, 'state.json');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');
const MAX_HISTORY  = 50;

// ── Ensure data/ directory exists at startup ──────────────────
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// ── Basic Auth middleware ─────────────────────────────────────
function basicAuth(req, res, next) {
  const authHeader = req.headers['authorization'] || '';
  const b64        = (authHeader.startsWith('Basic ') ? authHeader.slice(6) : '').trim();

  // Decode and split only on the FIRST colon (password may contain colons)
  const decoded  = Buffer.from(b64, 'base64').toString('utf8');
  const colonIdx = decoded.indexOf(':');
  const user     = colonIdx >= 0 ? decoded.slice(0, colonIdx) : '';
  const pass     = colonIdx >= 0 ? decoded.slice(colonIdx + 1) : '';

  if (user === AUTH_USER && pass === AUTH_PASS) return next();

  // Log failed attempts (lengths only, no password values)
  if (b64) console.log(`[auth] Failed — user: "${user}"=="${AUTH_USER}"? ${user === AUTH_USER} | pass length: got=${pass.length} expected=${AUTH_PASS.length} | pass chars: ${[...pass].map(c => c.charCodeAt(0)).join(',')}`);

  res.set('WWW-Authenticate', 'Basic realm="TORSORA Logo Studio"');
  res.status(401).send('Authentication required.');
}

// ── Helpers ───────────────────────────────────────────────────
function readJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (_) { return fallback; }
}

function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

// ── Express app ───────────────────────────────────────────────
const app = express();
app.use(basicAuth);
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// GET /api/state — return saved state
app.get('/api/state', (req, res) => {
  const state = readJSON(STATE_FILE, null);
  if (!state) return res.status(404).json({ error: 'No saved state' });
  res.json(state);
});

// POST /api/state — save state + append to history
app.post('/api/state', (req, res) => {
  const incoming = req.body;
  if (!incoming || typeof incoming !== 'object') {
    return res.status(400).json({ error: 'Invalid payload' });
  }

  writeJSON(STATE_FILE, incoming);

  // Append snapshot to history (circular buffer, max 50)
  const history = readJSON(HISTORY_FILE, []);
  history.push({ ts: Date.now(), state: incoming });
  if (history.length > MAX_HISTORY) history.splice(0, history.length - MAX_HISTORY);
  writeJSON(HISTORY_FILE, history);

  res.json({ ok: true });
});

// GET /api/history — return all snapshots
app.get('/api/history', (req, res) => {
  const history = readJSON(HISTORY_FILE, []);
  res.json(history);
});

// Fallback — serve index.html for any unknown route
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// GET /health — no auth required (for Docker healthcheck and monitoring)
app.get('/health', (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`TORSORA Logo Studio listening on port ${PORT}`);
  console.log(`Auth user: "${AUTH_USER}" (${AUTH_USER.length} chars)`);
  console.log(`Auth pass: [${AUTH_PASS.length} chars]`);
});
