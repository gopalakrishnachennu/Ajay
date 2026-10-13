import fs from 'node:fs';
import path from 'node:path';
import * as PDFLib from 'pdf-lib';
import { buildForm18Pdf } from '../dist/form18-pdf.js';
import { form18Fields } from '../dist/form18-schema.js';

const values = Object.fromEntries(form18Fields.map(field => [field.key, ({
  graduateConstituency:'Mahabubnagar-Ranga Reddy-Hyderabad Graduates Constituency',district:'Ranga Reddy',fullName:'Sample Applicant',relativeName:'Sample Parent',relationType:'Father',sex:'Male',dob:'1995-08-15',qualification:'Bachelor of Technology',university:'Jawaharlal Nehru Technological University Hyderabad',passingYear:'2018',occupation:'Software professional',houseNumber:'1-2-345',street:'Sample Colony',town:'Chevella',postOffice:'Chevella',mandal:'Chevella',state:'Telangana',pincode:'501503',epicNumber:'ABC1234567',aadhaarProvided:'I prefer not to provide Aadhaar',mobile:'9876543210',previousGraduateRoll:'No',place:'Chevella',signatureName:'Sample Applicant'
})[field.key] || 'Not provided']));
const bytes = await buildForm18Pdf(PDFLib, values, form18Fields, ['Degree certificate','Passport-size photo']);
const output = path.resolve('output/pdf/form18-prepared-sample.pdf');
fs.mkdirSync(path.dirname(output),{recursive:true});
fs.writeFileSync(output,bytes);
console.log(output);
