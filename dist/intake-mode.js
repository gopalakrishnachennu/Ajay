import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc, updateDoc, collection, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { getStorage, ref, uploadBytesResumable } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-storage.js';
import { defaultConfig } from './form18-schema.js?v=20261013h';

const firebase = initializeApp({
  apiKey:'AIzaSyDqa90otd4FEnYIys2dCV-zwtesCNxhzqI', authDomain:'ajaychevula-d2a22.firebaseapp.com',
  projectId:'ajaychevula-d2a22', storageBucket:'ajaychevula-d2a22.firebasestorage.app', appId:'1:396367674243:web:bceb0a4c279959c29b94b6'
});
const auth=getAuth(firebase), db=getFirestore(firebase), storage=getStorage(firebase);
const root=document.getElementById('app');
const appKey='campaignos.intake.application';
const linkId=new URLSearchParams(location.search).get('link') || 'link_main';
const state={applicationId:'',values:{},documents:{},config:defaultConfig,busy:false};
const html=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function shell(content,step=1){
  return `<div class="smart-shell"><div class="smart-progress"><span style="width:${step*50}%"></span></div><header class="smart-header"><a href="/?form=graduate-voter&link=${encodeURIComponent(linkId)}" class="smart-brand">✦ <span>Graduate voter registration<small>Secure document collection</small></span></a><span class="smart-private">PRIVATE APPLICATION</span></header><main class="smart-main">${content}</main></div>`;
}
function setError(message=''){const target=document.getElementById('smartError');if(target)target.textContent=message;}
function detailsScreen(){
  const v=state.values;
  root.innerHTML=shell(`<section class="smart-card smart-wide intake-card"><div class="intake-leadership" aria-label="Campaign leadership">
    <div class="intake-candidate"><img src="assets/sama-ram-mohan-reddy.jpg" alt="Sama Ram Mohan Reddy"><div><span>MLC CANDIDATE</span><strong>Sama Ram Mohan Reddy</strong><small>Mahabubnagar · Hyderabad · Ranga Reddy</small></div></div>
    <div class="intake-promoter"><img src="assets/chevula-ajay-reddy.png" alt="Chevula Ajay Reddy"><div><span>CAMPAIGN PROMOTER</span><strong>Chevula Ajay Reddy</strong></div></div>
  </div><div class="smart-kicker">STEP 1 OF 2</div><h1>Tell us about the graduate voter</h1><p>Enter these basic details once. On the next page, upload the supporting documents.</p><form id="detailsForm"><div class="smart-fields intake-fields">
    <label><span>Full name *</span><input id="fullName" autocomplete="name" value="${html(v.fullName)}" placeholder="As shown on your documents" required></label>
    <label><span>Father's name *</span><input id="relativeName" autocomplete="off" value="${html(v.relativeName)}" placeholder="Father's full name" required></label>
    <label><span>Gender *</span><select id="sex" required><option value="">Tap to choose</option>${['Male','Female','Third gender'].map(x=>`<option ${v.sex===x?'selected':''}>${x}</option>`).join('')}</select></label>
    <label><span>Date of birth *</span><input id="dob" type="date" value="${html(v.dob)}" max="${new Date().toISOString().slice(0,10)}" required></label>
    <label><span>MLC constituency *</span><select id="graduateConstituency" required><option value="">Tap to choose</option>${['Mahabubnagar','Hyderabad','Ranga Reddy'].map(x=>`<option ${v.graduateConstituency===x?'selected':''}>${x}</option>`).join('')}</select></label>
    <label><span>Assembly constituency *</span><input id="assemblyConstituency" value="${html(v.assemblyConstituency)}" placeholder="Enter Assembly constituency" required></label>
    <label><span>District *</span><input id="district" value="${html(v.district)}" placeholder="Enter district" required></label>
    <label><span>Email ID *</span><input id="email" type="email" autocomplete="email" value="${html(v.email)}" placeholder="name@example.com" required></label>
    <label><span>Mobile number *</span><div class="smart-phone compact-phone"><span>+91</span><input id="mobile" type="tel" inputmode="numeric" autocomplete="tel-national" maxlength="10" value="${html(v.mobile)}" placeholder="10-digit mobile number" required></div></label>
  </div><label class="smart-consent"><input id="consent" type="checkbox" ${v.consent?'checked':''} required><span>I consent to securely storing these details and uploaded documents for graduate voter registration assistance.</span></label><p id="smartError" class="form-error"></p><button class="button button-primary smart-next" type="submit">Continue to documents →</button></form></section>`,1);
  document.getElementById('detailsForm').onsubmit=saveDetails;
}
function collectDetails(){
  for(const key of ['fullName','relativeName','sex','dob','graduateConstituency','assemblyConstituency','district','email','mobile']) state.values[key]=document.getElementById(key).value.trim();
  state.values.mobile=state.values.mobile.replace(/\D/g,'').slice(-10);
  state.values.consent=document.getElementById('consent').checked;
}
async function saveDetails(event){
  event.preventDefault();collectDetails();setError();
  if(!/^[6-9]\d{9}$/.test(state.values.mobile))return setError('Enter a valid 10-digit Indian mobile number.');
  try{
    state.busy=true;event.submitter.disabled=true;event.submitter.textContent='Saving securely…';
    if(!auth.currentUser)await signInAnonymously(auth);
    const confirmedFields=Object.fromEntries(Object.entries({...state.values,relationType:'Father'}).filter(([key])=>key!=='consent').map(([key,value])=>[key,{value,confirmed:true,confirmedAt:new Date().toISOString()}]));
    if(!state.applicationId){
      const appRef=doc(collection(db,'applications'));state.applicationId=appRef.id;
      await setDoc(appRef,{ownerUid:auth.currentUser.uid,formId:'graduate-voter',linkId,schemaVersion:3,status:'DRAFT',mobile:state.values.mobile,consentVersion:'2026-10-13-basic-intake',consentAccepted:true,extractedFields:{},confirmedFields,missingFields:[],declarations:{detailsConfirmed:true},mappingStatus:'manual',createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
      localStorage.setItem(appKey,state.applicationId);
    }else await updateDoc(doc(db,'applications',state.applicationId),{mobile:state.values.mobile,confirmedFields,updatedAt:serverTimestamp()});
    documentsScreen();
  }catch(error){setError(error.message||'Could not save these details. Please try again.');event.submitter.disabled=false;}
  finally{state.busy=false;}
}
function documentCard(type,spec){
  const item=state.documents[type]||{};
  const status=item.uploadStatus==='complete'?'Uploaded securely':item.uploadStatus==='preparing'?'Preparing image…':item.uploadStatus==='uploading'?`Uploading ${item.progress||0}%`:'Tap to upload';
  return `<label class="doc-card ${item.uploadStatus==='complete'?'done':''}" data-type="${type}"><span class="doc-icon">${item.uploadStatus==='complete'?'✓':'＋'}</span><span class="doc-copy"><strong>${html(spec.label)} ${spec.required?'<em>Required</em>':'<em>Optional</em>'}</strong><small>${html(spec.hint)}</small><b>${html(status)}</b></span><input type="file" data-upload="${type}" accept="image/*,application/pdf"><span class="doc-meter"><i style="width:${item.progress||0}%"></i></span></label>`;
}
function documentsScreen(){
  const cards=Object.entries(state.config.documents).map(([type,spec])=>documentCard(type,spec)).join('');
  const uploadRunning=Object.values(state.documents).some(item=>['preparing','uploading'].includes(item.uploadStatus));
  const requiredReady=Object.entries(state.config.documents).filter(([,spec])=>spec.required).every(([type])=>state.documents[type]?.uploadStatus==='complete');
  root.innerHTML=shell(`<section class="smart-card smart-wide"><div class="smart-kicker">STEP 2 OF 2 · FINAL</div><div class="smart-title-row"><div><h1>Upload supporting documents</h1><p>Upload images or PDFs. Files are stored privately for authorised admin review; voter-side AI extraction is not used in this version.</p></div><span class="save-chip">Private · up to 15 MB</span></div><div class="doc-grid">${cards}</div><p id="smartError" class="form-error"></p><div class="smart-actions"><button class="smart-link" id="detailsBack">← Edit details</button><button class="button button-primary" id="submitApplication" ${requiredReady&&!uploadRunning?'':'disabled'}>${uploadRunning?'Finishing uploads…':requiredReady?'Submit application →':'Upload required documents'}</button></div></section>`,2);
  document.querySelectorAll('[data-upload]').forEach(input=>input.onchange=()=>uploadDocument(input.dataset.upload,input.files?.[0]));
  document.getElementById('detailsBack').onclick=detailsScreen;
  document.getElementById('submitApplication').onclick=submitApplication;
}
async function optimizeImage(file){
  if(file.type==='application/pdf')return file;
  const directlyReadable=['image/jpeg','image/png','image/webp'].includes(file.type);
  if(directlyReadable&&file.size<=1_600_000)return file;
  const url=URL.createObjectURL(file);
  try{
    let image,width,height;
    if('createImageBitmap'in window){image=await createImageBitmap(file);width=image.width;height=image.height;}
    else{image=new Image();image.src=url;await image.decode();width=image.naturalWidth;height=image.naturalHeight;}
    const scale=Math.min(1,2000/width,2000/height);const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));canvas.getContext('2d',{alpha:false,desynchronized:true}).drawImage(image,0,0,canvas.width,canvas.height);image.close?.();
    let quality=.84,blob;do{blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));quality-=.07;}while(blob?.size>1_800_000&&quality>.49);
    if(!blob)throw new Error('This image could not be prepared. Try JPG, PNG or PDF.');
    if(directlyReadable&&blob.size>=file.size)return file;
    return new File([blob],file.name.replace(/\.[^.]+$/,'.jpg'),{type:'image/jpeg'});
  }finally{URL.revokeObjectURL(url);}
}
async function uploadDocument(type,file){
  if(!file)return;const isPdf=file.type==='application/pdf'||/\.pdf$/i.test(file.name);const isImage=file.type.startsWith('image/');
  if(!isPdf&&!isImage)return setError('Choose an image or PDF file.');if(file.size>15*1024*1024)return setError('Choose a file smaller than 15 MB.');
  try{
    setError();state.documents[type]={uploadStatus:isPdf||file.size<=1_600_000?'uploading':'preparing',progress:1};documentsScreen();
    const optimized=await optimizeImage(file);state.documents[type].uploadStatus='uploading';documentsScreen();
    const safeName=optimized.name.toLowerCase().replace(/[^a-z0-9._-]+/g,'-');const path=`applications/${auth.currentUser.uid}/${state.applicationId}/${type}/${Date.now()}-${safeName}`;
    const task=uploadBytesResumable(ref(storage,path),optimized,{contentType:optimized.type,cacheControl:'private,max-age=0,no-store',customMetadata:{applicationId:state.applicationId,documentType:type}});
    await new Promise((resolve,reject)=>task.on('state_changed',snapshot=>{state.documents[type].progress=Math.round(snapshot.bytesTransferred/snapshot.totalBytes*100);const meter=document.querySelector(`[data-type="${type}"] .doc-meter i`);if(meter)meter.style.width=`${state.documents[type].progress}%`;const status=document.querySelector(`[data-type="${type}"] .doc-copy b`);if(status)status.textContent=`Uploading ${state.documents[type].progress}%`;},reject,resolve));
    const meta={storagePath:path,originalFilename:file.name.slice(0,120),mimeType:optimized.type,sizeBytes:optimized.size,uploadStatus:'complete',extractionStatus:'pending_admin_review',uploadedAt:serverTimestamp(),updatedAt:serverTimestamp()};
    await setDoc(doc(db,'applications',state.applicationId,'documents',type),meta);state.documents[type]={...meta,progress:100};await updateDoc(doc(db,'applications',state.applicationId),{status:'DOCUMENTS_UPLOADED',updatedAt:serverTimestamp()});documentsScreen();
  }catch(error){state.documents[type]={uploadStatus:'failed',progress:0};documentsScreen();setError(error.message||'Upload failed. Tap to retry.');}
}
async function submitApplication(){
  if(state.busy)return;
  try{state.busy=true;document.getElementById('submitApplication').disabled=true;document.getElementById('submitApplication').textContent='Submitting…';await updateDoc(doc(db,'applications',state.applicationId),{status:'DOCUMENTS_RECEIVED',submittedAt:serverTimestamp(),updatedAt:serverTimestamp()});completeScreen();}
  catch(error){documentsScreen();setError(error.message||'Could not submit. Please try again.');}
  finally{state.busy=false;}
}
function completeScreen(){root.innerHTML=shell(`<section class="smart-card smart-success"><div class="success-icon">✓</div><div class="smart-kicker">APPLICATION RECEIVED</div><h1>Thank you. Your details and documents were received.</h1><p>The authorised campaign team can now review your application.</p><div class="reference-box"><span>Application reference</span><strong>${html(state.applicationId)}</strong></div></section>`,2);}
async function restore(){
  if(!auth.currentUser)await signInAnonymously(auth);const id=localStorage.getItem(appKey);if(!id)return detailsScreen();
  const snap=await getDoc(doc(db,'applications',id));if(!snap.exists()||snap.data().ownerUid!==auth.currentUser.uid){localStorage.removeItem(appKey);return detailsScreen();}
  state.applicationId=id;const data=snap.data();state.values.mobile=data.mobile;for(const[key,record]of Object.entries(data.confirmedFields||{}))state.values[key]=record.value;state.values.consent=true;
  const docs=await Promise.all(Object.keys(state.config.documents).map(async type=>{const result=await getDoc(doc(db,'applications',id,'documents',type));return[type,result.exists()?{...result.data(),progress:100}:null];}));state.documents=Object.fromEntries(docs.filter(([,value])=>value));
  if(data.status==='DOCUMENTS_RECEIVED')completeScreen();else documentsScreen();
}
async function loadConfig(){try{const snap=await getDoc(doc(db,'form18Config','default'));if(snap.exists()){const saved=snap.data();state.config={...defaultConfig,...saved,documents:Object.fromEntries(Object.entries(defaultConfig.documents).map(([key,value])=>[key,{...value,...(saved.documents?.[key]||{})}]))};}}catch{}}
export async function startIntake(){root.innerHTML='<div class="load-error">Opening secure application…</div>';await loadConfig();await new Promise(resolve=>{const off=onAuthStateChanged(auth,()=>{off();resolve();},()=>{off();resolve();});});await restore();}
