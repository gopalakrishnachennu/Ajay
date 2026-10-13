export async function buildForm18Pdf(PDFLib, values, fields, attachedDocuments = []) {
  const { PDFDocument, StandardFonts, rgb } = PDFLib;
  const pdf=await PDFDocument.create(); const regular=await pdf.embedFont(StandardFonts.Helvetica); const bold=await pdf.embedFont(StandardFonts.HelveticaBold);
  const green=rgb(.06,.30,.20), orange=rgb(.84,.36,.14), ink=rgb(.12,.18,.15), line=rgb(.82,.85,.82);
  const pageSize=[595.28,841.89]; let page,y,pageNumber=0;
  const footer=()=>{page.drawText(`Prepared Form 18 application · Page ${pageNumber}`,{x:42,y:26,font:regular,size:7.5,color:rgb(.40,.44,.41)});};
  const newPage=(title)=>{if(page)footer();page=pdf.addPage(pageSize);pageNumber++;y=790;page.drawText('FORM 18',{x:42,y,font:bold,size:18,color:green});page.drawText('Claim for inclusion in the electoral roll for a Graduates Constituency',{x:42,y:y-23,font:regular,size:9.5,color:ink});page.drawLine({start:{x:42,y:y-36},end:{x:553,y:y-36},thickness:2,color:orange});y-=62;if(title){page.drawText(title,{x:42,y,font:bold,size:13,color:green});y-=22;}};
  const wrap=(text,limit)=>{const lines=[];let rest=String(text||'');while(rest.length>limit){let cut=rest.lastIndexOf(' ',limit);if(cut<Math.floor(limit*.45))cut=limit;lines.push(rest.slice(0,cut));rest=rest.slice(cut).trim();}lines.push(rest);return lines;};
  const row=(label,value)=>{const labelLines=wrap(label,33),valueLines=wrap(value||'Not provided',62),used=Math.max(labelLines.length,valueLines.length);if(y-used*11<68)newPage('Application details continued');labelLines.forEach((part,index)=>page.drawText(part,{x:42,y:y-index*11,font:bold,size:8.5,color:ink,maxWidth:168}));valueLines.forEach((part,index)=>page.drawText(part,{x:220,y:y-index*11,font:regular,size:9,color:ink,maxWidth:330}));y-=used*11+9;page.drawLine({start:{x:42,y:y+5},end:{x:553,y:y+5},thickness:.5,color:line});};
  newPage('Applicant details');
  for(const field of fields) row(field.label,values[field.key]);
  if(y<180)newPage('Declarations and attachments');else{page.drawText('Declarations and attachments',{x:42,y,font:bold,size:13,color:green});y-=22;}
  row('Declaration date',new Date().toLocaleDateString('en-IN'));
  row('Application status','Prepared for applicant review - not submitted to election officials');
  row('Attached documents',attachedDocuments.join(', '));
  page.drawText('Applicant confirmation',{x:42,y:y-15,font:bold,size:10,color:green});
  page.drawText(`Signed electronically by typing: ${String(values.signatureName||'')}`,{x:42,y:y-34,font:regular,size:9,color:ink});
  page.drawText('This generated document is a preparation copy. Official acceptance is decided by the Electoral Registration Officer.',{x:42,y:45,font:regular,size:7.5,color:rgb(.35,.4,.37),maxWidth:500});
  footer();
  pdf.setTitle('Prepared Form 18 Application');pdf.setSubject('Graduate Constituency voter registration preparation copy');pdf.setProducer('CampaignOS');
  return pdf.save();
}
