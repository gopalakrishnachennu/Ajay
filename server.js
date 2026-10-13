const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { URL } = require('node:url');

const root = __dirname;
const dist = path.join(root, 'dist');
const dataFile = process.env.DATA_FILE || path.join(root, 'data', 'db.json');
const port = Number(process.env.PORT || 4173);
const adminEmail = process.env.ADMIN_EMAIL || 'admin@campaignos.local';
const adminPassword = process.env.ADMIN_PASSWORD || 'change-this-password';
const production = process.env.NODE_ENV === 'production';
if (production && (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD || adminPassword === 'change-this-password')) {
  throw new Error('Set ADMIN_EMAIL and a unique ADMIN_PASSWORD before production use');
}

const sessions = new Map();
const id = prefix => `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
const clean = (v, max = 200) => String(v ?? '').trim().slice(0, max);
const now = () => new Date().toISOString();
let queue = Promise.resolve();

function load() {
  if (!fs.existsSync(dataFile)) { fs.mkdirSync(path.dirname(dataFile), { recursive: true }); fs.copyFileSync(path.join(root, 'data', 'seed.json'), dataFile); }
  const db = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
  db.forms ||= [];
  db.links ||= [];
  db.submissions ||= [];
  db.events ||= [];
  db.audit ||= [];
  return db;
}
function transact(callback) {
  const task = queue.then(async () => {
    const db = load();
    const result = await callback(db);
    const tmp = `${dataFile}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2) + '\n', { mode: 0o600 });
    fs.renameSync(tmp, dataFile);
    return result;
  });
  queue = task.catch(() => {});
  return task;
}
function json(res, status, value, extra = {}) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra });
  res.end(JSON.stringify(value));
}
function error(status, message) { const e = new Error(message); e.status = status; throw e; }
function cookies(req) { return Object.fromEntries((req.headers.cookie || '').split(';').map(x => x.trim().split('=')).filter(x => x.length === 2)); }
function user(req) { const token = cookies(req).campaignos_session; const entry = sessions.get(token); return entry && entry.expires > Date.now() ? entry : null; }
function owner(req) { if (!user(req)) error(401, 'Sign in to continue'); }
function sameOrigin(req) {
  const origin = req.headers.origin;
  if (origin && new URL(origin).host !== req.headers.host) error(403, 'Cross-origin write blocked');
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let text = '';
    req.on('data', chunk => { text += chunk; if (text.length > 600_000) { reject(Object.assign(new Error('Request too large'), { status: 413 })); req.destroy(); } });
    req.on('end', () => { try { resolve(text ? JSON.parse(text) : {}); } catch { reject(Object.assign(new Error('Invalid JSON'), { status: 400 })); } });
    req.on('error', reject);
  });
}
function findForm(db, key) { return db.forms.find(f => f.id === key || f.slug === key); }
function uniqueSlug(db, text) {
  const base = clean(text, 70).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'form';
  let slug = base, n = 2;
  while (db.forms.some(f => f.slug === slug)) slug = `${base}-${n++}`;
  return slug;
}
const experienceKeys = ['brandTitle','brandSubtitle','kicker','headlineMain','headlineAccent','candidateLabel','promoterLabel','privacyLabel','headerTrust','helperText','selectPrompt','optionalHint','phoneHint','backButton','continueButton','reviewButton','changeButton','reviewTitle','reviewHint','reviewNotice','submitButton','successKicker','successTitle','successText','receiptLabel','shareButton'];
function validateExperience(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(experienceKeys.map(key => [key, clean(value[key], 220)]).filter(([,value]) => value));
}
function validateTheme(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(['primary','accent','background'].map(key => [key, value[key]]).filter(([,color]) => typeof color === 'string' && /^#[0-9a-fA-F]{6}$/.test(color)));
}
function validatePortrait(value) {
  if (!value) return '';
  if (typeof value !== 'string' || value.length > 220_000 || !/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(value)) error(422, 'Photo must be a small JPG image');
  return value;
}
function validateFields(fields) {
  if (!Array.isArray(fields) || fields.length < 1 || fields.length > 30) error(422, 'Add 1 to 30 questions');
  const keys = new Set();
  const normalized = fields.map((field, index) => {
    const key = clean(field.key, 40).replace(/[^a-zA-Z0-9_]/g, '');
    if (!key || keys.has(key)) error(422, `Question ${index + 1} needs a unique key`);
    keys.add(key);
    const type = clean(field.type, 30);
    if (!['choice', 'text', 'phone', 'year', 'select'].includes(type)) error(422, `Unsupported question type: ${type}`);
    const label = clean(field.label, 160);
    if (!label) error(422, `Question ${index + 1} needs a label`);
    const options = ['choice', 'select'].includes(type) ? (Array.isArray(field.options) ? field.options.map(x => clean(x, 80)).filter(Boolean).slice(0, 30) : []) : [];
    if (['choice', 'select'].includes(type) && options.length < 2) error(422, `${label} needs at least two choices`);
    const optionLabels = Object.fromEntries(options.map(value => [value, clean(field.optionLabels?.[value], 100) || value]));
    return { key, type, label, help: clean(field.help, 220), placeholder: clean(field.placeholder, 100), required: Boolean(field.required), options, optionLabels, when: field.when === 'new' || field.when === 'registered' ? field.when : null, autocomplete: field.autocomplete === 'name' || field.autocomplete === 'tel-national' ? field.autocomplete : null };
  });
  if (normalized.some(f => f.when) && !normalized.some(f => f.key === 'status' && f.type === 'choice' && f.options.includes('registered') && f.options.includes('new'))) error(422, 'Conditional questions require a registered/new status choice');
  return normalized;
}
function validateSubmission(form, raw) {
  const answers = {};
  const incoming = raw.answers && typeof raw.answers === 'object' ? raw.answers : {};
  const status = clean(incoming.status, 30);
  for (const field of form.fields) {
    if (field.when && field.when !== status) continue;
    let value = clean(incoming[field.key], 500);
    if (field.required && !value) error(422, `${field.label} is required`);
    if (value && ['choice', 'select'].includes(field.type) && !field.options.includes(value)) error(422, `${field.label} has an invalid selection`);
    if (value && field.type === 'phone') {
      value = value.replace(/\D/g, '');
      if (value.length === 12 && value.startsWith('91')) value = value.slice(2);
      if (!/^[6-9]\d{9}$/.test(value)) error(422, 'Enter a valid 10-digit Indian mobile number');
    }
    if (value && field.type === 'year' && !/^(19|20)\d{2}$/.test(value)) error(422, 'Enter a 4-digit graduation year');
    answers[field.key] = value;
  }
  return answers;
}
function formSummary(db, form) {
  const submissions = db.submissions.filter(s => s.formId === form.id);
  const links = db.links.filter(l => l.formId === form.id);
  return { ...form, submissions: submissions.length, views: links.reduce((n, l) => n + l.views, 0), starts: links.reduce((n, l) => n + l.starts, 0), shares: links.reduce((n, l) => n + l.shares, 0), links: links.length };
}
function metrics(db, formId) {
  const forms = formId ? db.forms.filter(f => f.id === formId) : db.forms;
  const ids = new Set(forms.map(f => f.id));
  const links = db.links.filter(l => ids.has(l.formId));
  const subs = db.submissions.filter(s => ids.has(s.formId));
  const events = db.events.filter(e => ids.has(e.formId));
  const views = links.reduce((n, l) => n + l.views, 0);
  const starts = links.reduce((n, l) => n + l.starts, 0);
  const shares = links.reduce((n, l) => n + l.shares, 0);
  const byDay = {};
  for (const event of events) { const day = event.at.slice(0, 10); byDay[day] ||= { views: 0, starts: 0, submissions: 0 }; if (event.type === 'view') byDay[day].views++; if (event.type === 'start') byDay[day].starts++; if (event.type === 'submit') byDay[day].submissions++; }
  const mandals = {};
  for (const row of subs) { const mandal = row.answers.mandal || 'Other'; mandals[mandal] = (mandals[mandal] || 0) + 1; }
  return { forms: forms.length, links: links.length, unopenedLinks: links.filter(l => !l.views).length, views, starts, shares, submissions: subs.length, registered: subs.filter(s => s.answers.status === 'registered').length, needsSupport: subs.filter(s => s.answers.status === 'new').length, completionRate: starts ? Math.round(subs.length / starts * 100) : 0, byDay, mandals, recent: subs.slice(0, 8) };
}
function audit(db, action, detail) { db.audit.unshift({ id: id('audit'), action, detail, at: now() }); db.audit = db.audit.slice(0, 1000); }

async function api(req, res, url) {
  const bits = url.pathname.split('/').filter(Boolean);
  const method = req.method;
  if (method === 'GET' && url.pathname === '/api/health') return json(res, 200, { ok: true, storage: 'file' });
  if (method !== 'GET') sameOrigin(req);
  if (method === 'POST' && url.pathname === '/api/auth/login') {
    const input = await readBody(req);
    const pass = Buffer.from(clean(input.password, 200)); const expected = Buffer.from(adminPassword);
    if (input.email !== adminEmail || pass.length !== expected.length || !crypto.timingSafeEqual(pass, expected)) error(401, 'Incorrect email or password');
    const token = crypto.randomBytes(32).toString('hex'); sessions.set(token, { email: adminEmail, expires: Date.now() + 86400000 });
    await transact(db => audit(db, 'admin.login', { email: adminEmail }));
    return json(res, 200, { email: adminEmail }, { 'set-cookie': `campaignos_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400${production ? '; Secure' : ''}` });
  }
  if (method === 'POST' && url.pathname === '/api/auth/logout') { sessions.delete(cookies(req).campaignos_session); return json(res, 200, { ok: true }, { 'set-cookie': 'campaignos_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' }); }
  if (method === 'GET' && url.pathname === '/api/me') { owner(req); return json(res, 200, { email: adminEmail }); }
  if (method === 'GET' && bits[1] === 'public' && bits[2] === 'forms' && bits.length === 4) {
    const db = load(); const form = findForm(db, bits[3]); if (!form || form.status !== 'published') error(404, 'Form unavailable');
    return json(res, 200, { id: form.id, slug: form.slug, name: form.name, description: form.description, candidate: form.candidate, promoter: form.promoter, candidateImage: form.candidateImage || '', promoterImage: form.promoterImage || '', theme: form.theme || {}, experience: form.experience || {}, fields: form.fields });
  }
  if (method === 'GET' && bits[1] === 'public' && bits[2] === 'links' && bits.length === 4) {
    const db = load(); const link = db.links.find(l => l.id === bits[3]);
    const form = link && findForm(db, link.formId);
    if (!link || form?.status !== 'published') error(404, 'Link unavailable');
    return json(res, 200, { id: link.id, formId: link.formId });
  }
  if (method === 'POST' && bits[1] === 'public' && bits[2] === 'links' && bits.length === 5 && bits[4] === 'events') {
    const type = clean((await readBody(req)).type, 20);
    if (!['view', 'start', 'share'].includes(type)) error(422, 'Invalid event');
    await transact(db => { const link = db.links.find(l => l.id === bits[3]); if (!link) error(404, 'Link not found'); const form = findForm(db, link.formId); if (form?.status !== 'published') error(404, 'Form unavailable'); link[`${type}s`]++; db.events.unshift({ id: id('event'), formId: form.id, linkId: link.id, type, at: now() }); db.events = db.events.slice(0, 20_000); });
    return json(res, 202, { ok: true });
  }
  if (method === 'POST' && bits[1] === 'public' && bits[2] === 'forms' && bits.length === 5 && bits[4] === 'submissions') {
    const input = await readBody(req);
    const result = await transact(db => {
      const form = findForm(db, bits[3]); if (!form || form.status !== 'published') error(404, 'Form unavailable');
      const link = db.links.find(l => l.id === input.linkId && l.formId === form.id); if (!link) error(422, 'Open a valid form link');
      const answers = validateSubmission(form, input);
      const row = { id: id('submission'), formId: form.id, linkId: link.id, answers, followUp: 'pending', note: '', createdAt: now(), updatedAt: now() };
      db.submissions.unshift(row); db.events.unshift({ id: id('event'), formId: form.id, linkId: link.id, type: 'submit', at: now() }); audit(db, 'submission.created', { submissionId: row.id, formId: form.id });
      return { id: row.id };
    });
    return json(res, 201, result);
  }
  owner(req);
  if (method === 'GET' && url.pathname === '/api/forms') { const db = load(); return json(res, 200, { forms: db.forms.map(f => formSummary(db, f)) }); }
  if (method === 'POST' && url.pathname === '/api/forms') {
    const input = await readBody(req);
    const form = await transact(db => { const name = clean(input.name, 120); if (!name) error(422, 'Form name is required'); if (!['draft', 'published'].includes(input.status || 'draft')) error(422, 'Invalid form status'); const record = { id: id('form'), slug: uniqueSlug(db, name), name, description: clean(input.description, 300), status: input.status || 'draft', candidate: clean(input.candidate, 120), promoter: clean(input.promoter, 120), candidateImage: validatePortrait(input.candidateImage), promoterImage: validatePortrait(input.promoterImage), theme: validateTheme(input.theme), experience: validateExperience(input.experience), fields: validateFields(input.fields), createdAt: now(), updatedAt: now() }; db.forms.unshift(record); audit(db, 'form.created', { formId: record.id }); return record; });
    return json(res, 201, { form });
  }
  if (bits[1] === 'forms' && bits.length === 3 && method === 'PATCH') {
    const input = await readBody(req);
    const form = await transact(db => { const form = findForm(db, bits[2]); if (!form) error(404, 'Form not found'); for (const key of ['name', 'description', 'candidate', 'promoter']) if (input[key] !== undefined) form[key] = clean(input[key], key === 'description' ? 300 : 120); if (input.candidateImage !== undefined) form.candidateImage = validatePortrait(input.candidateImage); if (input.promoterImage !== undefined) form.promoterImage = validatePortrait(input.promoterImage); if (input.theme !== undefined) form.theme = validateTheme(input.theme); if (input.experience !== undefined) form.experience = validateExperience(input.experience); if (input.fields) form.fields = validateFields(input.fields); if (input.status !== undefined) { if (!['draft', 'published'].includes(input.status)) error(422, 'Invalid form status'); form.status = input.status; } form.updatedAt = now(); audit(db, 'form.updated', { formId: form.id }); return form; });
    return json(res, 200, { form });
  }
  if (method === 'GET' && url.pathname === '/api/links') { const db = load(); return json(res, 200, { links: db.links.map(l => ({ ...l, formName: findForm(db, l.formId)?.name || '' })) }); }
  if (method === 'POST' && url.pathname === '/api/links') {
    const input = await readBody(req);
    const link = await transact(db => { const form = findForm(db, clean(input.formId)); if (!form || form.status !== 'published') error(422, 'Publish the form before creating a link'); const record = { id: id('link'), formId: form.id, name: clean(input.name, 80) || 'Main link', views: 0, starts: 0, shares: 0, createdAt: now() }; db.links.unshift(record); audit(db, 'link.created', { linkId: record.id, formId: form.id }); return record; });
    return json(res, 201, { link });
  }
  if (method === 'GET' && url.pathname === '/api/submissions') { const db = load(); let rows = db.submissions; const formId = url.searchParams.get('formId'); const status = url.searchParams.get('status'); const q = clean(url.searchParams.get('q'), 100).toLowerCase(); if (formId) rows = rows.filter(s => s.formId === formId); if (status) rows = rows.filter(s => s.answers.status === status); if (q) rows = rows.filter(s => Object.values(s.answers).some(v => String(v).toLowerCase().includes(q))); return json(res, 200, { submissions: rows, total: rows.length }); }
  if (method === 'PATCH' && bits[1] === 'submissions' && bits.length === 3) { const input = await readBody(req); const row = await transact(db => { const row = db.submissions.find(s => s.id === bits[2]); if (!row) error(404, 'Submission not found'); if (input.followUp !== undefined) { if (!['pending', 'contacted', 'complete'].includes(input.followUp)) error(422, 'Invalid follow-up status'); row.followUp = input.followUp; } if (input.note !== undefined) row.note = clean(input.note, 500); row.updatedAt = now(); audit(db, 'submission.updated', { submissionId: row.id, followUp: row.followUp }); return row; }); return json(res, 200, { submission: row }); }
  if (method === 'GET' && url.pathname === '/api/analytics') { const db = load(); return json(res, 200, metrics(db, url.searchParams.get('formId'))); }
  if (method === 'GET' && url.pathname === '/api/audit') { const db = load(); return json(res, 200, { audit: db.audit.slice(0, 100) }); }
  error(404, 'Endpoint not found');
}

function staticFile(req, res, url) {
  const pathname = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
  const target = path.resolve(dist, `.${pathname}`);
  if (!target.startsWith(dist + path.sep)) error(403, 'Forbidden');
  fs.readFile(target, (e, data) => {
    if (e) return json(res, 404, { error: 'File not found' });
    const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.jpg': 'image/jpeg', '.png': 'image/png' };
    res.writeHead(200, { 'content-type': types[path.extname(target)] || 'application/octet-stream', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }); res.end(data);
  });
}
const server = http.createServer(async (req, res) => { try { const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`); if (url.pathname.startsWith('/api/')) await api(req, res, url); else if (req.method === 'GET') staticFile(req, res, url); else error(405, 'Method not allowed'); } catch (e) { if (!res.headersSent) json(res, e.status || 500, { error: e.status ? e.message : 'Server error' }); if (!e.status) console.error(e); } });
if (require.main === module) server.listen(port, () => console.log(`CampaignOS running at http://127.0.0.1:${port}`));
module.exports = { server, load, validateSubmission };
