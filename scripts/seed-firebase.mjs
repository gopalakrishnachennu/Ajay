import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const local = JSON.parse(fs.readFileSync(path.join(root, 'data', 'seed.json'), 'utf8'));
const project = 'ajaychevula-d2a22';
const base = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents`;
const token = execFileSync('gcloud', ['auth', 'print-access-token'], { encoding: 'utf8' }).trim();
const headers = { authorization: `Bearer ${token}`, 'x-goog-user-project': project, 'content-type': 'application/json' };
function encode(value) {
  if (value === null) return { nullValue: null };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') return { integerValue: String(value) };
  if (typeof value === 'string') return { stringValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encode) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, val]) => [key, encode(val)])) } };
}
async function seed(collection, name, value) {
  const url = `${base}/${collection}/${encodeURIComponent(name)}`;
  const existing = await fetch(url, { headers });
  if (existing.ok) { console.log(`${collection}/${name}: already present`); return; }
  if (existing.status !== 404) throw new Error(`Could not check ${collection}/${name}: ${existing.status} ${await existing.text()}`);
  const response = await fetch(url, { method: 'PATCH', headers, body: JSON.stringify({ fields: Object.fromEntries(Object.entries(value).map(([key, val]) => [key, encode(val)])) }) });
  if (!response.ok) throw new Error(`Could not create ${collection}/${name}: ${response.status} ${await response.text()}`);
  console.log(`${collection}/${name}: created`);
}
for (const form of local.forms) await seed('forms', form.id, form);
for (const link of local.links) await seed('links', link.id, { formId: link.formId, name: link.name, createdAt: link.createdAt });
