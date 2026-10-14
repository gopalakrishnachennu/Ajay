import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged, setPersistence, inMemoryPersistence, EmailAuthProvider, reauthenticateWithCredential, updatePassword } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import { getFirestore, collection, doc, getDoc, getDocs, setDoc, updateDoc, addDoc, writeBatch, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { getStorage, ref, getBlob, getDownloadURL } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-storage.js';

const firebaseConfig={
  apiKey: 'AIzaSyDqa90otd4FEnYIys2dCV-zwtesCNxhzqI',
  authDomain: 'ajaychevula-d2a22.firebaseapp.com',
  projectId: 'ajaychevula-d2a22',
  storageBucket: 'ajaychevula-d2a22.firebasestorage.app',
  appId: '1:396367674243:web:bceb0a4c279959c29b94b6'
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app, 'gs://ajaychevula-d2a22.firebasestorage.app');
const superAdminEmails = new Set(['gopalakrishnachennu@gmail.com','chevulaajayreddy.03@gmail.com']);
let session=null;
const usernameToEmail=username=>`${String(username||'').trim().toLowerCase().replace(/[^a-z0-9._-]/g,'')}@campaignos.local`;
async function refreshSession(){
  const user=auth.currentUser;
  if(!user){session=null;return null;}
  if(superAdminEmails.has(String(user.email||'').toLowerCase())&&user.emailVerified){session={uid:user.uid,email:user.email,username:'Super admin',role:'super_admin',isSuperAdmin:true};return session;}
  const snap=await getDoc(doc(db,'admins',user.uid));
  if(!snap.exists()||snap.data().active!==true){await signOut(auth);session=null;throw Object.assign(new Error('This admin account is not active.'),{status:401});}
  session={uid:user.uid,email:user.email,username:snap.data().username||user.email,role:'admin',isSuperAdmin:false};return session;
}
// Every admin page load must begin at the login gate on a shared device.
export const ready = (async () => {
  await setPersistence(auth, inMemoryPersistence);
  return new Promise(resolve => onAuthStateChanged(auth, async () => { try{await refreshSession();}catch{}resolve(); }, () => resolve()));
})();
const uid = () => auth.currentUser;
const denied = () => Object.assign(new Error('Sign in with an approved admin account'), { status: 401 });
function admin() { if (!session) throw denied(); }
function owner() { if (!session?.isSuperAdmin) throw Object.assign(new Error('Super admin access is required'), { status: 403 }); }
function normalize(value) { if (value && typeof value.toDate === 'function') return value.toDate().toISOString(); if (Array.isArray(value)) return value.map(normalize); if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k,v]) => [k, normalize(v)])); return value; }
function rows(snapshot) { return snapshot.docs.map(d => ({ id: d.id, ...normalize(d.data()) })); }
let cache = null;
async function all() {
  admin();
  if (cache && Date.now() - cache.at < 1500) return cache.promise;
  const promise = Promise.all(['forms','links','submissions','events'].map(name => getDocs(collection(db, name)).then(rows))).then(([forms,links,submissions,events]) => ({ forms, links, submissions: submissions.sort((a,b) => String(b.createdAt).localeCompare(String(a.createdAt))), events }));
  cache = { at: Date.now(), promise };
  return promise;
}
function clearCache() { cache = null; }
function auditRow(action, detail) { return { action, detail, createdAt:serverTimestamp(),actorUid:session?.uid||'',actor:session?.username||'' }; }
async function recordLogin(){if(!session)return;await addDoc(collection(db,'adminLogins'),{uid:session.uid,username:session.username,role:session.role,createdAt:serverTimestamp()});}
function summary(data, form) {
  const links = data.links.filter(l => l.formId === form.id);
  const events = data.events.filter(e => e.formId === form.id);
  return { ...form, links: links.length, views: events.filter(e => e.type === 'view').length, starts: events.filter(e => e.type === 'start').length, shares: events.filter(e => e.type === 'share').length, submissions: data.submissions.filter(s => s.formId === form.id).length };
}
function metrics(data) {
  const events = data.events;
  const submissions = data.submissions;
  const counts = type => events.filter(e => e.type === type).length;
  const views = counts('view'), starts = counts('start');
  const byDay = {}, mandals = {};
  for (const event of events) { const day = String(event.createdAt || '').slice(0,10); if (!day) continue; byDay[day] ||= { views:0, starts:0, submissions:0 }; if (event.type === 'view') byDay[day].views++; if (event.type === 'start') byDay[day].starts++; if (event.type === 'submit') byDay[day].submissions++; }
  for (const row of submissions) { const name = row.answers?.mandal || 'Other'; mandals[name] = (mandals[name] || 0) + 1; }
  return { forms: data.forms.length, links: data.links.length, unopenedLinks: data.links.filter(link => !events.some(e => e.linkId === link.id && e.type === 'view')).length, views, starts, shares: counts('share'), submissions: submissions.length, registered: submissions.filter(s => s.answers?.status === 'registered').length, needsSupport: submissions.filter(s => s.answers?.status === 'new').length, completionRate: starts ? Math.round(submissions.length / starts * 100) : 0, byDay, mandals, recent: submissions.slice(0,8) };
}
function splitPath(path) { return path.split('?')[0].split('/').filter(Boolean); }
function body(options) { return options.body ? JSON.parse(options.body) : {}; }
function slug(text) { return String(text || 'form').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'') || 'form'; }
function publicFields(form) { return { id:form.id, slug:form.slug, name:form.name, description:form.description, candidate:form.candidate, promoter:form.promoter, candidateImage:form.candidateImage || '', promoterImage:form.promoterImage || '', theme:form.theme || {}, experience:form.experience || {}, fields:form.fields }; }
function checkAnswers(form, answers) {
  const status = String(answers?.status || '');
  for (const field of form.fields) { if (field.when && field.when !== status) continue; const value = String(answers?.[field.key] || '').trim(); if (field.required && !value) throw new Error(`${field.label} is required`); if (value && ['choice','select'].includes(field.type) && !field.options.includes(value)) throw new Error(`${field.label} has an invalid value`); if (value && field.type === 'phone' && !/^[6-9]\d{9}$/.test(value.replace(/^(\+91|91)/,''))) throw new Error('Enter a valid 10-digit mobile number'); if (value && field.type === 'year' && !/^(19|20)\d{2}$/.test(value)) throw new Error('Enter a 4-digit graduation year'); }
}
export async function request(path, options = {}) {
  await ready;
  const parts = splitPath(path);
  const method = options.method || 'GET';
  const input = body(options);
  if (parts[1] === 'auth' && parts[2] === 'login' && method === 'POST') {
    if(input.mode==='password'){
      const username=String(input.username||'').trim();
      if(!/^[A-Za-z0-9._-]{3,40}$/.test(username)||String(input.password||'').length<10)throw new Error('Enter your username and password.');
      await signInWithEmailAndPassword(auth,usernameToEmail(username),String(input.password));
    }else{const provider = new GoogleAuthProvider(); provider.setCustomParameters({ prompt:'select_account' }); await signInWithPopup(auth, provider);}
    await refreshSession();admin();await recordLogin();return {...session};
  }
  if (parts[1] === 'auth' && parts[2] === 'logout' && method === 'POST') { await signOut(auth); return { ok:true }; }
  if (parts[1] === 'me') { admin(); return {...session}; }
  if (parts[1] === 'public' && parts[2] === 'forms' && parts.length === 4 && method === 'GET') { const snap = await getDoc(doc(db,'forms',parts[3])); if (!snap.exists() || snap.data().status !== 'published') throw new Error('Form unavailable'); return publicFields({ id:snap.id, ...normalize(snap.data()) }); }
  if (parts[1] === 'public' && parts[2] === 'links' && parts.length === 4 && method === 'GET') { const snap = await getDoc(doc(db,'links',parts[3])); if (!snap.exists()) throw new Error('Link unavailable'); return { id:snap.id, formId:snap.data().formId }; }
  if (parts[1] === 'public' && parts[2] === 'links' && parts[4] === 'events' && method === 'POST') { const link = await getDoc(doc(db,'links',parts[3])); if (!link.exists()) throw new Error('Link unavailable'); await addDoc(collection(db,'events'), { formId:link.data().formId, linkId:parts[3], type:input.type, createdAt:serverTimestamp() }); clearCache(); return { ok:true }; }
  if (parts[1] === 'public' && parts[2] === 'forms' && parts[4] === 'submissions' && method === 'POST') {
    const [formSnap, linkSnap] = await Promise.all([getDoc(doc(db,'forms',parts[3])), getDoc(doc(db,'links',input.linkId))]);
    if (!formSnap.exists() || formSnap.data().status !== 'published' || !linkSnap.exists() || linkSnap.data().formId !== formSnap.id) throw new Error('Form unavailable');
    checkAnswers(formSnap.data(), input.answers);
    const submission = doc(collection(db,'submissions'));
    const event = doc(collection(db,'events'));
    const batch = writeBatch(db);
    batch.set(submission, { formId:formSnap.id, linkId:input.linkId, answers:input.answers, followUp:'pending', note:'', createdAt:serverTimestamp(), updatedAt:serverTimestamp() });
    batch.set(event, { formId:formSnap.id, linkId:input.linkId, type:'submit', createdAt:serverTimestamp() });
    await batch.commit();
    clearCache(); return { id:submission.id };
  }
  admin();
  if (parts[1] === 'admins' && parts.length === 2 && method === 'GET') { owner(); return { admins:rows(await getDocs(collection(db,'admins'))).sort((a,b)=>String(a.username).localeCompare(String(b.username))) }; }
  if (parts[1] === 'admins' && parts.length === 2 && method === 'POST') {
    owner();const username=String(input.username||'').trim();const password=String(input.password||'');
    if(!/^[A-Za-z0-9._-]{3,40}$/.test(username))throw new Error('Username can use letters, numbers, dot, dash, or underscore.');
    if(password.length<10)throw new Error('Use a password with at least 10 characters.');
    const provisioningApp=initializeApp(firebaseConfig,`provisioning-${Date.now()}`);const provisioningAuth=getAuth(provisioningApp);
    let created;try{created=await createUserWithEmailAndPassword(provisioningAuth,usernameToEmail(username),password);}finally{await signOut(provisioningAuth).catch(()=>{});}
    const profile={username,active:true,createdAt:serverTimestamp(),createdBy:session.uid};const batch=writeBatch(db);batch.set(doc(db,'admins',created.user.uid),profile);batch.set(doc(collection(db,'audit')),auditRow('admin.created',{username,uid:created.user.uid}));await batch.commit();return {admin:{uid:created.user.uid,...profile}};
  }
  if (parts[1] === 'admins' && parts.length === 3 && method === 'PATCH') { owner();const ref=doc(db,'admins',parts[2]);await updateDoc(ref,{active:input.active===true,updatedAt:serverTimestamp(),updatedBy:session.uid});await addDoc(collection(db,'audit'),auditRow('admin.access.updated',{uid:parts[2],active:input.active===true}));return {ok:true}; }
  if (parts[1] === 'admin-logins' && method === 'GET') { owner();return {logins:rows(await getDocs(collection(db,'adminLogins'))).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))).slice(0,250)}; }
  if (parts[1] === 'account' && parts[2] === 'password' && method === 'POST') { const current=String(input.currentPassword||''),next=String(input.nextPassword||'');if(session?.isSuperAdmin)throw new Error('The Google super admin password is managed by Google.');if(next.length<10)throw new Error('Use a new password with at least 10 characters.');await reauthenticateWithCredential(uid(),EmailAuthProvider.credential(uid().email,current));await updatePassword(uid(),next);await addDoc(collection(db,'audit'),auditRow('admin.password.changed',{}));return {ok:true}; }
  if (parts[1] === 'forms' && parts.length === 2 && method === 'GET') { const data = await all(); return { forms:data.forms.map(f => summary(data,f)) }; }
  if (parts[1] === 'forms' && parts.length === 2 && method === 'POST') { const id = slug(input.name); const existing = await getDoc(doc(db,'forms',id)); if (existing.exists()) throw new Error('A form with this title already exists'); const form = { slug:id, name:input.name, description:input.description || '', status:input.status || 'draft', candidate:input.candidate || '', promoter:input.promoter || '', candidateImage:input.candidateImage || '', promoterImage:input.promoterImage || '', theme:input.theme || {}, experience:input.experience || {}, fields:input.fields, createdAt:serverTimestamp(), updatedAt:serverTimestamp() }; const batch = writeBatch(db); batch.set(doc(db,'forms',id),form); batch.set(doc(collection(db,'audit')),auditRow('form.created',{formId:id})); await batch.commit(); clearCache(); return { form:{ id, ...form } }; }
  if (parts[1] === 'forms' && parts.length === 3 && method === 'PATCH') { const ref = doc(db,'forms',parts[2]); const batch = writeBatch(db); batch.update(ref, { name:input.name, description:input.description, status:input.status, candidate:input.candidate, promoter:input.promoter, candidateImage:input.candidateImage || '', promoterImage:input.promoterImage || '', theme:input.theme || {}, experience:input.experience || {}, fields:input.fields, updatedAt:serverTimestamp() }); batch.set(doc(collection(db,'audit')),auditRow('form.updated',{formId:parts[2]})); await batch.commit(); clearCache(); return { form:{ ...input, id:parts[2], slug:parts[2] } }; }
  if (parts[1] === 'links' && parts.length === 2 && method === 'GET') { const data = await all(); return { links:data.links.map(l => { const e = data.events.filter(x => x.linkId === l.id); return { ...l, formName:data.forms.find(f => f.id === l.formId)?.name || '', views:e.filter(x => x.type === 'view').length, starts:e.filter(x => x.type === 'start').length, shares:e.filter(x => x.type === 'share').length }; }) }; }
  if (parts[1] === 'links' && parts.length === 2 && method === 'POST') { const form = await getDoc(doc(db,'forms',input.formId)); if (!form.exists() || form.data().status !== 'published') throw new Error('Publish the form before creating a link'); const link = { formId:input.formId, name:input.name, createdAt:serverTimestamp() }; const ref = doc(collection(db,'links')); const batch = writeBatch(db); batch.set(ref,link); batch.set(doc(collection(db,'audit')),auditRow('link.created',{linkId:ref.id,formId:input.formId})); await batch.commit(); clearCache(); return { link:{ id:ref.id, ...link } }; }
  if (parts[1] === 'submissions' && parts.length === 2 && method === 'GET') { const data = await all(); return { submissions:data.submissions, total:data.submissions.length }; }
  if (parts[1] === 'submissions' && parts.length === 3 && method === 'PATCH') { const batch = writeBatch(db); batch.update(doc(db,'submissions',parts[2]),{ followUp:input.followUp, updatedAt:serverTimestamp() }); batch.set(doc(collection(db,'audit')),auditRow('submission.updated',{submissionId:parts[2],followUp:input.followUp})); await batch.commit(); clearCache(); return { ok:true }; }
  if (parts[1] === 'applications' && parts.length === 2 && method === 'GET') {
    const applications = rows(await getDocs(collection(db,'applications'))).sort((a,b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    const enriched = await Promise.all(applications.map(async application => ({ ...application, documents:rows(await getDocs(collection(db,'applications',application.id,'documents'))) })));
    return { applications:enriched };
  }
  if (parts[1] === 'form18-config' && method === 'GET') { const snap=await getDoc(doc(db,'form18Config','default')); return { config:snap.exists()?normalize(snap.data()):{} }; }
  if (parts[1] === 'form18-config' && method === 'PATCH') { const config={ title:String(input.title||'').slice(0,140), subtitle:String(input.subtitle||'').slice(0,300), consent:String(input.consent||'').slice(0,600), privacyNote:String(input.privacyNote||'').slice(0,400), documents:input.documents||{}, updatedAt:serverTimestamp() }; await setDoc(doc(db,'form18Config','default'),config,{merge:true}); await setDoc(doc(collection(db,'audit')),auditRow('form18.config.updated',{})); return { config }; }
  if (parts[1] === 'analytics' && method === 'GET') return metrics(await all());
  if (parts[1] === 'audit' && method === 'GET') { owner(); return { audit:rows(await getDocs(collection(db,'audit'))) }; }
  throw new Error('Unsupported operation');
}
export async function downloadDocument(path, filename='document') { admin(); const blob=await getBlob(ref(storage,path)); const url=URL.createObjectURL(blob); const anchor=document.createElement('a');anchor.href=url;anchor.download=filename;anchor.style.display='none';document.body.appendChild(anchor);anchor.click();setTimeout(()=>{anchor.remove();URL.revokeObjectURL(url);},5000); }
export async function viewDocument(path) { admin(); const viewer=window.open('about:blank','_blank');try{const url=await getDownloadURL(ref(storage,path));if(viewer)viewer.location.replace(url);else window.location.assign(url);}catch(error){viewer?.close();throw error;} }
export async function applicationExportData(applications) {
  admin();
  const exported=await Promise.all(applications.map(async application=>({
    ...application,
    documents:await Promise.all((application.documents||[]).map(async item=>({ ...item, shareUrl:item.storagePath?await getDownloadURL(ref(storage,item.storagePath)):'' })))
  })));
  await addDoc(collection(db,'audit'),auditRow('applications.exported',{count:exported.length}));clearCache();return exported;
}
