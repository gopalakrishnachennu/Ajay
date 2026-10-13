const root = document.getElementById('app');
const toastBox = document.getElementById('toast');
const cloudMode = /(?:\.web\.app|\.firebaseapp\.com)$/.test(location.hostname);
let cloud = null;
const state = { page: 'Overview', forms: [], links: [], submissions: [], applications: [], form18Config: {}, analytics: null, audit: [], editing: null, editorImages: {}, filter: 'all', query: '', publicForm: null, publicLink: null, answer: {}, step: 0, reviewing: false, editingFromReview: false, started: false, sending: false, receipt: null, showLogin: false };
const nav = ['Overview', 'Forms', 'Form builder', 'Applications', 'Form 18 setup', 'Responses', 'Analytics', 'Activity'];
const $ = id => document.getElementById(id);
const html = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const date = value => value ? new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
const publicUrl = (form, link) => `${location.origin}/?form=${encodeURIComponent(form.slug)}&link=${encodeURIComponent(link.id)}&v=20261013f`;
const defaultExperience = {
  brandTitle: 'Graduate voter help', brandSubtitle: 'Telangana MLC election', kicker: 'TELANGANA · MLC',
  headlineMain: 'We’ll help you', headlineAccent: 'get started.',
  candidateLabel: 'CONGRESS MLC CANDIDATE', promoterLabel: 'CAMPAIGN PROMOTER',
  privacyLabel: 'PRIVATE', headerTrust: 'Private response', helperText: 'A few easy steps. You can check everything before sending.',
  selectPrompt: 'Tap to choose', optionalHint: 'You can skip this.', phoneHint: 'Your phone may suggest a saved number.',
  backButton: 'Back', continueButton: 'Continue', reviewButton: 'Check my answers', changeButton: 'Change',
  reviewTitle: 'Does everything look right?', reviewHint: 'Tap “Change” to fix an answer.', reviewNotice: 'Our team will review your details. Election officials decide voter-list registration.',
  submitButton: 'Send my details', successTitle: 'Thank you. We got your details.',
  successText: 'Our team will contact you if anything else is needed.', successKicker: 'RESPONSE RECEIVED', receiptLabel: 'Reference', shareButton: 'Share this form'
};
const experience = form => ({ ...defaultExperience, ...(form?.experience || {}) });
const defaultTheme = { primary:'#104c34', accent:'#d86c3b', background:'#f7f4ec' };
const theme = form => Object.fromEntries(Object.entries(defaultTheme).map(([key,fallback]) => [key, /^#[0-9a-fA-F]{6}$/.test(form?.theme?.[key] || '') ? form.theme[key] : fallback]));
const photoSrc = (value, fallback) => typeof value === 'string' && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(value) ? value : fallback;
function toast(message) { toastBox.textContent = message; toastBox.classList.add('show'); clearTimeout(toastBox._timer); toastBox._timer = setTimeout(() => toastBox.classList.remove('show'), 3200); }
async function request(url, options = {}) { if (cloud) return cloud.request(url, options); const response = await fetch(url, { credentials: 'same-origin', ...options }); const data = await response.json().catch(() => ({})); if (!response.ok) throw Object.assign(new Error(data.error || 'Request failed'), { status: response.status }); return data; }
const send = (url, method, data) => request(url, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });
function slugForm(id) { return state.forms.find(f => f.id === id); }
function formOptions() { return state.forms.filter(f => f.status === 'published').map(f => `<option value="${html(f.id)}">${html(f.name)}</option>`).join(''); }
function starterFields() { return [
  { key: 'status', type: 'choice', label: 'Is your name on the graduate voter list?', options: ['registered', 'new'], optionLabels: { registered: 'Yes, my name is on the list', new: 'No, I need help' }, help: 'Choose the answer that fits you.', required: true, when: null },
  { key: 'name', type: 'text', label: 'What is your full name?', placeholder: 'Your full name', options: [], required: true, when: null },
  { key: 'phone', type: 'phone', label: 'What is your mobile number?', help: 'We may call you about this request.', placeholder: '10-digit mobile number', options: [], required: true, when: null },
  { key: 'mandal', type: 'text', label: 'Which mandal do you live in?', placeholder: 'Type your mandal', options: [], required: true, when: null },
  { key: 'qualification', type: 'text', label: 'What degree did you complete?', placeholder: 'For example, B.A. or B.Tech', options: [], required: true, when: 'new' },
  { key: 'graduation', type: 'year', label: 'What year did you graduate?', placeholder: 'For example, 2020', options: [], required: true, when: 'new' }
]; }
function metric(label, number, note) { return `<div class="metric"><div class="metric-head"><span>${label}</span></div><div class="metric-num">${number}</div><div class="metric-foot">${note}</div></div>`; }
function empty(title, detail) { return `<div class="empty-state"><div class="empty-symbol">✦</div><h3>${title}</h3><p>${detail}</p></div>`; }
function shell(content) { return `<div class="app-shell"><aside class="sidebar"><div class="brand"><div class="brand-mark">✦</div><div class="brand-name">CampaignOS<span class="brand-sub">FORM OPERATIONS</span></div></div><div class="workspace"><div class="workspace-avatar">SR</div><div class="workspace-text">Graduate Voter Drive<span>Telangana · 2026</span></div></div><div class="nav-label">Workspace</div><nav class="nav">${nav.map((name, i) => `<button class="${state.page === name ? 'active' : ''}" data-page="${name}" aria-label="${name}"><span class="nav-icon">${['⌂','▦','✎','◇','⚙','▤','◔','◷'][i]}</span><span>${name}</span></button>`).join('')}</nav><div class="side-footer">Campaign forms and outreach<div class="user-row"><div class="user-avatar">CA</div><span>Owner workspace</span></div></div></aside><section class="main"><header class="topbar"><div class="crumb">CampaignOS <span style="margin:0 7px;color:#b4beb6">/</span> <strong>${state.page}</strong></div><div class="top-actions"><button class="button button-quiet" data-action="logout">Sign out</button></div></header>${content}</section></div>`; }
function header(kicker, title, description, button = '') { return `<div class="page-head"><div><div class="page-kicker">${kicker}</div><h1>${title}</h1><p>${description}</p></div>${button}</div>`; }
function overview() { const a = state.analytics || {}; const recent = a.recent || []; const prepared=state.applications.filter(row=>row.status==='FORM_PREPARED').length; const review=state.applications.filter(row=>row.status==='NEEDS_REVIEW'||row.documents?.some(doc=>doc.extractionStatus==='failed')).length; return shell(`<main class="page">${header('Campaign workspace · live data','Form operations','Create forms, distribute links, and follow each application.', '<button class="button button-primary" data-action="new-form">＋ Create form</button>')}<div class="metric-grid">${metric('Form 18 applications',state.applications.length,'Secure document journeys')}${metric('Forms prepared',prepared,'Ready for applicant download')}${metric('Needs review',review,'OCR or missing-detail follow-up')}${metric('Existing voter responses',a.submissions || 0,'Simple form responses')}</div><div class="section-grid"><section class="panel"><div class="panel-head"><h2>Collection funnel</h2><span class="panel-note">Measured from your links</span></div>${funnel(a)}</section><section class="panel"><div class="panel-head"><h2>Distribution</h2><span class="panel-note">Current links</span></div><div class="funnel"><div class="funnel-row"><span>Links</span><strong>${a.links || 0}</strong></div><div class="funnel-row"><span>Share taps</span><strong>${a.shares || 0}</strong></div><div class="funnel-row"><span>No visits</span><strong>${a.unopenedLinks || 0}</strong></div></div><p class="panel-note" style="margin-top:18px">A recipient who cannot open a link cannot be detected from the webpage. “No visits” counts created links with no recorded open.</p></section></div><section class="panel table-panel"><div class="panel-head"><h2>Recent existing-voter responses</h2><button class="button button-quiet" data-page="Responses">View all →</button></div>${recent.length ? responseTable(recent, false) : empty('No responses yet','Share a published form link to begin collecting responses.')}</section></main>`); }
function funnel(a) { const max = Math.max(a.views || 0, 1); return `<div class="funnel">${[['Opened',a.views || 0],['Started',a.starts || 0],['Submitted',a.submissions || 0]].map(([label,n]) => `<div class="funnel-row"><span>${label}</span><div class="funnel-track"><div class="funnel-fill" style="width:${Math.min(100, n / max * 100)}%"></div></div><span class="funnel-num">${n}</span></div>`).join('')}</div>`; }
function formsPage() { return shell(`<main class="page">${header('Forms & distribution','Your forms','Each published form can have several trackable links.', '<button class="button button-primary" data-action="new-form">＋ Create form</button>')}<div class="form-library">${state.forms.map(f => `<article class="form-card"><div class="form-card-top"><span class="pill ${f.status === 'draft' ? 'yellow' : ''}">${html(f.status)}</span><span class="panel-note">${f.submissions} responses</span></div><h3>${html(f.name)}</h3><p>${html(f.description || 'No description yet')}</p><div class="form-card-foot"><span class="form-url">${f.links} link${f.links === 1 ? '' : 's'} · ${f.views} opens</span><button class="button button-quiet" data-action="edit-form" data-id="${f.id}">Edit →</button></div></article>`).join('') || empty('No forms yet','Create your first form to start.')} </div><section class="panel table-panel"><div class="panel-head"><h2>Distribution links</h2><button class="button button-primary" data-action="new-link" ${state.forms.length ? '' : 'disabled'}>＋ Create link</button></div>${state.links.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>Name</th><th>Form</th><th>Opens</th><th>Starts</th><th>Shares</th><th>Actions</th></tr></thead><tbody>${state.links.map(l => `<tr><td>${html(l.name)}</td><td>${html(l.formName)}</td><td>${l.views}</td><td>${l.starts}</td><td>${l.shares}</td><td><button class="button button-quiet" data-action="copy-link" data-id="${l.id}">Copy link</button> <button class="button button-quiet" data-action="open-link" data-id="${l.id}">Open ↗</button></td></tr>`).join('')}</tbody></table></div>` : empty('No links yet','Create a distribution link for a published form.')}</section></main>`); }
function responseTable(rows, detailed = true) { return `<div class="table-wrap"><table class="data-table"><thead><tr><th>Name</th><th>Phone</th><th>Mandal</th><th>Path</th><th>Received</th>${detailed ? '<th>Follow-up</th>' : ''}</tr></thead><tbody>${rows.map(s => `<tr><td>${html(s.answers.name || '—')}</td><td>${html(s.answers.phone || '—')}</td><td>${html(s.answers.mandal || '—')}</td><td><span class="pill ${s.answers.status === 'new' ? 'orange' : ''}">${s.answers.status === 'new' ? 'Needs registration' : 'Registered'}</span></td><td>${date(s.createdAt)}</td>${detailed ? `<td><select class="follow-select" data-id="${s.id}"><option value="pending" ${s.followUp === 'pending' ? 'selected' : ''}>Pending</option><option value="contacted" ${s.followUp === 'contacted' ? 'selected' : ''}>Contacted</option><option value="complete" ${s.followUp === 'complete' ? 'selected' : ''}>Complete</option></select></td>` : ''}</tr>`).join('')}</tbody></table></div>`; }
function responsesPage() { const filtered = state.submissions.filter(s => (state.filter === 'all' || s.answers.status === state.filter) && (!state.query || Object.values(s.answers).some(v => String(v).toLowerCase().includes(state.query.toLowerCase())))); return shell(`<main class="page">${header('Responses · live data','Collected responses','Search and follow up with people who are already registered.')}<section class="panel"><div class="panel-head"><h2>${filtered.length} response${filtered.length === 1 ? '' : 's'}</h2><div class="table-actions"><select id="responseFilter"><option value="all" ${state.filter === 'all' ? 'selected' : ''}>All paths</option><option value="registered" ${state.filter === 'registered' ? 'selected' : ''}>Registered</option><option value="new" ${state.filter === 'new' ? 'selected' : ''}>Needs registration</option></select><input id="responseSearch" aria-label="Search responses" placeholder="Search responses" value="${html(state.query)}"></div></div>${filtered.length ? responseTable(filtered) : empty('No matching responses','Try another filter or share the form link.')}</section></main>`); }

function confirmedValue(application,key) { return application.confirmedFields?.[key]?.value || application.extractedFields?.[key]?.value || (key === 'mobile' ? application.mobile : ''); }
function applicationsPage() {
  const cards=state.applications.map(application=>`<details class="application-card"><summary><div><span class="pill ${application.status==='FORM_PREPARED'?'':'orange'}">${html(application.status || 'DRAFT')}</span><h3>${html(confirmedValue(application,'fullName') || 'Name not confirmed')}</h3><p>${html(application.mobile || '—')} · ${html(confirmedValue(application,'mandal') || 'Mandal pending')}</p></div><div class="application-count">${application.documents?.length || 0}<small>documents</small></div></summary><div class="application-body"><div class="application-meta"><span>Reference<strong>${html(application.id)}</strong></span><span>District<strong>${html(confirmedValue(application,'district') || 'Pending')}</strong></span><span>Constituency<strong>${html(confirmedValue(application,'graduateConstituency') || 'Pending mapping')}</strong></span></div><div class="document-list">${(application.documents||[]).map(item=>`<button class="button button-quiet" data-action="download-document" data-path="${html(item.storagePath)}" data-name="${html(item.originalFilename || item.id)}">${html(item.id.replaceAll('_',' '))} · ${html(item.extractionStatus || item.uploadStatus)} ↓</button>`).join('') || '<span>No documents uploaded</span>'}${application.generatedFormPath?`<button class="button button-primary" data-action="download-document" data-path="${html(application.generatedFormPath)}" data-name="Form-18-${html(application.id)}.pdf">Prepared Form 18 ↓</button>`:''}</div></div></details>`).join('');
  return shell(`<main class="page">${header('Secure applications','Form 18 applications','Review document progress, OCR results and prepared applications.')}<div class="application-list">${cards || empty('No applications yet','People who choose “No, I need help” will appear here.')}</div></main>`);
}
function form18SetupPage() {
  const c=state.form18Config||{}; const docs=c.documents||{}; const docRows=[['aadhaar_front','Aadhaar front'],['aadhaar_back','Aadhaar back'],['voter_id','Voter ID / EPIC'],['degree','Degree certificate'],['photo','Passport photo']].map(([key,label])=>`<div class="workflow-doc"><label>${label} label<input data-doc-label="${key}" value="${html(docs[key]?.label || label)}"></label><label>Help text<input data-doc-hint="${key}" value="${html(docs[key]?.hint || '')}"></label><label class="check-label"><input type="checkbox" data-doc-required="${key}" ${docs[key]?.required?'checked':''}> Required</label></div>`).join('');
  return shell(`<main class="page">${header('Form 18 workflow','Application setup','Edit the words and document requirements used by the secure application journey.')}<section class="panel workflow-settings"><label>Page heading<input id="workflowTitle" value="${html(c.title||'Prepare your Graduate Voter Form 18')}"></label><label>Introduction<textarea id="workflowSubtitle">${html(c.subtitle||'Upload your documents. We will read what we can and ask only for missing details.')}</textarea></label><label>Consent text<textarea id="workflowConsent">${html(c.consent||'I agree to secure document processing only to prepare my Form 18 application.')}</textarea></label><label>Privacy note<textarea id="workflowPrivacy">${html(c.privacyNote||'Your documents are private.')}</textarea></label><div class="panel-head editor-section-head"><h2>Document slots</h2></div>${docRows}<div class="builder-foot"><span>Mandal and constituency mappings remain pluggable until verified data is supplied.</span><button class="button button-primary" data-action="save-form18-config">Save workflow</button></div></section></main>`);
}
function analyticsPage() { const a = state.analytics || {}; const days = Object.entries(a.byDay || {}).sort(([x],[y]) => x.localeCompare(y)).slice(-14); const mandals = Object.entries(a.mandals || {}).sort((x,y) => y[1]-x[1]); return shell(`<main class="page">${header('Analytics · recorded events','Track the journey','See how many people opened, started, and completed your forms.')}<div class="metric-grid">${metric('Opens',a.views || 0,'Link visit events')}${metric('Starts',a.starts || 0,'First answer selected')}${metric('Submissions',a.submissions || 0,'Saved responses')}${metric('Share taps',a.shares || 0,'Share action in the form')}</div><div class="analytics-grid" style="margin-top:16px"><section class="panel"><div class="panel-head"><h2>Funnel</h2></div>${funnel(a)}</section><section class="panel"><div class="panel-head"><h2>Responses by mandal</h2></div>${mandals.length ? mandals.map(([name,n]) => `<div class="funnel-row"><span>${html(name)}</span><div class="funnel-track"><div class="funnel-fill" style="width:${Math.round(n / a.submissions * 100)}%"></div></div><span class="funnel-num">${n}</span></div>`).join('') : empty('No mandal data yet','Mandal counts appear after people submit.')}</section></div><section class="panel table-panel"><div class="panel-head"><h2>Daily activity</h2></div>${days.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>Day</th><th>Opens</th><th>Starts</th><th>Submissions</th></tr></thead><tbody>${days.map(([d,v]) => `<tr><td>${d}</td><td>${v.views}</td><td>${v.starts}</td><td>${v.submissions}</td></tr>`).join('')}</tbody></table></div>` : empty('No activity yet','Opens and submissions will be recorded here.')}</section></main>`); }
function activityPage() {
  const names = { 'form.created':'Form created', 'form.updated':'Form updated', 'link.created':'Distribution link created', 'submission.created':'Response received', 'submission.updated':'Follow-up updated', 'admin.login':'Owner signed in' };
  const rows = [...state.audit].sort((a, b) => String(b.at || b.createdAt).localeCompare(String(a.at || a.createdAt))).slice(0, 100);
  return shell(`<main class="page">${header('Activity · operator audit','Activity trail','Changes to forms, links, responses and follow-ups are recorded here.')}<section class="panel">${rows.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>When</th><th>Action</th><th>Record</th></tr></thead><tbody>${rows.map(row => `<tr><td>${date(row.at || row.createdAt)}</td><td>${html(names[row.action] || row.action)}</td><td>${html(row.detail?.formId || row.detail?.linkId || row.detail?.submissionId || row.detail?.email || '—')}</td></tr>`).join('')}</tbody></table></div>` : empty('No operator activity yet','Create or update a form to start the trail.')}</section></main>`);
}
function questionEditor(field, i) {
  const choices = (field.options || []).map(value => field.optionLabels?.[value] ? `${value} | ${field.optionLabels[value]}` : value).join('\n');
  return `<article class="editor-question" data-index="${i}"><div class="editor-question-top"><strong>Question ${i+1}</strong><div class="q-actions"><button type="button" data-action="move-question" data-index="${i}" data-direction="up" aria-label="Move question up">↑</button><button type="button" data-action="move-question" data-index="${i}" data-direction="down" aria-label="Move question down">↓</button><button type="button" data-action="remove-question" data-index="${i}" aria-label="Remove question">×</button></div></div><div class="editor-row"><label>Field key<input class="q-key" value="${html(field.key)}" ${field.key === 'status' ? 'readonly' : ''}></label><label>Answer style<select class="q-type"><option value="text" ${field.type === 'text' ? 'selected' : ''}>Short answer</option><option value="phone" ${field.type === 'phone' ? 'selected' : ''}>Phone</option><option value="year" ${field.type === 'year' ? 'selected' : ''}>Year</option><option value="choice" ${field.type === 'choice' ? 'selected' : ''}>Large tap choices</option><option value="select" ${field.type === 'select' ? 'selected' : ''}>Dropdown</option></select></label></div><label>Question shown to voters<input class="q-label" value="${html(field.label)}"></label><div class="editor-row"><label>Short help text<input class="q-help" value="${html(field.help || '')}" placeholder="Optional"></label><label>Input hint<input class="q-placeholder" value="${html(field.placeholder || '')}" placeholder="Optional"></label></div><label>Choices · one per line, written as stored value | voter-facing label<textarea class="q-options" placeholder="yes | Yes, I am on the list">${html(choices)}</textarea></label><div class="editor-row"><label>Show this question to<select class="q-when"><option value="" ${!field.when ? 'selected' : ''}>Everyone</option><option value="registered" ${field.when === 'registered' ? 'selected' : ''}>Already registered</option><option value="new" ${field.when === 'new' ? 'selected' : ''}>Needs help registering</option></select></label><label class="check-label"><input type="checkbox" class="q-required" ${field.required ? 'checked' : ''}> Required</label></div></article>`;
}
const experienceInputs = [
  ['brandTitle','Header title'], ['brandSubtitle','Header subtitle'], ['kicker','Small heading'],
  ['headlineMain','Main headline'], ['headlineAccent','Headline highlight'],
  ['candidateLabel','Candidate label'], ['promoterLabel','Promoter label'],
  ['privacyLabel','Privacy badge'], ['headerTrust','Header trust label'], ['helperText','Short introduction'],
  ['selectPrompt','Dropdown prompt'], ['optionalHint','Optional answer hint'], ['phoneHint','Phone hint'],
  ['backButton','Back button'], ['continueButton','Continue button'], ['reviewButton','Review button'], ['changeButton','Change button'],
  ['reviewTitle','Review heading'], ['reviewHint','Review help'], ['reviewNotice','Before-submit explanation'],
  ['submitButton','Submit button'], ['successKicker','Thank-you label'], ['successTitle','Thank-you heading'],
  ['successText','Thank-you message'], ['receiptLabel','Reference label'], ['shareButton','Share button']
];
function builderPage() {
  const f = state.editing || state.forms[0];
  if (!f) return shell(`<main class="page">${header('Form builder','Create a form','Build a clear journey one question at a time.')}<button class="button button-primary" data-action="new-form">Create form</button></main>`);
  const copy = experience(f);
  const colors = theme(f);
  const portraits = [
    ['candidateImage','Candidate photo','assets/sama-ram-mohan-reddy.jpg'],
    ['promoterImage','Promoter photo','assets/chevula-ajay-reddy.png']
  ].map(([key,label,fallback]) => `<label class="portrait-editor"><img id="${key}Preview" src="${photoSrc(state.editorImages[key] || f[key],fallback)}" alt="${label}"><span>${label}<small>JPG, PNG or WebP · compressed before saving</small><input id="${key}Upload" type="file" accept="image/jpeg,image/png,image/webp"></span></label>`).join('');
  return shell(`<main class="page">${header('Form builder',state.editing ? 'Edit your form' : 'Build your form','Every word and question below can be changed.', '<button class="button button-quiet" data-action="preview-form">Open live form ↗</button>')}<div class="builder-layout"><section class="panel"><h2>Form setup</h2><div class="editor-row"><label>Admin title<input id="formName" value="${html(f.name)}"></label><label>Publication<select id="formStatus"><option value="draft" ${f.status === 'draft' ? 'selected' : ''}>Draft</option><option value="published" ${f.status === 'published' ? 'selected' : ''}>Published</option></select></label></div><label>Admin description<textarea id="formDescription">${html(f.description || '')}</textarea></label><div class="editor-row"><label>Candidate name<input id="candidateName" value="${html(f.candidate || '')}"></label><label>Promoter name<input id="promoterName" value="${html(f.promoter || '')}"></label></div><div class="portrait-editors">${portraits}</div><div class="panel-head editor-section-head"><h2>Form colors</h2></div><div class="theme-editors"><label>Main green<input type="color" data-theme="primary" value="${colors.primary}"></label><label>Highlight<input type="color" data-theme="accent" value="${colors.accent}"></label><label>Background<input type="color" data-theme="background" value="${colors.background}"></label></div><div class="panel-head editor-section-head"><h2>Words voters see</h2></div><div class="editor-row">${experienceInputs.map(([key,label]) => `<label>${label}<input data-experience="${key}" value="${html(copy[key])}"></label>`).join('')}</div><div class="panel-head editor-section-head"><h2>Questions</h2><button class="button button-quiet" data-action="add-question">＋ Add question</button></div><p class="section-intro">Tap choices advance automatically. Use the arrows to change question order. “Needs help registering” questions are shown only on that path.</p><div id="editorQuestions">${f.fields.map(questionEditor).join('')}</div><div class="builder-foot"><span class="save-state">${f.status === 'published' ? 'Published form' : 'Draft form'}</span><button class="button button-primary" data-action="save-form">Save changes</button></div></section><aside class="panel"><h2>Good to know</h2><p class="section-intro">The public form shows one clear question at a time, followed by a review screen. Phone browsers may suggest a saved number; websites cannot read SIM numbers.</p><p class="section-intro">The secure registration-help journey is managed under “Form 18 setup.” Documents are private and OCR runs only after each completed upload.</p></aside></div></main>`);
}
function renderAdmin() { const content = state.page === 'Forms' ? formsPage() : state.page === 'Form builder' ? builderPage() : state.page === 'Applications' ? applicationsPage() : state.page === 'Form 18 setup' ? form18SetupPage() : state.page === 'Responses' ? responsesPage() : state.page === 'Analytics' ? analyticsPage() : state.page === 'Activity' ? activityPage() : overview(); root.innerHTML = content; bindAdmin(); }
function loginScreen() { root.innerHTML = `<div class="login-shell"><div class="login-card"><div class="brand"><div class="brand-mark">✦</div><div class="brand-name">CampaignOS<span class="brand-sub">FORM OPERATIONS</span></div></div><div class="page-kicker">Owner access</div><h1>Sign in to manage forms.</h1><p>Create forms, distribute links, collect responses, and track follow-ups.</p><form id="loginForm">${cloudMode ? '' : '<label>Email<input name="email" type="email" autocomplete="username" required></label><label>Password<input name="password" type="password" autocomplete="current-password" required></label>'}<p class="form-error" id="loginError"></p><button class="button button-primary" type="submit">${cloudMode ? 'Continue with Google →' : 'Sign in →'}</button></form></div></div>`; $('loginForm').onsubmit = async e => { e.preventDefault(); try { await send('/api/auth/login', 'POST', cloudMode ? {} : Object.fromEntries(new FormData(e.target))); await loadAdmin(); } catch (err) { $('loginError').textContent = err.message; } }; }
async function loadAdmin() { try { await request('/api/me'); const [forms, links, submissions, applications, config, analytics, audit] = await Promise.all([request('/api/forms'), request('/api/links'), request('/api/submissions'), request('/api/applications'), request('/api/form18-config'), request('/api/analytics'), request('/api/audit')]); state.forms = forms.forms; state.links = links.links; state.submissions = submissions.submissions; state.applications=applications.applications;state.form18Config=config.config; state.analytics = analytics; state.audit = audit.audit; if (state.editing) state.editing = state.forms.find(f => f.id === state.editing.id) || null; renderAdmin(); } catch (err) { if (err.status === 401) loginScreen(); else { root.innerHTML = `<div class="load-error"><h2>Could not load the workspace</h2><p>${html(err.message)}</p><button class="button button-primary" onclick="location.reload()">Retry</button></div>`; } } }
function collectEditor() {
  const f = state.editing || state.forms[0];
  const fields = [...document.querySelectorAll('.editor-question')].map((el, i) => {
    const pairs = el.querySelector('.q-options').value.split('\n').map(line => line.trim()).filter(Boolean).map(line => {
      const divider = line.indexOf('|'); return divider < 0 ? [line,line] : [line.slice(0,divider).trim(),line.slice(divider+1).trim()];
    });
    const type = el.querySelector('.q-type').value;
    return { key: el.querySelector('.q-key').value.trim() || `question_${i+1}`, type, label: el.querySelector('.q-label').value.trim(), help: el.querySelector('.q-help').value.trim(), placeholder: el.querySelector('.q-placeholder').value.trim(), options: pairs.map(([value]) => value), optionLabels: Object.fromEntries(pairs), when: el.querySelector('.q-when').value || null, required: el.querySelector('.q-required').checked, autocomplete: type === 'phone' ? 'tel-national' : el.querySelector('.q-key').value === 'name' ? 'name' : null };
  });
  const copy = Object.fromEntries([...document.querySelectorAll('[data-experience]')].map(el => [el.dataset.experience,el.value.trim()]));
  const colors = Object.fromEntries([...document.querySelectorAll('[data-theme]')].map(el => [el.dataset.theme,el.value]));
  const input = { name: $('formName').value.trim(), description: $('formDescription').value.trim(), status: $('formStatus').value, candidate: $('candidateName').value.trim(), promoter: $('promoterName').value.trim(), candidateImage: state.editorImages.candidateImage || f?.candidateImage || '', promoterImage: state.editorImages.promoterImage || f?.promoterImage || '', theme: colors, experience: copy, fields, id: f?.id };
  checkEditor(input); return input;
}
function checkEditor(input) { if (!input.name) throw new Error('Form title is required'); if (!input.fields.length) throw new Error('Add at least one question'); const keys = new Set(); for (const f of input.fields) { if (!/^[A-Za-z0-9_]+$/.test(f.key) || keys.has(f.key)) throw new Error('Each question needs a unique field key'); keys.add(f.key); if (!f.label) throw new Error('Every question needs question text'); if (['choice','select'].includes(f.type) && (f.options.length < 2 || f.options.some(value => !value || !f.optionLabels[value]))) throw new Error(`${f.label} needs at least two complete choices`); } if (input.fields.some(f => f.when) && !input.fields.some(f => f.key === 'status' && f.type === 'choice' && f.options.includes('registered') && f.options.includes('new'))) throw new Error('Conditional questions need a status choice with registered and new options'); }
function bindAdmin() { root.querySelectorAll('[data-page]').forEach(el => el.onclick = () => { state.page = el.dataset.page; renderAdmin(); }); root.querySelectorAll('[data-action]').forEach(el => el.onclick = () => action(el.dataset)); const filter = $('responseFilter'); if (filter) filter.onchange = e => { state.filter = e.target.value; renderAdmin(); }; const search = $('responseSearch'); if (search) search.oninput = e => { const cursor = e.target.selectionStart; state.query = e.target.value; renderAdmin(); const input = $('responseSearch'); input.focus(); input.setSelectionRange(cursor, cursor); }; root.querySelectorAll('.follow-select').forEach(el => el.onchange = async () => { try { await send(`/api/submissions/${el.dataset.id}`, 'PATCH', { followUp: el.value }); toast('Follow-up updated'); await loadAdmin(); } catch (err) { toast(err.message); } }); for (const key of ['candidateImage','promoterImage']) { const input = $(`${key}Upload`); if (input) input.onchange = async () => { try { const file = input.files?.[0]; if (!file) return; state.editorImages[key] = await compressPortrait(file); $(`${key}Preview`).src = state.editorImages[key]; toast('Photo ready. Save the form to publish it.'); } catch (err) { toast(err.message); input.value = ''; } }; } }
function renumberQuestions() { [...document.querySelectorAll('.editor-question')].forEach((el,i) => { el.dataset.index = i; el.querySelector('strong').textContent = `Question ${i+1}`; el.querySelectorAll('[data-index]').forEach(button => button.dataset.index = i); }); }
async function compressPortrait(file) {
  if (!['image/jpeg','image/png','image/webp'].includes(file.type)) throw new Error('Choose a JPG, PNG or WebP photo');
  if (file.size > 8 * 1024 * 1024) throw new Error('Choose a photo under 8 MB');
  const url = URL.createObjectURL(file);
  try {
    const img = new Image(); img.src = url; await img.decode();
    const scale = Math.min(1, 640 / img.naturalWidth, 760 / img.naturalHeight);
    const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(img.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    const encoded = canvas.toDataURL('image/jpeg', .76);
    if (encoded.length > 220_000) throw new Error('This photo is too detailed. Please choose a smaller one.');
    return encoded;
  } finally { URL.revokeObjectURL(url); }
}
async function action(data) {
  const kind = data.action;
  try {
    if (kind === 'logout') { await send('/api/auth/logout', 'POST', {}); loginScreen(); return; }
    if (kind === 'new-form') {
      state.editing = { id: null, name: '', description: '', status: 'draft', candidate: '', promoter: '', theme: { ...defaultTheme }, experience: { ...defaultExperience }, fields: starterFields() };
      state.editorImages = {};
      state.page = 'Form builder'; renderAdmin(); return;
    }
    if (kind === 'edit-form') { state.editing = slugForm(data.id); state.editorImages = {}; state.page = 'Form builder'; renderAdmin(); return; }
    if (kind === 'add-question') {
      const index = document.querySelectorAll('.editor-question').length;
      $('editorQuestions').insertAdjacentHTML('beforeend', questionEditor({ key: `question_${index+1}`, type: 'text', label: '', required: true, options: [], when: null }, index));
      renumberQuestions(); bindAdmin(); return;
    }
    if (kind === 'remove-question') {
      if (document.querySelectorAll('.editor-question').length <= 1) return toast('A form needs at least one question');
      root.querySelector(`.editor-question[data-index="${data.index}"]`)?.remove(); renumberQuestions(); return;
    }
    if (kind === 'move-question') {
      const item = root.querySelector(`.editor-question[data-index="${data.index}"]`);
      const neighbor = data.direction === 'up' ? item?.previousElementSibling : item?.nextElementSibling;
      if (!item || !neighbor) return;
      if (data.direction === 'up') neighbor.before(item); else neighbor.after(item);
      renumberQuestions(); return;
    }
    if (kind === 'save-form') {
      const input = collectEditor();
      const saved = input.id ? await send(`/api/forms/${input.id}`, 'PATCH', input) : await send('/api/forms', 'POST', input);
      state.editing = saved.form; toast('Form saved'); await loadAdmin(); return;
    }
    if (kind === 'preview-form') {
      const f = state.editing || state.forms[0];
      const link = state.links.find(l => l.formId === f?.id);
      if (!link) return toast('Publish the form and create a link first');
      window.open(publicUrl(f, link), '_blank', 'noopener'); return;
    }
    if (kind === 'new-link') { if (!formOptions()) return toast('Publish a form first'); showLinkModal(); return; }
    if (kind === 'download-document') { if (!cloud) throw new Error('Secure downloads are available on Firebase Hosting'); await cloud.downloadDocument(data.path,data.name); return; }
    if (kind === 'save-form18-config') {
      const documents=Object.fromEntries(['aadhaar_front','aadhaar_back','voter_id','degree','photo'].map(key=>[key,{ label:document.querySelector(`[data-doc-label="${key}"]`).value.trim(), hint:document.querySelector(`[data-doc-hint="${key}"]`).value.trim(), required:document.querySelector(`[data-doc-required="${key}"]`).checked }]));
      await send('/api/form18-config','PATCH',{title:$('workflowTitle').value.trim(),subtitle:$('workflowSubtitle').value.trim(),consent:$('workflowConsent').value.trim(),privacyNote:$('workflowPrivacy').value.trim(),documents}); toast('Form 18 workflow saved'); await loadAdmin(); return;
    }
    if (kind === 'copy-link' || kind === 'open-link') {
      const link = state.links.find(l => l.id === data.id);
      const form = slugForm(link?.formId);
      if (!form || !link) return;
      const url = publicUrl(form, link);
      if (kind === 'copy-link') { await navigator.clipboard.writeText(url); toast('Link copied'); }
      else window.open(url, '_blank', 'noopener');
      return;
    }
  } catch (err) { toast(err.message); }
}
function showLinkModal() { const backdrop = document.createElement('div'); backdrop.className = 'modal-backdrop'; backdrop.innerHTML = `<form class="modal" id="linkForm"><h2>Create a distribution link</h2><p>Give each outreach channel or team its own link so you can measure opens and responses.</p><label>Form<select name="formId">${formOptions()}</select></label><label>Link name<input name="name" placeholder="Example: Chevella WhatsApp group" required></label><div class="modal-row"><button class="button button-quiet" type="button" id="closeModal">Cancel</button><button class="button button-primary" type="submit">Create link</button></div></form>`; document.body.appendChild(backdrop); $('closeModal').onclick = () => backdrop.remove(); $('linkForm').onsubmit = async e => { e.preventDefault(); try { const data = Object.fromEntries(new FormData(e.target)); await send('/api/links', 'POST', data); backdrop.remove(); toast('Link created'); await loadAdmin(); } catch (err) { toast(err.message); } }; }

function currentQuestions() { return state.publicForm.fields.filter(f => !f.when || f.when === state.answer.status); }
function answerLabel(field, value) { return field.optionLabels?.[value] || (field.key === 'status' ? ({ registered:'Yes, my name is on the list', new:'No, I need help' })[value] : '') || value; }
function publicShell(inner) {
  const f = state.publicForm;
  const copy = experience(f);
  const colors = theme(f);
  const questions = currentQuestions();
  const total = questions.length + 1;
  const count = state.reviewing ? total : Math.min(state.step + 1, questions.length);
  const percent = state.receipt ? 100 : Math.round((count / total) * 100);
  return `<div class="public-shell ${!state.receipt && (state.step > 0 || state.reviewing) ? 'is-flowing' : ''}" style="--public-green:${colors.primary};--public-orange:${colors.accent};--public-cream:${colors.background}">
    <div class="public-progress" style="width:${percent}%"></div>
    <header class="public-header"><div class="public-brand"><b>✦</b><span>${html(copy.brandTitle)}<small>${html(copy.brandSubtitle)}</small></span></div><span class="header-trust">${html(copy.headerTrust)}</span></header>
    <main class="public-main">
      <div class="public-intro">
        <div class="kicker"><span class="kicker-dot"></span> ${html(copy.kicker)}</div>
        <h1>${html(copy.headlineMain)} <em>${html(copy.headlineAccent)}</em></h1>
        <p class="public-helper">${html(copy.helperText)}</p>
        <div class="public-people">
          <div class="public-candidate"><div class="candidate-photo"><img src="${photoSrc(f.candidateImage,'assets/sama-ram-mohan-reddy.jpg')}" alt="${html(f.candidate)}"></div><div><span class="candidate-label">${html(copy.candidateLabel)}</span><strong>${html(f.candidate)}</strong></div></div>
          <div class="public-promoter"><div class="promoter-photo"><img src="${photoSrc(f.promoterImage,'assets/chevula-ajay-reddy.png')}" alt="${html(f.promoter)}"></div><div><span>${html(copy.promoterLabel)}</span><strong>${html(f.promoter)}</strong></div></div>
        </div>
      </div>
      <div class="public-form-wrap"><section class="public-form" aria-live="polite"><div class="public-form-top"><span>${state.receipt ? 'DONE' : state.reviewing ? 'CHECK YOUR DETAILS' : `STEP ${count} OF ${total}`}</span><span class="privacy-chip">${html(copy.privacyLabel)}</span></div><div class="step-track" aria-hidden="true"><span style="width:${percent}%"></span></div>${inner}</section></div>
    </main>
  </div>`;
}
function publicView() {
  const copy = experience(state.publicForm);
  if (state.receipt) {
    root.innerHTML = publicShell(`<div class="success-view"><div class="success-icon">✓</div><div class="page-kicker">${html(copy.successKicker)}</div><h2>${html(copy.successTitle)}</h2><p>${html(copy.successText)}</p><p class="receipt-id">${html(copy.receiptLabel)}: <strong>${html(state.receipt.id)}</strong></p><button class="button button-quiet" id="shareButton">${html(copy.shareButton)} ↗</button></div>`);
    $('shareButton').onclick = sharePublic; return;
  }
  const fields = currentQuestions();
  if (state.reviewing) {
    const rows = fields.map((field,index) => `<div class="review-row"><span>${html(field.label)}</span><strong>${html(answerLabel(field,state.answer[field.key] || '—'))}</strong><button type="button" data-edit="${index}" aria-label="${html(copy.changeButton)} ${html(field.label)}">${html(copy.changeButton)}</button></div>`).join('');
    root.innerHTML = publicShell(`<div class="review-view"><span class="review-icon">✓</span><h2>${html(copy.reviewTitle)}</h2><p class="review-intro">${html(copy.reviewHint)}</p><div class="review-list">${rows}</div><p class="submit-disclosure">${html(copy.reviewNotice)}</p><p id="publicError" class="form-error" role="alert"></p><div class="public-actions"><button type="button" class="public-back" id="backButton">← ${html(copy.backButton)}</button><button type="button" class="button button-primary" id="submitButton">${html(copy.submitButton)} →</button></div></div>`);
    root.querySelectorAll('[data-edit]').forEach(el => el.onclick = () => { state.reviewing = false; state.editingFromReview = true; state.step = Number(el.dataset.edit); publicView(); focusQuestion(); });
    $('backButton').onclick = () => { state.reviewing = false; state.step = fields.length - 1; publicView(); focusQuestion(); };
    $('submitButton').onclick = submitPublic; return;
  }
  const field = fields[state.step];
  if (!field) { state.step = Math.max(0, fields.length - 1); return publicView(); }
  const value = state.answer[field.key] || '';
  let control;
  if (field.type === 'choice') {
    control = field.options.map((option, index) => `<button type="button" class="big-choice" data-choice="${html(option)}"><span class="choice-index">${String(index + 1).padStart(2, '0')}</span><span class="choice-copy">${html(answerLabel(field,option))}</span><span class="choice-arrow">→</span></button>`).join('');
  } else if (field.type === 'select') {
    control = `<select id="publicInput" name="${html(field.key)}" aria-label="${html(field.label)}"><option value="">${html(copy.selectPrompt)}</option>${field.options.map(option => `<option value="${html(option)}" ${option === value ? 'selected' : ''}>${html(answerLabel(field,option))}</option>`).join('')}</select>`;
  } else {
    control = `<input id="publicInput" name="${html(field.key)}" value="${html(value)}" type="${field.type === 'phone' ? 'tel' : 'text'}" inputmode="${field.type === 'phone' ? 'tel' : field.type === 'year' ? 'numeric' : 'text'}" autocomplete="${field.autocomplete || 'on'}" ${field.type === 'phone' ? 'maxlength="16"' : field.type === 'year' ? 'maxlength="4"' : ''} placeholder="${html(field.placeholder || (field.type === 'phone' ? '10-digit mobile number' : 'Type your answer'))}">`;
  }
  const note = field.help || (field.type === 'phone' ? copy.phoneHint : field.required ? '' : copy.optionalHint);
  const last = state.step === fields.length - 1;
  const actions = field.type === 'choice' && state.step === 0 ? '' : `<div class="public-actions"><button type="button" class="public-back" id="backButton">← ${html(copy.backButton)}</button>${field.type === 'choice' ? '' : `<button type="submit" class="button button-primary" id="nextButton">${html(last ? copy.reviewButton : copy.continueButton)} →</button>`}</div>`;
  root.innerHTML = publicShell(`<div class="question-area"><h2>${html(field.label)}</h2>${note ? `<p class="form-note">${html(note)}</p>` : ''}<form id="publicQuestionForm"><div class="public-question">${control}</div><p id="publicError" class="form-error" role="alert"></p>${actions}</form></div>`);
  root.querySelectorAll('[data-choice]').forEach(el => el.onclick = () => advance(el.dataset.choice));
  if ($('backButton')) $('backButton').onclick = () => { if (state.step > 0) { state.editingFromReview = false; state.step--; publicView(); focusQuestion(); } };
  $('publicQuestionForm').onsubmit = event => { event.preventDefault(); if ($('publicInput')) advance($('publicInput').value); };
  if (field.type === 'select') $('publicInput').onchange = event => { if (event.target.value) advance(event.target.value); };
}
function focusQuestion() {
  if (matchMedia('(max-width: 760px)').matches) requestAnimationFrame(() => root.querySelector('.public-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
}
async function advance(value) {
  const field = currentQuestions()[state.step];
  const answer = String(value || '').trim();
  if (field.required && !answer) { $('publicError').textContent = 'Please fill this in to continue.'; return; }
  if (field.type === 'phone' && answer && !/^(?:\+?91[ -]?)?[6-9]\d{9}$/.test(answer.replace(/[ -]/g, ''))) { $('publicError').textContent = 'Please enter a 10-digit mobile number.'; return; }
  if (field.type === 'year' && answer && !/^(19|20)\d{2}$/.test(answer)) { $('publicError').textContent = 'Please enter a 4-digit year.'; return; }
  state.answer[field.key] = answer;
  if (field.key === 'status' && answer === 'new') {
    location.href = `/?apply=form18&link=${encodeURIComponent(state.publicLink.id)}&v=20261013f`;
    return;
  }
  if (!state.started) {
    state.started = true;
    send(`/api/public/links/${state.publicLink.id}/events`, 'POST', { type: 'start' }).catch(() => {});
  }
  if (state.editingFromReview) {
    state.editingFromReview = false;
    const missing = currentQuestions().findIndex(question => question.required && !state.answer[question.key]);
    if (missing >= 0) state.step = missing; else state.reviewing = true;
  } else if (state.step >= currentQuestions().length - 1) state.reviewing = true;
  else state.step++;
  publicView(); focusQuestion();
}
async function submitPublic() {
  if (state.sending) return;
  state.sending = true;
  const button = $('submitButton'); button.disabled = true; button.textContent = 'Sending…';
  try {
    const answers = Object.fromEntries(currentQuestions().map(question => [question.key, state.answer[question.key] || '']));
    state.receipt = await send(`/api/public/forms/${state.publicForm.slug}/submissions`, 'POST', { linkId: state.publicLink.id, answers });
    publicView(); focusQuestion();
  } catch (err) { $('publicError').textContent = err.message; button.disabled = false; button.textContent = experience(state.publicForm).submitButton; }
  finally { state.sending = false; }
}
async function sharePublic() { const url = location.href; try { if (navigator.share) await navigator.share({ title: state.publicForm.name, url }); else { await navigator.clipboard.writeText(url); toast('Link copied'); } await send(`/api/public/links/${state.publicLink.id}/events`, 'POST', { type: 'share' }); } catch (err) { if (err.name !== 'AbortError') toast('Sharing was not completed'); } }
async function loadPublic() {
  const params = new URLSearchParams(location.search);
  const slug = params.get('form'), linkId = params.get('link');
  try {
    if (!slug || !linkId) throw new Error('A valid distribution link is required');
    const [form, link] = await Promise.all([request(`/api/public/forms/${encodeURIComponent(slug)}`), request(`/api/public/links/${encodeURIComponent(linkId)}`)]);
    if (link.formId !== form.id) throw new Error('This link does not belong to this form');
    state.publicForm = form; state.publicLink = link;
    root.innerHTML = '<div class="load-error">Opening form…</div>';
    await send(`/api/public/links/${encodeURIComponent(linkId)}/events`, 'POST', { type: 'view' });
    publicView();
  } catch (err) { root.innerHTML = `<div class="load-error"><h2>This form is unavailable</h2><p>${html(err.message)}</p></div>`; }
}
async function boot() {
  const params = new URLSearchParams(location.search);
  if (params.get('apply') === 'form18') {
    try { const flow = await import('./form18-mode.js?v=20261013f'); await flow.startForm18(); }
    catch (err) { root.innerHTML = `<div class="load-error"><h2>Secure application could not open</h2><p>${html(err.message)}</p></div>`; }
    return;
  }
  if (cloudMode) { try { cloud = await import('./firebase-mode.js?v=20261013f'); await cloud.ready; } catch (err) { root.innerHTML = `<div class="load-error"><h2>Firebase connection failed</h2><p>${html(err.message)}</p></div>`; return; } }
  if (params.has('form')) loadPublic(); else loadAdmin();
}
boot();
