import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const seed = JSON.parse(fs.readFileSync(path.join(root, 'data', 'seed.json'), 'utf8'));
const form = seed.forms.find(item => item.id === 'graduate-voter');
if (!form) throw new Error('The graduate-voter template is missing');

const project = 'ajaychevula-d2a22';
const base = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/forms/${form.id}`;
const token = execFileSync('gcloud', ['auth', 'print-access-token'], { encoding: 'utf8' }).trim();
const headers = { authorization: `Bearer ${token}`, 'x-goog-user-project': project, 'content-type': 'application/json' };
const encode = value => {
  if (value === null) return { nullValue: null };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'string') return { stringValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encode) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encode(item)])) } };
};

const existing = await fetch(base, { headers });
if (!existing.ok) throw new Error(`Could not read the live template: HTTP ${existing.status}`);
const url = `${base}?updateMask.fieldPaths=fields&updateMask.fieldPaths=experience&updateMask.fieldPaths=theme&updateMask.fieldPaths=updatedAt`;
const response = await fetch(url, {
  method: 'PATCH',
  headers,
  body: JSON.stringify({ fields: { fields: encode(form.fields), experience: encode(form.experience), theme: encode(form.theme), updatedAt: encode(new Date().toISOString()) } })
});
if (!response.ok) throw new Error(`Could not update the live template: HTTP ${response.status} ${await response.text()}`);
console.log('Live graduate-voter questions, wording, and theme updated; submissions and distribution links were preserved.');
