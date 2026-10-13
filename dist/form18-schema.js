export const schemaVersion = 2;

export const defaultConfig = {
  title: 'Prepare your Graduate Voter Form 18',
  subtitle: 'Upload your documents. We will read what we can and ask only for missing details.',
  consent: 'I agree to the secure processing of my documents and, if I provide Aadhaar, the complete Aadhaar number only to prepare my Form 18 application. I understand that I must review the details before the form is generated.',
  privacyNote: 'Your documents and Aadhaar details are stored privately and are visible only to your secure browser session and the authorised campaign owner.',
  documents: {
    aadhaar_front: { label:'Aadhaar front', hint:'Optional - upload any clear image or PDF', required:false, accept:'image/*,application/pdf' },
    aadhaar_back: { label:'Aadhaar back', hint:'Optional - upload any clear image or PDF', required:false, accept:'image/*,application/pdf' },
    voter_id: { label:'Voter ID / EPIC', hint:'Optional - upload any clear image or PDF', required:false, accept:'image/*,application/pdf' },
    degree: { label:'Degree certificate', hint:'Required - upload any clear image or PDF', required:true, accept:'image/*,application/pdf' },
    photo: { label:'Passport-size photo', hint:'Required - upload a clear image or PDF', required:true, accept:'image/*,application/pdf' }
  },
  mappingVersion: 'pending',
  postalMap: {},
  constituencyMap: {}
};

export const form18Fields = [
  { key:'graduateConstituency', label:'Graduate constituency', group:'Application', required:true, mapping:'constituency' },
  { key:'district', label:'District', group:'Application', required:true, mapping:'postal' },
  { key:'fullName', label:'Full name in English', group:'Personal details', required:true, autocomplete:'name' },
  { key:'nameTelugu', label:'Full name in Telugu', group:'Personal details' },
  { key:'surname', label:'Surname in English', group:'Personal details' },
  { key:'surnameTelugu', label:'Surname in Telugu', group:'Personal details' },
  { key:'relativeName', label:"Father's / Mother's / Husband's name", group:'Personal details', required:true },
  { key:'relativeSurname', label:"Relative's surname", group:'Personal details' },
  { key:'relationType', label:'Relationship', group:'Personal details', required:true, type:'select', options:['Father','Mother','Husband','Wife','Guardian','Other'] },
  { key:'sex', label:'Gender', group:'Personal details', required:true, type:'select', options:['Male','Female','Third gender'] },
  { key:'dob', label:'Date of birth', group:'Personal details', required:true, type:'date' },
  { key:'qualification', label:'Educational qualification', group:'Education', required:true },
  { key:'qualificationTelugu', label:'Qualification in Telugu', group:'Education' },
  { key:'university', label:'University / institution', group:'Education', required:true },
  { key:'passingYear', label:'Year of passing', group:'Education', required:true, type:'year' },
  { key:'passingDate', label:'Date of passing, if shown', group:'Education', type:'date' },
  { key:'equivalentCertificate', label:'Equivalent diploma / certificate details', group:'Education' },
  { key:'occupation', label:'Occupation', group:'Personal details', required:true },
  { key:'disability', label:'Disability, if any', group:'Personal details' },
  { key:'houseNumber', label:'House / door number', group:'Present ordinary residence', required:true },
  { key:'street', label:'Street / area / locality', group:'Present ordinary residence', required:true },
  { key:'town', label:'Town / village', group:'Present ordinary residence', required:true },
  { key:'postOffice', label:'Post office', group:'Present ordinary residence', required:true, mapping:'postal' },
  { key:'mandal', label:'Tehsil / taluka / mandal', group:'Present ordinary residence', required:true, mapping:'postal' },
  { key:'state', label:'State', group:'Present ordinary residence', required:true, defaultValue:'Telangana' },
  { key:'pincode', label:'Pincode', group:'Present ordinary residence', required:true, inputmode:'numeric' },
  { key:'assemblyConstituency', label:'Assembly constituency', group:'Existing voter details', mapping:'constituency' },
  { key:'epicNumber', label:'EPIC number', group:'Existing voter details' },
  { key:'pollingStation', label:'Polling station / part number, if known', group:'Existing voter details' },
  { key:'serialNumber', label:'Serial number in polling station, if known', group:'Existing voter details' },
  { key:'aadhaarProvided', label:'Aadhaar option', group:'Aadhaar details', required:true, type:'select', options:['Yes','I do not have an Aadhaar number','I prefer not to provide Aadhaar'] },
  { key:'aadhaarNumber', label:'Aadhaar number (12 digits)', group:'Aadhaar details', inputmode:'numeric', sensitive:true },
  { key:'mobile', label:'Mobile number', group:'Contact', required:true, type:'phone', autocomplete:'tel-national' },
  { key:'email', label:'Email ID, if available', group:'Contact', type:'email', autocomplete:'email' },
  { key:'previousGraduateRoll', label:'Already registered in another graduates roll?', group:'Declarations', required:true, type:'select', options:['No','Yes'] },
  { key:'previousGraduateRollDetails', label:'Previous graduates roll and address, if applicable', group:'Declarations' },
  { key:'place', label:'Place of declaration', group:'Declarations', required:true },
  { key:'signatureName', label:'Type your full name as your signature', group:'Declarations', required:true }
];

export const requiredKeys = form18Fields.filter(field => field.required).map(field => field.key);

export function applyReferenceMappings(values, config = defaultConfig) {
  const next = { ...values };
  const pincode = String(values.pincode || '').trim();
  const postal = config.postalMap?.[pincode];
  if (postal) for (const key of ['district','postOffice','mandal','state']) if (!next[key] && postal[key]) next[key] = postal[key];
  const locationKey = [next.district,next.mandal,next.town].filter(Boolean).join('|').toLowerCase();
  const mapped = config.constituencyMap?.[locationKey] || config.constituencyMap?.[pincode];
  if (mapped) for (const key of ['graduateConstituency','assemblyConstituency']) if (!next[key] && mapped[key]) next[key] = mapped[key];
  return next;
}
