import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = await initializeTestEnvironment({ projectId:'demo-campaignos-rules', firestore:{ rules:readFileSync(path.join(root,'firestore.rules'),'utf8') } });
test.after(async () => env.cleanup());
await env.withSecurityRulesDisabled(async ctx => {
  const db = ctx.firestore();
  await setDoc(doc(db,'forms','graduate-voter'),{ status:'published', name:'Graduate Voter Registration' });
  await setDoc(doc(db,'links','link_main'),{ formId:'graduate-voter', name:'Main' });
});

test('public can open a published form and submit, but cannot read submissions', async () => {
  const db = env.unauthenticatedContext().firestore();
  await assertSucceeds(getDoc(doc(db,'forms','graduate-voter')));
  await assertSucceeds(getDoc(doc(db,'links','link_main')));
  await assertFails(getDocs(collection(db,'submissions')));
  const batch = writeBatch(db);
  batch.set(doc(collection(db,'submissions')),{
    formId:'graduate-voter',linkId:'link_main',answers:{status:'registered',name:'QA',phone:'9876543210',mandal:'Chevella'},followUp:'pending',note:'',createdAt:serverTimestamp(),updatedAt:serverTimestamp()
  });
  batch.set(doc(collection(db,'events')),{formId:'graduate-voter',linkId:'link_main',type:'submit',createdAt:serverTimestamp()});
  await assertSucceeds(batch.commit());
});

test('only verified owner can list submissions', async () => {
  const owner = env.authenticatedContext('owner',{ email:'gopalakrishnachennu@gmail.com', email_verified:true }).firestore();
  const other = env.authenticatedContext('other',{ email:'other@example.com', email_verified:true }).firestore();
  await assertSucceeds(getDocs(collection(owner,'submissions')));
  await assertFails(getDocs(collection(other,'submissions')));
  await assertSucceeds(setDoc(doc(owner,'audit','owner_action'),{action:'form.updated',createdAt:serverTimestamp()}));
  await assertSucceeds(getDocs(collection(owner,'audit')));
  await assertFails(getDocs(collection(other,'audit')));
});

test('anonymous voter owns one private graduate application and owner can review it', async () => {
  const voter = env.authenticatedContext('voter-session').firestore();
  const other = env.authenticatedContext('different-voter').firestore();
  const owner = env.authenticatedContext('owner',{ email:'gopalakrishnachennu@gmail.com', email_verified:true }).firestore();
  const application = doc(voter,'applications','application_private');
  await assertSucceeds(setDoc(application,{
    ownerUid:'voter-session',formId:'graduate-voter',linkId:'link_main',schemaVersion:3,status:'DRAFT',mobile:'9876543210',consentVersion:'test-basic-intake',consentAccepted:true,extractedFields:{},confirmedFields:{fullName:{value:'QA Graduate'}},missingFields:[],declarations:{detailsConfirmed:true},mappingStatus:'manual',createdAt:serverTimestamp(),updatedAt:serverTimestamp()
  }));
  await assertSucceeds(getDoc(application));
  await assertFails(getDoc(doc(other,'applications','application_private')));
  await assertFails(getDocs(collection(voter,'applications')));
  await assertSucceeds(getDocs(collection(owner,'applications')));
  await assertSucceeds(setDoc(doc(voter,'applications','application_private','documents','degree'),{storagePath:'applications/voter-session/application_private/degree/file.jpg',uploadStatus:'complete'}));
  await assertFails(getDoc(doc(other,'applications','application_private','documents','degree')));
  await assertSucceeds(getDoc(doc(owner,'applications','application_private','documents','degree')));
});
