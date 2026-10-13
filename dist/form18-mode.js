import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc, updateDoc, collection, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { getStorage, ref, uploadBytesResumable, getBlob, uploadBytes } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-storage.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-functions.js';
import { defaultConfig, form18Fields, requiredKeys, schemaVersion, applyReferenceMappings } from './form18-schema.js?v=20261013f';
import { buildForm18Pdf } from './form18-pdf.js?v=20261013f';

const firebase = initializeApp({
  apiKey:'AIzaSyDqa90otd4FEnYIys2dCV-zwtesCNxhzqI', authDomain:'ajaychevula-d2a22.firebaseapp.com',
  projectId:'ajaychevula-d2a22', storageBucket:'ajaychevula-d2a22.firebasestorage.app', appId:'1:396367674243:web:bceb0a4c279959c29b94b6'
});
const auth = getAuth(firebase), db = getFirestore(firebase), storage = getStorage(firebase), functions = getFunctions(firebase,'us-east1');
const ocrDocument = httpsCallable(functions,'ocrDocument');
const root = document.getElementById('app');
const html = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const state = { stage:'phone', applicationId:'', app:null, documents:{}, config:defaultConfig, values:{ state:'Telangana' }, extractedRecords:{}, fieldConflicts:{}, errors:{}, busy:false };
const appKey = 'campaignos.form18.application';
const linkId = new URLSearchParams(location.search).get('link') || 'link_main';
const currentUser = () => auth.currentUser;

function shell(content, step = 1) {
  const progress = Math.max(10, Math.min(100, Math.round(step / 3 * 100)));
  return `<div class="smart-shell"><div class="smart-progress"><span style="width:${progress}%"></span></div><header class="smart-header"><a href="/?form=graduate-voter&link=${encodeURIComponent(linkId)}" class="smart-brand">✦ <span>Graduate voter help<small>Secure Form 18 preparation</small></span></a><span class="smart-private">PRIVATE APPLICATION</span></header><main class="smart-main">${content}</main></div>`;
}
function setError(message='') { const target = document.getElementById('smartError'); if (target) target.textContent = message; }
function phoneScreen() {
  root.innerHTML = shell(`<section class="smart-card smart-welcome"><div class="smart-kicker">FORM 18 · GRADUATE VOTER</div><h1>${html(state.config.title)}</h1><p>${html(state.config.subtitle)}</p><div class="smart-promise"><span>01</span><b>No OTP</b><small>Enter your mobile number and continue.</small></div><form id="phoneForm"><label class="smart-label">Mobile number<div class="smart-phone"><span>+91</span><input id="mobile" type="tel" inputmode="numeric" autocomplete="tel-national" maxlength="10" placeholder="10-digit mobile number" required></div></label><label class="smart-consent"><input id="consent" type="checkbox" required><span>${html(state.config.consent)}</span></label><p class="smart-privacy">${html(state.config.privacyNote)}</p><p id="smartError" class="form-error"></p><button class="button button-primary smart-next" type="submit">Start secure application →</button></form></section>`,1);
  document.getElementById('phoneForm').onsubmit = startApplication;
}
async function startApplication(event) {
  event.preventDefault(); setError();
  const mobile = document.getElementById('mobile').value.replace(/\D/g,'').slice(-10);
  if (!/^[6-9]\d{9}$/.test(mobile)) return setError('Enter a valid 10-digit Indian mobile number.');
  if (!document.getElementById('consent').checked) return setError('Please agree before continuing.');
  try {
    state.busy = true; event.submitter.disabled = true; event.submitter.textContent = 'Creating your application…';
    if (!currentUser()) await signInAnonymously(auth);
    const appRef = doc(collection(db,'applications'));
    state.applicationId = appRef.id;
    state.values.mobile = mobile;
    const record = { ownerUid:currentUser().uid, formId:'graduate-voter', linkId, schemaVersion, status:'DRAFT', mobile, consentVersion:'2026-10-13-full-aadhaar', consentAccepted:true, extractedFields:{}, confirmedFields:{}, missingFields:requiredKeys.filter(key => key !== 'mobile'), declarations:{}, mappingStatus:'pending', createdAt:serverTimestamp(), updatedAt:serverTimestamp() };
    await setDoc(appRef,record);
    localStorage.setItem(appKey,state.applicationId); state.app = record; state.stage = 'documents'; documentsScreen();
  } catch (error) { setError(error.message || 'Could not start the application. Please try again.'); event.submitter.disabled = false; }
  finally { state.busy = false; }
}
function documentCard(type, spec) {
  const item = state.documents[type] || {};
  const status = item.uploadStatus === 'complete'
    ? type === 'photo' ? 'Stored securely'
      : item.extractionStatus === 'complete' ? `Read ${item.extractedFieldCount || 0} details`
      : item.extractionStatus === 'failed' ? 'Ready to scan again'
      : item.extractionStatus === 'processing' ? 'Reading with Cloud Vision…'
      : 'Ready for OCR scan'
    : item.uploadStatus === 'preparing' ? 'Optimising on this phone…'
    : item.uploadStatus === 'uploading' ? `Uploading ${item.progress || 0}%` : 'Tap to upload';
  return `<label class="doc-card ${item.uploadStatus === 'complete' ? 'done' : ''}" data-type="${type}"><span class="doc-icon">${item.uploadStatus === 'complete' ? '✓' : '＋'}</span><span class="doc-copy"><strong>${html(spec.label)} ${spec.required ? '<em>Required</em>' : '<em>Optional</em>'}</strong><small>${html(spec.hint)}</small><b>${html(status)}</b></span><input type="file" data-upload="${type}" accept="${html(spec.accept)}"><span class="doc-meter"><i style="width:${item.progress || 0}%"></i></span></label>`;
}
function documentsScreen() {
  const cards = Object.entries(state.config.documents).map(([type,spec]) => documentCard(type,spec)).join('');
  const requiredReady = Object.entries(state.config.documents).filter(([,spec]) => spec.required).every(([type]) => state.documents[type]?.uploadStatus === 'complete');
  const uploadRunning = Object.values(state.documents).some(item => ['preparing','uploading'].includes(item.uploadStatus));
  const canExtract = requiredReady && !uploadRunning;
  root.innerHTML = shell(`<section class="smart-card smart-wide"><div class="smart-kicker">STEP 2 OF 3</div><div class="smart-title-row"><div><h1>Upload your documents</h1><p>Every document accepts an image or PDF. Uploads finish first. When you tap “Check extracted details”, Cloud Vision securely reads all documents and shows live progress.</p></div><span class="save-chip">Cloud OCR · private</span></div><div class="doc-grid">${cards}</div><div class="smart-actions"><button class="smart-link" id="backHome">← Start again</button><button class="button button-primary" id="detailsButton" ${canExtract ? '' : 'disabled'}>${uploadRunning ? 'Finishing uploads…' : requiredReady ? 'Check extracted details →' : 'Upload required documents'}</button></div><p id="smartError" class="form-error"></p></section>`,2);
  document.querySelectorAll('[data-upload]').forEach(input => input.onchange = () => uploadDocument(input.dataset.upload,input.files?.[0]));
  document.getElementById('detailsButton').onclick = processExtractedDetails;
  document.getElementById('backHome').onclick = () => { if (confirm('Start a new application? Your uploaded files will remain private in the current saved application.')) { localStorage.removeItem(appKey); state.applicationId=''; state.stage='phone'; phoneScreen(); } };
}
async function optimizeImage(file) {
  if (file.type === 'application/pdf') return file;
  const directlyReadable = ['image/jpeg','image/png','image/webp'].includes(file.type);
  if (directlyReadable && file.size <= 1_600_000) return file;
  const url = URL.createObjectURL(file);
  try {
    let image, width, height;
    if ('createImageBitmap' in window) { image=await createImageBitmap(file); width=image.width; height=image.height; }
    else { image=new Image(); image.src=url; await image.decode(); width=image.naturalWidth; height=image.naturalHeight; }
    const scale = Math.min(1, 2000/width, 2000/height);
    const canvas = document.createElement('canvas'); canvas.width = Math.max(1,Math.round(width*scale)); canvas.height = Math.max(1,Math.round(height*scale));
    canvas.getContext('2d',{alpha:false,desynchronized:true}).drawImage(image,0,0,canvas.width,canvas.height);
    image.close?.();
    let quality=.84, blob;
    do { blob = await new Promise(resolve => canvas.toBlob(resolve,'image/jpeg',quality)); quality -= .07; } while (blob?.size > 1_800_000 && quality > .49);
    if (!blob) throw new Error('This image format could not be prepared. Try saving it as JPG, PNG or PDF.');
    if (directlyReadable && blob.size >= file.size) return file;
    return new File([blob],file.name.replace(/\.[^.]+$/,'.jpg'),{type:'image/jpeg'});
  } finally { URL.revokeObjectURL(url); }
}
function normalizeSelectedFile(file) {
  const extension = file.name.split('.').pop()?.toLowerCase() || '';
  const inferredTypes = {
    pdf:'application/pdf', jpg:'image/jpeg', jpeg:'image/jpeg', jpe:'image/jpeg',
    png:'image/png', webp:'image/webp', heic:'image/heic', heif:'image/heif',
    gif:'image/gif', bmp:'image/bmp', tif:'image/tiff', tiff:'image/tiff'
  };
  const inferred = inferredTypes[extension];
  if ((!file.type || file.type === 'application/octet-stream') && inferred) {
    return new File([file],file.name,{type:inferred,lastModified:file.lastModified});
  }
  return file;
}
async function uploadDocument(type,file) {
  if (!file) return;
  file = normalizeSelectedFile(file);
  const spec = state.config.documents[type];
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  const isImage = file.type.startsWith('image/');
  if (!spec || (!isPdf && !isImage)) return setError('Choose an image or PDF file.');
  if (file.size > 15*1024*1024) return setError('Choose a file smaller than 15 MB.');
  try {
    setError(); state.documents[type] = { uploadStatus:file.type === 'application/pdf' || file.size <= 1_600_000 ? 'uploading' : 'preparing', progress:1, extractionStatus:'waiting' }; documentsScreen();
    const optimized = await optimizeImage(file);
    state.documents[type].uploadStatus='uploading'; documentsScreen();
    const safeName = optimized.name.toLowerCase().replace(/[^a-z0-9._-]+/g,'-');
    const path = `applications/${currentUser().uid}/${state.applicationId}/${type}/${Date.now()}-${safeName}`;
    const task = uploadBytesResumable(ref(storage,path),optimized,{contentType:optimized.type,cacheControl:'private,max-age=0,no-store',customMetadata:{applicationId:state.applicationId,documentType:type}});
    await new Promise((resolve,reject) => task.on('state_changed', snapshot => { state.documents[type].progress = Math.round(snapshot.bytesTransferred/snapshot.totalBytes*100); const meter=document.querySelector(`[data-type="${type}"] .doc-meter i`); if(meter) meter.style.width=`${state.documents[type].progress}%`; const status=document.querySelector(`[data-type="${type}"] .doc-copy b`); if(status) status.textContent=`Uploading ${state.documents[type].progress}%`; },reject,resolve));
    const meta = { storagePath:path, originalFilename:file.name.slice(0,120), mimeType:optimized.type, sizeBytes:optimized.size, uploadStatus:'complete', extractionStatus:type === 'photo' ? 'not_required' : 'queued', extractedFieldCount:0, uploadedAt:serverTimestamp(), updatedAt:serverTimestamp() };
    await setDoc(doc(db,'applications',state.applicationId,'documents',type),meta);
    state.documents[type] = { ...meta, progress:100 };
    await updateDoc(doc(db,'applications',state.applicationId),{ status:'UPLOADING', updatedAt:serverTimestamp() });
    documentsScreen();
  } catch (error) { state.documents[type] = { uploadStatus:'failed', progress:0, extractionStatus:'failed' }; documentsScreen(); setError(error.message || 'Upload failed. Tap the document to retry.'); }
}
function renderOcrProgress({completed,total,current='',fields=0,failed=0}) {
  const percent = total ? Math.round(completed / total * 100) : 100;
  root.innerHTML = shell(`<section class="smart-card ocr-card"><div class="smart-kicker">CLOUD VISION OCR</div><div class="ocr-orbit"><span>${percent}%</span></div><h1>${percent < 100 ? 'Reading your documents' : 'Document reading complete'}</h1><p>${percent < 100 ? `Securely reading ${html(current)}. Keep this page open for a moment.` : `We found ${fields} detail${fields === 1 ? '' : 's'} from your documents.`}</p><div class="ocr-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}"><i style="width:${percent}%"></i></div><div class="ocr-stats"><span><b>${completed}</b> of ${total} documents checked</span><span><b>${fields}</b> details found</span></div>${failed ? `<p class="ocr-note">${failed} document${failed === 1 ? '' : 's'} could not be read. You can enter those details manually.</p>` : '<p class="ocr-note">Your original files stay private in Firebase Storage.</p>'}</section>`,3);
}
async function processExtractedDetails() {
  if (state.busy) return;
  const candidates = Object.entries(state.documents).filter(([type,item]) => type !== 'photo' && item.uploadStatus === 'complete');
  if (!candidates.length) return showMissingFields();
  state.busy=true; state.stage='extracting';
  const pending = candidates.filter(([,item]) => item.extractionStatus !== 'complete');
  let completed=candidates.length-pending.length;
  let fields=candidates.filter(([,item]) => item.extractionStatus === 'complete').reduce((sum,[,item]) => sum + (item.extractedFieldCount || 0),0);
  let failed=0;
  renderOcrProgress({completed,total:candidates.length,current:'your uploaded documents',fields,failed});
  try {
    await updateDoc(doc(db,'applications',state.applicationId),{status:'OCR_PROCESSING',ocrStartedAt:serverTimestamp(),updatedAt:serverTimestamp()});
    for (const [type,item] of pending) {
      item.extractionStatus='processing';
      renderOcrProgress({completed,total:candidates.length,current:state.config.documents[type]?.label || 'document',fields,failed});
      try {
        const result=await ocrDocument({applicationId:state.applicationId,documentType:type,storagePath:item.storagePath,mimeType:item.mimeType});
        item.extractionStatus='complete'; item.extractedFieldCount=result.data.fieldCount || 0;
        fields += item.extractedFieldCount;
        for (const [key,record] of Object.entries(result.data.fields || {})) if (!state.values[key]) state.values[key]=record.value;
      } catch (error) {
        item.extractionStatus='failed'; failed += 1;
      }
      completed += 1;
      renderOcrProgress({completed,total:candidates.length,current:state.config.documents[type]?.label || 'document',fields,failed});
    }
    const latest=await getDoc(doc(db,'applications',state.applicationId));
    if(latest.exists()) {
      state.extractedRecords=latest.data().extractedFields || {};
      state.fieldConflicts=latest.data().fieldConflicts || {};
      const confirmed=latest.data().confirmedFields || {};
      for(const [key,record] of Object.entries(state.extractedRecords)) if(!confirmed[key]) state.values[key]=record.value;
    }
    await updateDoc(doc(db,'applications',state.applicationId),{status:'NEEDS_REVIEW',ocrCompletedAt:serverTimestamp(),ocrSummary:{documents:candidates.length,fields,failed},updatedAt:serverTimestamp()});
    renderOcrProgress({completed:candidates.length,total:candidates.length,current:'',fields,failed});
    await new Promise(resolve => setTimeout(resolve,650));
    showFinalReview();
  } catch (error) {
    documentsScreen(); setError(error.message || 'Cloud OCR could not start. Please try again.');
  } finally { state.busy=false; }
}
function missingFields() {
  state.values = applyReferenceMappings(state.values,state.config);
  return form18Fields.filter(field => (field.required || (field.key === 'aadhaarNumber' && state.values.aadhaarProvided === 'Yes')) && !String(state.values[field.key] || field.defaultValue || '').trim());
}
function fieldControl(field,value='') {
  const common = `data-field="${field.key}" id="f_${field.key}" ${field.required ? 'required' : ''}`;
  if (field.type === 'select') return `<select ${common}><option value="">Not found — tap to choose</option>${field.options.map(option => `<option ${value===option?'selected':''}>${html(option)}</option>`).join('')}</select>`;
  const constraints = field.key === 'aadhaarNumber' ? 'maxlength="12" minlength="12" pattern="[0-9]{12}" autocomplete="off"' : field.type === 'year' ? 'maxlength="4"' : '';
  return `<input ${common} type="${field.type === 'date' ? 'date' : field.type === 'email' ? 'email' : field.type === 'phone' ? 'tel' : 'text'}" inputmode="${field.inputmode || (field.type === 'year' ? 'numeric' : field.type === 'phone' ? 'tel' : 'text')}" autocomplete="${field.autocomplete || 'off'}" value="${html(value || field.defaultValue || '')}" placeholder="Not found — tap to enter" ${constraints}>`;
}
function sourceBadge(field) {
  const record=state.extractedRecords[field.key];
  if(!record) return '<small class="field-origin missing-origin">Not found in documents</small>';
  const source=state.config.documents[record.source]?.label || 'Uploaded document';
  const confidence=Math.round((record.confidence || 0) * 100);
  const conflict=state.fieldConflicts[field.key]?.length;
  return `<small class="field-origin ${confidence >= 80 && !conflict ? 'fetched-origin' : 'check-origin'}">${conflict ? 'Check match' : 'OCR'} · ${html(source)} · ${confidence}%</small>`;
}
function applySafeDerivedValues() {
  if(!state.values.signatureName && state.values.fullName) state.values.signatureName=state.values.fullName;
  if(!state.values.place && state.values.town) state.values.place=state.values.town;
  if(state.values.aadhaarNumber && !state.values.aadhaarProvided) state.values.aadhaarProvided='Yes';
  state.values=applyReferenceMappings(state.values,state.config);
}
function showFinalReview() {
  applySafeDerivedValues(); state.stage='final-review';
  const groups = [...new Set(form18Fields.map(field=>field.group))];
  const extractedCount=Object.keys(state.extractedRecords).filter(key=>form18Fields.some(field=>field.key===key)).length;
  const rawAddress=state.extractedRecords.addressRaw?.value;
  root.innerHTML = shell(`<section class="smart-card smart-wide final-review"><div class="smart-kicker">STEP 3 OF 3 · FINAL</div><h1>Validate your extracted details</h1><p>We placed every detail found by OCR into the fields below. Green labels are strong matches; amber labels need closer attention. Correct anything necessary before preparing Form 18.</p><div class="extraction-summary"><span><b>${extractedCount}</b> Form 18 fields filled</span><span><b>${missingFields().length}</b> required fields still missing</span></div>${rawAddress ? `<details class="raw-ocr"><summary>View complete address read from Aadhaar</summary><p>${html(rawAddress)}</p></details>` : ''}<form id="reviewForm">${groups.map((group,index) => `<details class="review-group review-section" open><summary>${html(group)}</summary><div class="smart-fields">${form18Fields.filter(field=>field.group===group).map(field=>`<label class="${state.extractedRecords[field.key] ? 'ocr-filled' : 'ocr-missing'}"><span>${html(field.label)}${field.required?' *':''}${sourceBadge(field)}</span>${fieldControl(field,state.values[field.key])}</label>`).join('')}</div></details>`).join('')}<div class="declaration-panel"><h2>Final confirmation</h2><label class="smart-consent"><input id="declarationAccuracy" type="checkbox" required><span>I checked the extracted details and declare that the information is true to the best of my knowledge.</span></label><label class="smart-consent"><input id="declarationCitizenship" type="checkbox" required><span>I confirm that I am an Indian citizen and ordinarily resident at the address provided.</span></label><label class="smart-consent"><input id="declarationGraduate" type="checkbox" required><span>I confirm that I meet the applicable graduate qualification requirement.</span></label></div><p id="smartError" class="form-error"></p><div class="smart-actions"><button type="button" class="smart-link" id="docsBack">← Documents</button><button class="button button-primary" type="submit">Confirm & prepare Form 18 →</button></div></form></section>`,3);
  document.getElementById('docsBack').onclick=documentsScreen;
  document.getElementById('reviewForm').onsubmit=confirmApplication;
}
function showMissingFields(){ showFinalReview(); }
function collectVisible() { document.querySelectorAll('[data-field]').forEach(input => state.values[input.dataset.field]=input.value.trim()); applySafeDerivedValues(); }
async function confirmApplication(event) {
  event.preventDefault(); collectVisible();
  const missing=missingFields();
  if(missing.length) return setError(`Please complete ${missing.length} required field${missing.length===1?'':'s'}.`);
  if(state.values.aadhaarProvided === 'Yes' && !/^\d{12}$/.test(state.values.aadhaarNumber || '')) return setError('Enter the complete 12-digit Aadhaar number.');
  try {
    event.submitter.disabled=true; event.submitter.textContent='Preparing Form 18…';
    const declarations={accuracy:true,citizenship:true,graduateEligibility:true,confirmedAt:new Date().toISOString()};
    const confirmedFields=Object.fromEntries(Object.entries(state.values).map(([key,value])=>[key,{value,confirmed:true,confirmedAt:new Date().toISOString()}]));
    await updateDoc(doc(db,'applications',state.applicationId),{ confirmedFields,missingFields:[],declarations,status:'VOTER_CONFIRMED',updatedAt:serverTimestamp() });
    await generatePdf(); state.stage='complete'; completeScreen();
  } catch(error) { setError(error.message || 'Could not prepare the form. Please try again.'); event.submitter.disabled=false; }
}
async function generatePdf() {
  const PDFLib = await import('https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/+esm');
  const attached=Object.entries(state.documents).filter(([,item])=>item.uploadStatus==='complete').map(([type])=>state.config.documents[type].label);
  const bytes=await buildForm18Pdf(PDFLib,state.values,form18Fields,attached); const path=`applications/${currentUser().uid}/${state.applicationId}/generated/form18-prepared.pdf`;
  await uploadBytes(ref(storage,path),bytes,{contentType:'application/pdf',customMetadata:{applicationId:state.applicationId,documentType:'generated_form18'}});
  await updateDoc(doc(db,'applications',state.applicationId),{ status:'FORM_PREPARED',generatedFormPath:path,formPreparedAt:serverTimestamp(),updatedAt:serverTimestamp() });
  state.generatedPath=path;
}
async function downloadPrepared() { const blob=await getBlob(ref(storage,state.generatedPath)); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url;a.download=`Form-18-${state.applicationId}.pdf`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000); }
function completeScreen() {
  root.innerHTML=shell(`<section class="smart-card smart-success"><div class="success-icon">✓</div><div class="smart-kicker">FORM PREPARED</div><h1>Your Form 18 preparation is complete.</h1><p>Download and review the PDF. This website has not submitted it to election officials.</p><div class="reference-box"><span>Application reference</span><strong>${html(state.applicationId)}</strong></div><button class="button button-primary smart-next" id="downloadForm">Download prepared Form 18 ↓</button><a class="smart-link centered" href="/?form=graduate-voter&link=${encodeURIComponent(linkId)}">Return to campaign form</a></section>`,5);
  document.getElementById('downloadForm').onclick=downloadPrepared;
}
async function restore() {
  try {
    if(!currentUser()) await signInAnonymously(auth);
    const id=localStorage.getItem(appKey); if(!id) return phoneScreen();
    const snap=await getDoc(doc(db,'applications',id)); if(!snap.exists()||snap.data().ownerUid!==currentUser().uid){localStorage.removeItem(appKey);return phoneScreen();}
    state.applicationId=id;state.app=snap.data();state.values.mobile=state.app.mobile;
    state.extractedRecords=state.app.extractedFields||{};
    state.fieldConflicts=state.app.fieldConflicts||{};
    for(const [key,record] of Object.entries(state.extractedRecords)) state.values[key]=record.value;
    for(const [key,record] of Object.entries(state.app.confirmedFields||{})) state.values[key]=record.value;
    if(state.app.status==='FORM_PREPARED'){state.generatedPath=state.app.generatedFormPath;return completeScreen();}
    const docs=await Promise.all(Object.keys(state.config.documents).map(async type=>{const snap=await getDoc(doc(db,'applications',id,'documents',type));return [type,snap.exists()?{...snap.data(),progress:100}:null];}));
    state.documents=Object.fromEntries(docs.filter(([,value])=>value)); documentsScreen();
  } catch(error){ root.innerHTML=shell(`<section class="smart-card"><h1>We could not restore this application.</h1><p>${html(error.message)}</p><button class="button button-primary" onclick="localStorage.removeItem('${appKey}');location.reload()">Start again</button></section>`); }
}
async function loadConfig(){ try{const snap=await getDoc(doc(db,'form18Config','default'));if(snap.exists()){const saved=snap.data();const documents=Object.fromEntries(Object.entries(defaultConfig.documents).map(([key,value])=>[key,{...value,...(saved.documents?.[key]||{})}]));state.config={...defaultConfig,...saved,documents};}}catch{} }
export async function startForm18(){ root.innerHTML='<div class="load-error">Opening secure application…</div>'; await loadConfig(); await new Promise(resolve=>{const off=onAuthStateChanged(auth,()=>{off();resolve();},()=>{off();resolve();});}); await restore(); }
