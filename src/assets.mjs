import path from 'node:path';
import { existsSync, readFileSync, mkdirSync, writeFileSync, renameSync } from 'node:fs';
import sharp from 'sharp';
import { zipSync, strToU8 } from 'fflate';
import { AppError, hash, id, now, text } from './common.mjs';
import { optionalText } from './store.mjs';

export const IMAGE_LIMITS=Object.freeze({bytes:20*1024*1024,pixels:25_000_000});
export const VISION_COPY_POLICY=Object.freeze({format:'png',maxWidth:1024,maxHeight:1024,fit:'inside',withoutEnlargement:true,sharpVersion:sharp.versions.sharp});
const ratios={'1:1':[1080,1080],'4:5':[1080,1350],'9:16':[1080,1920]};
export function decodeBase64(value,max=IMAGE_LIMITS.bytes) {
  if(typeof value!=='string'||value.length>Math.ceil(max/3)*4||value.length%4||/[^A-Za-z0-9+/=]/.test(value))throw new AppError('invalid_file','Invalid or oversized base64 file.');
  const bytes=Buffer.from(value,'base64');if(!bytes.length||bytes.length>max||bytes.toString('base64')!==value)throw new AppError('invalid_file','Invalid or oversized base64 file.');return bytes;
}
export async function normalizeImage(bytes) {
  if(!Buffer.isBuffer(bytes)||!bytes.length||bytes.length>IMAGE_LIMITS.bytes)throw new AppError('invalid_image','Images must be smaller than 20 MiB.');
  const png=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  const jpeg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
  const webp=bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP';
  if(!png&&!jpeg&&!webp)throw new AppError('invalid_image','Use a PNG, JPEG, or WebP image.');
  try {
    const image=sharp(bytes,{limitInputPixels:IMAGE_LIMITS.pixels,failOn:'warning'}),metadata=await image.metadata();
    if((metadata.pages??1)!==1)throw new Error('Animated images are not supported.');
    const result=await image.rotate().png().toBuffer({resolveWithObject:true});
    if(result.data.length>IMAGE_LIMITS.bytes)throw new Error('Decoded image is too large.');
    return {bytes:result.data,width:result.info.width,height:result.info.height,mime:'image/png',inputHash:hash(bytes)};
  }catch{throw new AppError('invalid_image','The image could not be fully decoded within the size limits.');}
}
function escaped(value){return value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function brandHash(store,projectId){return hash([...new Map(store.rows('knowledge',projectId).filter(k=>k.kind==='brand'&&k.status==='confirmed').map(k=>[k.itemId,k.id])).values()]);}
export class AssetService {
  constructor(store){this.store=store;}
  read(projectId,assetId){
    const asset=this.store.record('assets',projectId,assetId),expected=path.join('projects',projectId,'assets',asset.id,'image.png');
    if(asset.artifactPath!==expected)throw new AppError('invalid_archive','The asset path failed validation.',500);
    let bytes;try{bytes=readFileSync(this.store.safePath(expected));}catch{throw new AppError('invalid_archive','The image file is missing or unreadable.',500);}
    if(hash(bytes)!==asset.artifactHash)throw new AppError('invalid_archive','The image hash does not match.',500);return bytes;
  }
  async visionInput(projectId,assetId){const original=this.read(projectId,assetId),result=await sharp(original,{limitInputPixels:IMAGE_LIMITS.pixels}).resize({width:VISION_COPY_POLICY.maxWidth,height:VISION_COPY_POLICY.maxHeight,fit:'inside',withoutEnlargement:true}).png().toBuffer({resolveWithObject:true});return {bytes:result.data,metadata:{assetId,sourceHash:hash(original),submittedHash:hash(result.data),width:result.info.width,height:result.info.height,policy:VISION_COPY_POLICY}};}
  snapshot(projectId,input){
    const set=this.store.writableSet(projectId,input.setId),brief=this.store.rows('briefs',projectId).filter(b=>b.setId===set.id).at(-1);
    const concept=this.store.record('concepts',projectId,input.conceptId);
    if(!this.store.setConcepts(projectId,set.id).includes(concept.id))throw new AppError('invalid_input','Add this idea version to the set before production.');
    return {setId:set.id,briefId:brief.id,conceptId:concept.id,brandHash:brandHash(this.store,projectId),brief,concept};
  }
  save(projectId,normalized,fields){
    this.store.assertWritable(projectId);
    const record={...fields,id:id(),mime:'image/png',width:normalized.width,height:normalized.height,inputHash:normalized.inputHash,createdAt:now(),schemaVersion:2};
    record.artifactPath=path.join('projects',projectId,'assets',record.id,'image.png');record.artifactHash=hash(normalized.bytes);record.contentHash=hash(record);
    const filename=this.store.safePath(record.artifactPath);mkdirSync(path.dirname(filename),{recursive:true});writeFileSync(filename+'.tmp',normalized.bytes,{flag:'wx'});
    if(hash(readFileSync(filename+'.tmp'))!==record.artifactHash)throw new AppError('archive_failed','Image write verification failed.',500);renameSync(filename+'.tmp',filename);
    this.store.transaction(()=>{this.store.db.prepare('INSERT INTO assets VALUES (?,?,?,?,?,?,?,?)').run(record.id,projectId,record.parentId??null,record.runId??null,record.setId??null,record.conceptId??null,record.briefId??null,JSON.stringify(record));for(const ref of new Set([record.composition?.visualId,record.composition?.logoId].filter(Boolean)))this.store.db.prepare('INSERT INTO asset_links VALUES (?,?,?)').run(projectId,record.id,ref);});return record;
  }
  async import(projectId,input){
    this.store.assertWritable(projectId);const name=text(input.name,'Image name',160),source=text(input.source,'Image source',500);
    const normalized=await normalizeImage(decodeBase64(input.base64));
    let snapshot=null;if(input.setId||input.conceptId)snapshot=this.snapshot(projectId,input);
    return this.save(projectId,normalized,{name,source,method:'imported',role:input.role==='logo'?'logo':'reference',parentId:null,runId:null,...(snapshot?{setId:snapshot.setId,briefId:snapshot.briefId,conceptId:snapshot.conceptId,snapshot}:{}),caption:optionalText(input.caption,'Caption',8000),style:optionalText(input.style,'Style',200),machineChecks:{decoded:true,metadataRemoved:true}});
  }
  async caption(projectId,assetId,input){
    const previous=this.store.record('assets',projectId,assetId),normalized=await normalizeImage(this.read(projectId,assetId));
    const {id:oldId,artifactPath,artifactHash,contentHash,createdAt,...fields}=previous;
    return this.save(projectId,normalized,{...fields,name:previous.name,parentId:previous.id,caption:text(input.caption,'Caption',8000),change:'caption_only',createdBy:'user'});
  }
  async compose(projectId,input){
    this.store.assertWritable(projectId);const snapshot=this.snapshot(projectId,input),visual=this.store.record('assets',projectId,input.visualId),logo=this.store.record('assets',projectId,input.logoId);
    const dimensions=ratios[input.ratio];if(!dimensions)throw new AppError('invalid_input','Choose 1:1, 4:5, or 9:16.');
    const font=input.font??'Arial';if(!['Arial','Georgia'].includes(font))throw new AppError('missing_font','This template supports installed Arial or Georgia.');
    const fontPath=path.join(process.env.WINDIR??'C:\\Windows','Fonts',font==='Arial'?'arial.ttf':'georgia.ttf');
    if(!existsSync(fontPath))throw new AppError('missing_font',`${font} is missing. Install that font or choose another supported font.`);
    const headline=text(input.headline,'Headline',300),cta=optionalText(input.cta,'CTA',100),[width,height]=dimensions,margin=64;
    const layers=[];
    const headlineLayer=await sharp({text:{text:escaped(headline),font:`${font} 56`,fontfile:fontPath,width:width-2*margin,rgba:true,dpi:72,wrap:'word-char'}}).png().toBuffer({resolveWithObject:true});
    if(headlineLayer.info.height>220||headlineLayer.info.width>width-2*margin)throw new AppError('text_overflow','The headline does not fit. Shorten it before composing.');
    layers.push({input:headlineLayer.data,left:margin,top:margin});
    const visualHeight=height-440;
    const visualLayer=await sharp(this.read(projectId,visual.id)).resize(width-2*margin,visualHeight,{fit:'contain',background:'#f8f5ed'}).png().toBuffer();
    layers.push({input:visualLayer,left:margin,top:300});
    const logoLayer=await sharp(this.read(projectId,logo.id)).resize(180,72,{fit:'contain',background:{r:248,g:245,b:237,alpha:0}}).png().toBuffer();
    layers.push({input:logoLayer,left:margin,top:height-104});
    if(cta){const ctaLayer=await sharp({text:{text:escaped(cta),font:`${font} 28`,fontfile:fontPath,width:width-2*margin-240,rgba:true,dpi:72}}).png().toBuffer({resolveWithObject:true});if(ctaLayer.info.height>72)throw new AppError('text_overflow','The CTA does not fit. Shorten it before composing.');layers.push({input:ctaLayer.data,left:304,top:height-100});}
    const bytes=await sharp({create:{width,height,channels:4,background:'#f8f5ed'}}).composite(layers).png().toBuffer();
    return this.save(projectId,{bytes,width,height,inputHash:hash({visual:visual.artifactHash,logo:logo.artifactHash,headline,cta,font,ratio:input.ratio})},{name:optionalText(input.name,'Image name',160)||snapshot.concept.title,source:'Third Draft local composition',method:'layered',parentId:visual.id,setId:snapshot.setId,briefId:snapshot.briefId,conceptId:snapshot.conceptId,snapshot,caption:optionalText(input.caption,'Caption',8000)||snapshot.concept.body,style:snapshot.brief.style,composition:{template:'editorial-v1',ratio:input.ratio,visualId:visual.id,logoId:logo.id,headline,cta,font,fontHash:hash(readFileSync(fontPath)),layers:[{role:'headline',x:margin,y:margin},{role:'visual',x:margin,y:300,width:width-2*margin,height:visualHeight,fit:'contain'},{role:'logo',x:margin,y:height-104,width:180,height:72,fit:'contain'},{role:'cta',x:304,y:height-100}]},machineChecks:{decoded:true,dimensions:true,textFits:true,logoUncropped:true,fontAvailable:true}});
  }
  reviewContext(projectId,assetId){
    const asset=this.store.record('assets',projectId,assetId);this.read(projectId,assetId);
    return {assetId:asset.id,artifactHash:asset.artifactHash,caption:asset.caption,briefId:asset.briefId,brandHash:brandHash(this.store,projectId),machineChecks:asset.machineChecks,composition:asset.composition??null};
  }
  adoptionIssues(projectId,assetId){
    const asset=this.store.record('assets',projectId,assetId),reviews=this.store.rows('reviews',projectId).filter(r=>r.assetId===assetId),resolutions=this.store.rows('selections',projectId).filter(s=>s.targetId===assetId&&s.decision==='issue_resolved');
    const issues=[];this.read(projectId,assetId);
    if(!reviews.length)issues.push({code:'review_required',message:'Run a review before final adoption.'});
    const latest=reviews.at(-1);if(latest&&latest.snapshot.brandHash!==brandHash(this.store,projectId))issues.push({code:'brand_changed',message:'Brand facts changed. Review this image again against the current facts.'});
    if(asset.setId){const brief=this.store.rows('briefs',projectId).filter(b=>b.setId===asset.setId).at(-1);if(brief.id!==asset.briefId)issues.push({code:'brief_changed',message:'The set brief changed. Produce a new version under the current brief.'});}
    for(const review of reviews)for(const issue of review.issues)if(['blocker','unable_to_judge'].includes(issue.severity)&&!resolutions.some(r=>r.reviewId===review.id&&r.issueId===issue.id))issues.push({code:'unresolved_review',reviewId:review.id,...issue});
    return issues;
  }
  resolve(projectId,reviewId,input){
    this.store.assertWritable(projectId);const review=this.store.record('reviews',projectId,reviewId);if(!review.issues.some(i=>i.id===input.issueId))throw new AppError('not_found','This review issue was not found.',404);
    const record={id:id(),targetType:'asset',targetId:review.assetId,decision:'issue_resolved',reviewId,issueId:input.issueId,reason:text(input.reason,'Resolution explanation',1500),createdAt:now(),createdBy:'user'};
    this.store.db.prepare('INSERT INTO selections VALUES (?,?,?,?,?)').run(record.id,projectId,null,review.assetId,JSON.stringify(record));return record;
  }
  adopt(projectId,input){if(input.targetType==='asset'&&input.decision==='adopted'){const issues=this.adoptionIssues(projectId,input.targetId);if(issues.length)throw new AppError('adoption_blocked',issues.map(i=>i.message??i.explanation).join(' '),409);}return this.store.select(projectId,input);}
  export(projectId,setId,{draft=false}={}){
    const set=this.store.record('sets',projectId,setId),assets=this.store.rows('assets',projectId).filter(a=>a.setId===setId),selections=this.store.rows('selections',projectId),files={},items=[];
    for(const asset of assets){const selected=selections.filter(s=>s.targetId===asset.id&&['adopted','rejected'].includes(s.decision)).at(-1)?.decision==='adopted';if(!draft&&!selected)continue;if(!draft&&this.adoptionIssues(projectId,asset.id).length)throw new AppError('stale_delivery','An adopted image now needs another review. Use a draft export or resolve its current issues.',409);const stem=asset.id;files[`${stem}.png`]=new Uint8Array(this.read(projectId,asset.id));files[`${stem}.txt`]=strToU8(asset.caption??'');items.push({id:asset.id,parentId:asset.parentId??null,image:`${stem}.png`,caption:`${stem}.txt`,imageHash:asset.artifactHash,captionHash:hash(asset.caption??''),width:asset.width,height:asset.height,method:asset.method,conceptId:asset.conceptId,briefId:asset.briefId});}
    if(!items.length)throw new AppError('empty_export',draft?'This set has no images to export.':'Adopt at least one reviewed image before final export.');
    files['manifest.json']=strToU8(JSON.stringify({schemaVersion:1,kind:draft?'draft_delivery':'final_delivery',set:{id:set.id,name:set.name,mode:set.mode},exportedAt:now(),assets:items},null,2));return Buffer.from(zipSync(files,{level:0}));
  }
}
