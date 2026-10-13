export async function buildApplicationsPdf(PDFLib,applications,fields,documentTypes,getValue){
  const {PDFDocument,StandardFonts,rgb,PDFName,PDFString}=PDFLib;
  const pdf=await PDFDocument.create();
  const load=async path=>new Uint8Array(await (await fetch(path)).arrayBuffer());
  const [candidateBytes,promoterBytes]=await Promise.all([load('assets/sama-ram-mohan-reddy.jpg'),load('assets/chevula-ajay-reddy.png')]);
  const [candidate,promoter,regular,bold]=await Promise.all([pdf.embedJpg(candidateBytes),pdf.embedPng(promoterBytes),pdf.embedFont(StandardFonts.Helvetica),pdf.embedFont(StandardFonts.HelveticaBold)]);
  const green=rgb(.055,.29,.19),orange=rgb(.88,.35,.14),ink=rgb(.12,.18,.15),muted=rgb(.39,.46,.41),line=rgb(.84,.87,.84),soft=rgb(.965,.975,.965),linkBlue=rgb(.08,.34,.62),white=rgb(1,1,1);
  const unicodeText=value=>String(value??'').replace(/[^\x20-\x7E]/g,'').replace(/\s+/g,' ').trim();const valueFont=()=>regular;
  const fitImage=(page,image,x,y,w,h)=>{const scale=Math.min(w/image.width,h/image.height);const width=image.width*scale,height=image.height*scale;page.drawRectangle({x:x-3,y:y-3,width:w+6,height:h+6,color:white,borderColor:line,borderWidth:1});page.drawImage(image,{x:x+(w-width)/2,y:y+(h-height)/2,width,height});};
  const addLink=(page,x,y,width,height,url)=>{if(!url)return;const annotation=pdf.context.register(pdf.context.obj({Type:PDFName.of('Annot'),Subtype:PDFName.of('Link'),Rect:[x,y,x+width,y+height],Border:[0,0,0],A:{Type:PDFName.of('Action'),S:PDFName.of('URI'),URI:PDFString.of(url)}}));page.node.addAnnot(annotation);};
  const drawText=(page,text,options={})=>{const value=unicodeText(text)||'-';page.drawText(value,{font:options.font||valueFont(value),size:options.size||9,color:options.color||ink,...options});};
  const drawHeader=page=>{
    page.drawRectangle({x:0,y:704,width:595.28,height:137,color:soft});page.drawRectangle({x:0,y:704,width:595.28,height:5,color:orange});
    fitImage(page,candidate,38,741,62,78);fitImage(page,promoter,505,747,52,66);
    drawText(page,'MLC CANDIDATE',{x:38,y:724,font:bold,size:7,color:orange});drawText(page,'Sama Ram Mohan Reddy',{x:38,y:712,font:bold,size:8.2,color:green});
    drawText(page,'CAMPAIGN PROMOTER',{x:468,y:730,font:bold,size:6.4,color:muted});drawText(page,'Chevula Ajay Reddy',{x:468,y:718,font:bold,size:7.5,color:green});
    drawText(page,'GRADUATE VOTER',{x:176,y:786,font:bold,size:18,color:green});drawText(page,'APPLICATION REPORT',{x:179,y:764,font:bold,size:18,color:green});
    drawText(page,'Private campaign administration export',{x:194,y:744,font:regular,size:7.5,color:muted});
  };
  const drawField=(page,x,y,width,label,value)=>{page.drawRectangle({x,y:y-34,width,height:39,color:white,borderColor:line,borderWidth:.7});drawText(page,label.toUpperCase(),{x:x+10,y:y-10,font:bold,size:6.5,color:muted});const shown=unicodeText(value)||'-';drawText(page,shown.length>42?`${shown.slice(0,41)}...`:shown,{x:x+10,y:y-27,font:valueFont(shown),size:9,color:ink,maxWidth:width-20});};
  for(let index=0;index<applications.length;index++){
    const application=applications[index],page=pdf.addPage([595.28,841.89]);drawHeader(page);
    const name=getValue(application,'fullName')||'Unnamed voter';drawText(page,name,{x:38,y:674,font:valueFont(name),size:16,color:green,maxWidth:350});
    page.drawRectangle({x:412,y:659,width:145,height:28,color:application.status==='DOCUMENTS_RECEIVED'?rgb(.90,.96,.91):rgb(1,.94,.89)});drawText(page,String(application.status||'DRAFT').replaceAll('_',' '),{x:424,y:670,font:bold,size:7.5,color:application.status==='DOCUMENTS_RECEIVED'?green:orange});
    drawText(page,'REFERENCE',{x:38,y:648,font:bold,size:6.5,color:muted});drawText(page,application.id,{x:91,y:647,font:regular,size:8,color:ink});drawText(page,`APPLICATION ${index+1} OF ${applications.length}`,{x:454,y:648,font:bold,size:6.5,color:muted});
    const columns=[38,306],width=251;let y=617;for(let i=0;i<fields.length;i+=2){const left=fields[i],right=fields[i+1];drawField(page,columns[0],y,width,left[1],getValue(application,left[0]));if(right)drawField(page,columns[1],y,width,right[1],getValue(application,right[0]));y-=47;}
    drawText(page,'UPLOADED DOCUMENTS',{x:38,y:y-2,font:bold,size:9,color:green});drawText(page,'Use the named links below to open each stored file.',{x:166,y:y-2,font:regular,size:7.5,color:muted});y-=22;
    const documents=application.documents||[];for(const [type,label] of documentTypes){const item=documents.find(document=>document.id===type);if(!item)continue;page.drawRectangle({x:38,y:y-22,width:519,height:29,color:soft,borderColor:line,borderWidth:.6});drawText(page,label,{x:49,y:y-11,font:bold,size:8,color:ink});drawText(page,item.originalFilename||type,{x:183,y:y-11,font:regular,size:7.3,color:muted,maxWidth:205});const anchor=`Open ${label}`;drawText(page,anchor,{x:444,y:y-11,font:bold,size:7.8,color:linkBlue});page.drawLine({start:{x:444,y:y-13},end:{x:444+bold.widthOfTextAtSize(anchor,7.8),y:y-13},thickness:.5,color:linkBlue});addLink(page,440,y-17,112,17,item.shareUrl);y-=34;}
    drawText(page,`Generated ${new Date().toLocaleString('en-IN')} - Confidential voter information`,{x:38,y:28,font:regular,size:6.8,color:muted});drawText(page,`Page ${index+1} of ${applications.length}`,{x:502,y:28,font:bold,size:6.8,color:muted});
  }
  pdf.setTitle('Graduate Voter Applications');pdf.setSubject('Private two-column campaign administration report with named document links');pdf.setProducer('CampaignOS');return pdf.save();
}
