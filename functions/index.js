const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const vision = require('@google-cloud/vision');

initializeApp();
const db = getFirestore();
const visionClient = new vision.ImageAnnotatorClient();
const allowedTypes = new Set(['aadhaar_front','aadhaar_back','voter_id','degree','photo']);

const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
const score = (value, source, confidence = .72) => value ? { value:clean(value), source, confidence, confirmed:false } : null;
const pick = (text, patterns) => {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return clean(match[1]);
  }
  return '';
};
const toIsoDate = value => {
  const match = clean(value).match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  return match ? `${match[3]}-${match[2].padStart(2,'0')}-${match[1].padStart(2,'0')}` : '';
};
const dateValue = text => toIsoDate(pick(text, [/(?:DOB|Date of Birth|Birth)[\s:]*(\d{1,2}[\/-]\d{1,2}[\/-]\d{4})/i, /(\d{1,2}[\/-]\d{1,2}[\/-]\d{4})/]));
const yearValue = text => pick(text, [/(?:Year of Passing|Passed|Passing Year|Awarded)[\s:\-]*(?:in\s+)?((?:19|20)\d{2})/i, /\b((?:19|20)\d{2})\b/]);
const probableName = text => {
  const lines = text.split(/\r?\n/).map(clean).filter(Boolean);
  const ignored = /government|india|aadhaar|unique|identity|voter|election|certificate|university|male|female|dob|year|address/i;
  return lines.find(line => /^[A-Za-z][A-Za-z .'-]{3,60}$/.test(line) && !ignored.test(line)) || '';
};
function parseAadhaar(text, source) {
  const gender = /\bFEMALE\b/i.test(text) ? 'Female' : /\bMALE\b/i.test(text) ? 'Male' : /\bTRANSGENDER\b/i.test(text) ? 'Third gender' : '';
  const aadhaar = text.match(/\b(\d{4})[ -]?(\d{4})[ -]?(\d{4})\b/);
  const pincode = pick(text, [/\bPIN(?:CODE)?[\s:\-]*(\d{6})\b/i, /\b(\d{6})\b/]);
  const address = pick(text, [/(?:Address|To)[\s:\-]*([\s\S]{15,240}?)(?:\n\s*\d{4}[ -]?\d{4}[ -]?\d{4}|$)/i]);
  const relative = pick(text, [/(?:S\/O|D\/O|W\/O|C\/O|Son of|Daughter of|Wife of|Care of)[\s:\-]*([^,\n]{3,70})/i]);
  const relationType = /(?:W\/O|Wife of)/i.test(text) ? 'Husband' : /(?:D\/O|Daughter of|S\/O|Son of)/i.test(text) ? 'Father' : /(?:C\/O|Care of)/i.test(text) ? 'Guardian' : '';
  const houseNumber = pick(address || text, [/(?:House|H\.?\s*No\.?|Door|D\.?\s*No\.?)\s*[:#-]?\s*([^,\n]{1,35})/i]);
  const street = pick(address || text, [/(?:Street|Road|Lane|Colony|Area|Locality)\s*[:#-]?\s*([^,\n]{2,70})/i]);
  const town = pick(address || text, [/(?:VTC|Village|Town|City)\s*[:#-]?\s*([^,\n]{2,60})/i]);
  const postOffice = pick(address || text, [/(?:Post Office|P\.?O\.?)\s*[:#-]?\s*([^,\n]{2,60})/i]);
  const mandal = pick(address || text, [/(?:Mandal|Tehsil|Taluk|Taluka)\s*[:#-]?\s*([^,\n]{2,60})/i]);
  const district = pick(address || text, [/(?:District|Dist\.?)\s*[:#-]?\s*([^,\n]{2,60})/i]);
  const state = pick(address || text, [/(?:State)\s*[:#-]?\s*([^,\n\d]{2,40})/i]) || (/Telangana/i.test(address || text) ? 'Telangana' : '');
  const fields = {
    fullName: score(probableName(text), source, .66), dob: score(dateValue(text), source, .82), sex: score(gender, source, .9),
    relativeName:score(relative,source,.7), relationType:score(relationType,source,.72),
    houseNumber:score(houseNumber,source,.7), street:score(street,source,.64), town:score(town,source,.72),
    postOffice:score(postOffice,source,.72), mandal:score(mandal,source,.74), district:score(district,source,.78), state:score(state,source,.82),
    pincode: score(pincode, source, .83), addressRaw: score(address, source, .58),
    aadhaarNumber: score(aadhaar ? `${aadhaar[1]}${aadhaar[2]}${aadhaar[3]}` : '', source, .96), aadhaarProvided: score(aadhaar ? 'Yes' : '', source, .96)
  };
  return Object.fromEntries(Object.entries(fields).filter(([,value]) => value));
}
function parseVoter(text, source) {
  const epic = pick(text, [/\b([A-Z]{3}\d{7})\b/i, /(?:EPIC|ID)[\s:\-]*([A-Z0-9]{8,12})/i]).toUpperCase();
  const name = pick(text, [/(?:Elector'?s? Name|Name)[\s:\-]*([^\n]{3,70})/i]) || probableName(text);
  const relative = pick(text, [/(?:Father'?s?|Mother'?s?|Husband'?s?|Relative'?s?) Name[\s:\-]*([^\n]{3,70})/i]);
  const relation = /husband/i.test(text) ? 'Husband' : /mother/i.test(text) ? 'Mother' : /father/i.test(text) ? 'Father' : '';
  const gender = /\bFEMALE\b/i.test(text) ? 'Female' : /\bMALE\b/i.test(text) ? 'Male' : '';
  const fields = { fullName:score(name,source,.72), relativeName:score(relative,source,.78), relationType:score(relation,source,.82), sex:score(gender,source,.9), dob:score(dateValue(text),source,.8), epicNumber:score(epic,source,.94) };
  return Object.fromEntries(Object.entries(fields).filter(([,value]) => value));
}
function parseDegree(text, source) {
  const university = pick(text, [/([A-Z][A-Za-z .,&'-]{3,80}(?:University|UNIVERSITY))/i, /(?:University|Institution)[\s:\-]*([^\n]{3,100})/i]);
  const qualification = pick(text, [/(Bachelor of [^\n,]{3,70}|Master of [^\n,]{3,70}|B\.?\s?(?:Tech|Sc|Com|A|E)\.?|M\.?\s?(?:Tech|Sc|Com|A|E)\.?)/i, /(?:Degree|Qualification|Programme)[\s:\-]*([^\n]{2,80})/i]);
  const name = pick(text, [/(?:certify that|awarded to|conferred on|student name)[\s:\-]*([A-Za-z][A-Za-z .'-]{3,80})/i]);
  const passingDate = toIsoDate(pick(text,[/(?:Date of Passing|Date of Award|Awarded on|Dated)[\s:\-]*(\d{1,2}[\/-]\d{1,2}[\/-]\d{4})/i]));
  const fields = { fullName:score(name,source,.64), qualification:score(qualification,source,.76), university:score(university,source,.78), passingYear:score(yearValue(text),source,.7), passingDate:score(passingDate,source,.7) };
  return Object.fromEntries(Object.entries(fields).filter(([,value]) => value));
}
function extractFields(text, type) {
  if (type.startsWith('aadhaar_')) return parseAadhaar(text, type);
  if (type === 'voter_id') return parseVoter(text, type);
  if (type === 'degree') return parseDegree(text, type);
  return {};
}
async function readText(uri, mimeType) {
  if (mimeType === 'application/pdf') {
    const [result] = await visionClient.batchAnnotateFiles({ requests:[{ inputConfig:{ gcsSource:{ uri }, mimeType }, features:[{ type:'DOCUMENT_TEXT_DETECTION' }], pages:[1,2,3,4,5] }] });
    return (result.responses?.[0]?.responses || []).map(page => page.fullTextAnnotation?.text || '').join('\n');
  }
  const [result] = await visionClient.documentTextDetection({ image:{ source:{ imageUri:uri } }, imageContext:{ languageHints:['en','te'] } });
  return result.fullTextAnnotation?.text || result.textAnnotations?.[0]?.description || '';
}

exports.ocrDocument = onCall({ region:'us-east1', memory:'512MiB', timeoutSeconds:120, maxInstances:5 }, async request => {
  if (!request.auth) throw new HttpsError('unauthenticated','A secure application session is required.');
  const applicationId = clean(request.data?.applicationId);
  const documentType = clean(request.data?.documentType);
  const storagePath = clean(request.data?.storagePath);
  const mimeType = clean(request.data?.mimeType);
  if (!applicationId || !allowedTypes.has(documentType) || !storagePath || !['image/jpeg','image/png','image/webp','application/pdf'].includes(mimeType)) throw new HttpsError('invalid-argument','Invalid document request.');
  if (!storagePath.startsWith(`applications/${request.auth.uid}/${applicationId}/${documentType}/`)) throw new HttpsError('permission-denied','Document path does not belong to this application.');
  const appRef = db.doc(`applications/${applicationId}`);
  const docRef = appRef.collection('documents').doc(documentType);
  const appSnap = await appRef.get();
  if (!appSnap.exists || appSnap.data().ownerUid !== request.auth.uid) throw new HttpsError('permission-denied','Application not found.');
  await docRef.set({ extractionStatus:'processing', extractionStartedAt:FieldValue.serverTimestamp() }, { merge:true });
  try {
    const uri = `gs://${process.env.GCLOUD_PROJECT}.firebasestorage.app/${storagePath}`;
    const rawText = await readText(uri, mimeType);
    if (!clean(rawText)) throw new Error('No readable text was found');
    const fields = extractFields(rawText, documentType);
    await db.runTransaction(async transaction => {
      const latest = await transaction.get(appRef);
      const data = latest.data();
      const confirmed = data.confirmedFields || {};
      const merged = { ...(data.extractedFields || {}) };
      const conflicts = { ...(data.fieldConflicts || {}) };
      for (const [key,value] of Object.entries(fields)) {
        if (confirmed[key]) continue;
        const existing = merged[key];
        const sameValue = existing && clean(existing.value).toLowerCase() === clean(value.value).toLowerCase();
        if (!existing || (value.confidence || 0) > (existing.confidence || 0)) merged[key] = value;
        if (existing && !sameValue) {
          const choices = [...(conflicts[key] || []), existing, value];
          conflicts[key] = choices.filter((choice,index,array) => array.findIndex(item => clean(item.value).toLowerCase() === clean(choice.value).toLowerCase()) === index).slice(-4);
        }
      }
      transaction.set(appRef, { extractedFields:merged, fieldConflicts:conflicts, status:'NEEDS_REVIEW', updatedAt:FieldValue.serverTimestamp() }, { merge:true });
      transaction.set(docRef, { extractionStatus:'complete', extractedFieldCount:Object.keys(fields).length, extractionCompletedAt:FieldValue.serverTimestamp() }, { merge:true });
    });
    return { fields, fieldCount:Object.keys(fields).length };
  } catch (error) {
    console.error('OCR failed', { applicationId, documentType, message:error.message });
    await docRef.set({ extractionStatus:'failed', extractionError:'OCR could not read this file. You can retry or enter the details manually.', extractionCompletedAt:FieldValue.serverTimestamp() }, { merge:true });
    throw new HttpsError('internal','OCR could not read this file. You can retry or enter the details manually.');
  }
});
