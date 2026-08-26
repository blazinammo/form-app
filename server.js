const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const fs = require('node:fs/promises');
const path = require('node:path');
const { normalizeForm, validateForm } = require('./lib/schema');

const app = express();
const port = Number(process.env.PORT || 3000);
const dataDir = process.env.DATA_DIR || path.join(__dirname, 'data');
const dataFile = path.join(dataDir, 'form-state.json');
const initialForm = normalizeForm({ formTitle: 'Welcome to FormFlow', pages: [{ title: 'Start here', description: 'Create your first published form.', questions: [] }] });

if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '8mb' }));
app.use(session({
  name: 'formflow.sid',
  secret: process.env.SESSION_SECRET || 'local-development-only-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 8 * 60 * 60 * 1000 }
}));
app.use(express.static(path.join(__dirname, 'public')));

async function readState() {
  try { return JSON.parse(await fs.readFile(dataFile, 'utf8')); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const state = { draft: initialForm, published: null, publishedAt: null, version: 0 };
    await writeState(state);
    return state;
  }
}
async function writeState(state) {
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(dataFile, JSON.stringify(state, null, 2));
}
function adminOnly(req, res, next) { return req.session.isAdmin ? next() : res.status(401).json({ error: 'Authentication required.' }); }
function credentialsConfigured() { return Boolean(process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD); }

app.get('/api/auth/session', (req, res) => res.json({ authenticated: Boolean(req.session.isAdmin), configured: credentialsConfigured() }));
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!credentialsConfigured()) return res.status(503).json({ error: 'Admin credentials are not configured on the server.' });
  if (username !== process.env.ADMIN_USERNAME || password !== process.env.ADMIN_PASSWORD) return res.status(401).json({ error: 'Invalid username or password.' });
  req.session.isAdmin = true;
  res.json({ authenticated: true });
});
app.post('/api/auth/logout', (req, res) => req.session.destroy(() => res.json({ authenticated: false })));

app.get('/api/admin/form', adminOnly, async (req, res, next) => { try { res.json(await readState()); } catch (error) { next(error); } });
app.put('/api/admin/draft', adminOnly, async (req, res, next) => {
  try {
    const result = validateForm(req.body);
    if (!result.valid) return res.status(400).json({ error: 'Draft is invalid.', errors: result.errors });
    const state = await readState(); state.draft = result.form; await writeState(state); res.json({ draft: state.draft });
  } catch (error) { next(error); }
});
app.post('/api/admin/publish', adminOnly, async (req, res, next) => {
  try {
    const state = await readState();
    const result = validateForm(state.draft);
    if (!result.valid) return res.status(400).json({ error: 'Publish blocked until the draft is valid.', errors: result.errors });
    state.draft = result.form; state.published = result.form; state.version += 1; state.publishedAt = new Date().toISOString();
    await writeState(state); res.json({ published: state.published, publishedAt: state.publishedAt, version: state.version });
  } catch (error) { next(error); }
});
app.get('/api/public/form', async (req, res, next) => {
  try {
    const state = await readState();
    if (!state.published) return res.status(404).json({ error: 'No form has been published yet.' });
    res.json({ form: state.published, publishedAt: state.publishedAt, version: state.version });
  } catch (error) { next(error); }
});

app.use((error, req, res, next) => { console.error(error); res.status(500).json({ error: 'The server could not complete that request.' }); });
if (require.main === module) app.listen(port, () => console.log(`FormFlow listening on port ${port}`));
module.exports = { app, readState, writeState };
