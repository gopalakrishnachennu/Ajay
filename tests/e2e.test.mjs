import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'campaignos-e2e-'));
process.env.DATA_FILE = path.join(temp, 'db.json');
process.env.ADMIN_EMAIL = 'qa@example.test';
process.env.ADMIN_PASSWORD = 'qa-only-password';
const require = createRequire(import.meta.url);
const { server } = require('../server.js');
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
test.after(async () => {
  await new Promise(resolve => server.close(resolve));
  fs.rmSync(temp, { recursive: true, force: true });
});

async function call(route, method = 'GET', body, cookie) {
  const response = await fetch(base + route, {
    method,
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await response.json() : await response.text();
  return { status: response.status, data, cookie: response.headers.get('set-cookie') };
}

test('form generation, public intake, link tracking and follow-up work together', async () => {
  const publicForm = await call('/api/public/forms/graduate-voter');
  assert.equal(publicForm.status, 200);
  assert.deepEqual(publicForm.data.fields.map(field => field.key), ['status','name','phone','mandal','qualification','graduation']);
  assert.equal(publicForm.data.experience.headlineMain, 'We’ll help you');
  assert.equal(publicForm.data.fields[0].optionLabels.new, 'No, I need help');
  assert.equal(publicForm.data.fields[5].type, 'year');
  assert.equal((await call('/api/public/links/link_main')).data.formId, 'graduate-voter');
  assert.equal((await call('/api/submissions')).status, 401);

  await call('/api/public/links/link_main/events', 'POST', { type: 'view' });
  await call('/api/public/links/link_main/events', 'POST', { type: 'start' });
  const submitted = await call('/api/public/forms/graduate-voter/submissions', 'POST', {
    linkId: 'link_main',
    answers: { status:'registered', name:'QA Person', phone:'9876543210', mandal:'Chevella' }
  });
  assert.equal(submitted.status, 201);
  assert.ok(submitted.data.id);
  const badYear = await call('/api/public/forms/graduate-voter/submissions', 'POST', {
    linkId:'link_main', answers:{status:'new',name:'QA Graduate',phone:'9876543210',mandal:'Chevella',qualification:'B.Tech',graduation:'20ab'}
  });
  assert.equal(badYear.status, 422);

  const login = await call('/api/auth/login', 'POST', { email:'qa@example.test', password:'qa-only-password' });
  assert.equal(login.status, 200);
  const cookie = login.cookie.split(';')[0];
  const analytics = await call('/api/analytics', 'GET', undefined, cookie);
  assert.equal(analytics.data.views, 1);
  assert.equal(analytics.data.starts, 1);
  assert.equal(analytics.data.submissions, 1);
  assert.equal(analytics.data.completionRate, 100);

  const draft = await call('/api/forms', 'POST', {
    name:'QA New Intake', status:'draft', candidate:'Candidate', promoter:'Promoter',
    experience:{ headlineMain:'Hello voter', submitButton:'Send details' },
    fields:[{ key:'name', type:'text', label:'Your name?', help:'Please write your name', placeholder:'Full name', required:true, options:[], when:null }]
  }, cookie);
  assert.equal(draft.status, 201);
  assert.equal(draft.data.form.experience.headlineMain, 'Hello voter');
  assert.equal(draft.data.form.fields[0].help, 'Please write your name');
  const draftLink = await call('/api/links', 'POST', { formId:draft.data.form.id, name:'QA team' }, cookie);
  assert.equal(draftLink.status, 422);
  const published = await call(`/api/forms/${draft.data.form.id}`, 'PATCH', { status:'published' }, cookie);
  assert.equal(published.status, 200);
  const link = await call('/api/links', 'POST', { formId:draft.data.form.id, name:'QA team' }, cookie);
  assert.equal(link.status, 201);
  assert.equal((await call(`/api/public/links/${link.data.link.id}`)).data.formId, draft.data.form.id);
  assert.equal((await call(`/api/public/forms/${draft.data.form.slug}`)).status, 200);
  assert.equal((await call(`/api/public/forms/${draft.data.form.slug}`)).data.experience.submitButton, 'Send details');

  const followUp = await call(`/api/submissions/${submitted.data.id}`, 'PATCH', { followUp:'contacted' }, cookie);
  assert.equal(followUp.status, 200);
  const rows = await call('/api/submissions', 'GET', undefined, cookie);
  assert.equal(rows.data.submissions[0].followUp, 'contacted');
  const formulaAttempt = await call(`/api/public/forms/${draft.data.form.slug}/submissions`, 'POST', {
    linkId:link.data.link.id, answers:{name:'=1+1'}
  });
  assert.equal(formulaAttempt.status, 201);
});

test('released application is two pages and OCR flow stays on the beta route', () => {
  const appSource = fs.readFileSync(path.join(process.cwd(),'dist','app.js'),'utf8');
  const intakeSource = fs.readFileSync(path.join(process.cwd(),'dist','intake-mode.js'),'utf8');
  assert.match(appSource, /apply'\) === 'form18'[\s\S]*intake-mode\.js/);
  assert.match(appSource, /apply'\) === 'form18-beta'[\s\S]*form18-mode\.js/);
  assert.match(intakeSource, /STEP 1 OF 2/);
  assert.match(intakeSource, /STEP 2 OF 2 · FINAL/);
  for (const field of ['Full name','Father\'s name','Gender','Date of birth','MLC constituency','Assembly constituency','District','Email ID']) assert.match(intakeSource,new RegExp(field));
  assert.match(intakeSource,/DOCUMENTS_RECEIVED/);
  assert.doesNotMatch(intakeSource,/ocrDocument|Cloud Vision/);
});
