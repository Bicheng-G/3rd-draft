import { AppError, hash, id, now, requireId } from './common.mjs';
import { buildContext, promptFor } from './context.mjs';
import { VISION_COPY_POLICY } from './assets.mjs';

export const outputSchema={type:'object',additionalProperties:false,properties:{title:{type:'string'},insight:{type:'string'},theme:{type:'string'},angle:{type:'string'},body:{type:'string'},visualDirection:{type:'string'},rationale:{type:'string'},usedContextIds:{type:'array',items:{type:'string'}},assumptions:{type:'array',items:{type:'string'}}},required:['title','insight','theme','angle','body','visualDirection','rationale','usedContextIds','assumptions']};
export const insightSchema={type:'object',additionalProperties:false,properties:{title:{type:'string'},audience:{type:'string'},content:{type:'string'},counterexamples:{type:'string'},hypothesis:{type:'boolean'},evidenceIds:{type:'array',items:{type:'string'}}},required:['title','audience','content','counterexamples','hypothesis','evidenceIds']};
export const extractSchema={type:'object',additionalProperties:false,properties:{title:{type:'string'},content:{type:'string'},unknowns:{type:'array',items:{type:'string'}}},required:['title','content','unknowns']};
export const reviewSchema={type:'object',additionalProperties:false,properties:{summary:{type:'string'},limitations:{type:'array',items:{type:'string'}},issues:{type:'array',items:{type:'object',additionalProperties:false,properties:{severity:{type:'string',enum:['blocker','warning','unable_to_judge']},category:{type:'string',enum:['facts','copy','product','brand']},explanation:{type:'string'},suggestedAction:{type:'string'}},required:['severity','category','explanation','suggestedAction']}}},required:['summary','limitations','issues']};
function bounded(value,max=2000){return typeof value==='string'&&value.trim()&&value.length<=max;}
function strings(value,maxCount=30){return Array.isArray(value)&&value.length<=maxCount&&value.every(s=>bounded(s));}
export function validateInsight(output,context) {
  if(!output||Object.keys(output).some(k=>!insightSchema.required.includes(k)))throw new AppError('invalid_output','The runtime returned an invalid insight.');
  for(const name of ['title','audience','content'])if(typeof output[name]!=='string'||!output[name].trim()||output[name].length>4000)throw new AppError('invalid_output',`Invalid insight field: ${name}.`);
  if(typeof output.counterexamples!=='string'||output.counterexamples.length>2000||typeof output.hypothesis!=='boolean'||!Array.isArray(output.evidenceIds)||output.evidenceIds.length>12||output.evidenceIds.some(ref=>!context.evidenceIds.includes(ref))||(!output.evidenceIds.length&&!output.hypothesis))throw new AppError('invalid_output','The insight must cite selected evidence or explicitly remain a hypothesis.');
  return {...structuredClone(output),evidenceIds:[...new Set(output.evidenceIds)]};
}
export function validateOutput(output,context) {
  if(!output||typeof output!=='object'||Array.isArray(output)||Object.keys(output).some(k=>!outputSchema.required.includes(k))) throw new AppError('invalid_output','The runtime returned an invalid creative result.');
  for(const key of ['title','insight','theme','angle','body','visualDirection','rationale']) {
    if(typeof output[key]!=='string'||!output[key].trim()||output[key].length>8000) throw new AppError('invalid_output',`Creative result field ${key} is missing or exceeds its size limit.`);
  }
  for(const key of ['usedContextIds','assumptions']) {
    if(!Array.isArray(output[key])||output[key].length>40||output[key].some(v=>typeof v!=='string'||v.length>2000)) throw new AppError('invalid_output',`Creative result field ${key} is invalid.`);
  }
  const allowed=new Set(context.entries.map(e=>e.id));
  if(output.usedContextIds.some(ref=>!allowed.has(ref))) throw new AppError('invalid_output','The runtime cited a record outside the selected context.');
  if(context.sourceConceptId&&!output.usedContextIds.includes(context.sourceConceptId)) throw new AppError('invalid_output','The continuation did not cite the selected source idea.');
  return structuredClone(output);
}
export class CreativeService {
  constructor(store,runtime,{skills,assets}={}) { this.store=store;this.runtime=runtime;this.skills=skills;this.assets=assets;this.active=new Map();this.controllers=new Map();this.instanceId=id(); }
  recover() {
    for(const project of this.store.projects()) for(const run of this.store.rows('runs',project.id)) {
      if(run.status==='running') {
        run.status='result_unknown';run.error={code:'result_unknown',message:'The service stopped before the external result was known. No automatic retry was made. Check the runtime record before starting another task.'};
        this.store.saveRun(project.id,run);
      } else if(run.status==='archiving') this.finishArchive(project.id,run);
    }
  }
  context(projectId,input) { const context=buildContext(this.store,projectId,input);context.skills=this.skills?.selected(projectId,['text_generate','structured_output',...(context.imageIds?.length?['vision_input']:[])])??[];if(context.imageIds?.length)context.visionCopyPolicy=VISION_COPY_POLICY;if(context.taskType==='review_asset')context.reviewSnapshot=this.assets.reviewContext(projectId,context.assetId);delete context.inputHash;return {...context,inputHash:hash(context)}; }
  pause(paused) {if(typeof paused!=='boolean')throw new AppError('invalid_input','Paused must be true or false.');return this.store.setting('dispatch',{paused,updatedAt:now()});}
  cancel(projectId,runId) {const run=this.store.record('runs',projectId,runId);if(run.status!=='running')throw new AppError('not_running','Only running tasks can be interrupted.',409);run.cancelRequestedAt=now();this.store.saveRun(projectId,run);this.controllers.get(runId)?.abort();return {requested:true,message:'Interruption requested. A submitted external result may still exist; it will not be retried automatically.'};}
  async start(projectId,input) {
    this.store.assertWritable(projectId);requireId(input.requestId);
    const requestHash=hash({goal:input.goal,language:input.language,sourceConceptId:input.sourceConceptId??null,count:input.count??1,taskType:input.taskType??null,setId:input.setId??null,assetId:input.assetId??null,evidenceIds:input.evidenceIds??[]});
    const existing=this.store.existingRun(projectId,input.requestId);
    if(existing) {
      if(existing.requestHash!==requestHash) throw new AppError('request_conflict','This request ID was already used for different input.',409);
      return existing;
    }
    if(this.store.setting('dispatch')?.paused)throw new AppError('paused','Task dispatch is paused. Resume it in Activity before starting a task.',409);
    if(this.active.size) throw new AppError('busy','Another task is running. Wait for it to finish.',409);
    // Reserve before asynchronous capability inspection so concurrent clicks cannot dispatch twice.
    const runId=id();this.active.set(runId,null);
    try {
      const context=this.context(projectId,input);
      if(Buffer.byteLength(promptFor(context),'utf8')>256*1024)throw new AppError('context_limit','The selected context exceeds the runtime limit. Reduce selected sources or enabled skills; confirmed brand constraints were not truncated.');
      const connection=await this.runtime.inspect();
      if(this.store.setting('dispatch')?.paused)throw new AppError('paused','Task dispatch was paused before submission.',409);
      if(!connection.available || connection.billing!=='subscription') throw new AppError('runtime_unavailable',connection.reason||'Sign in to your ChatGPT subscription through the local Codex runtime.',503);
      if(context.imageIds?.length&&!connection.capabilities?.vision_input?.available)throw new AppError('unsupported_capability','This runtime has not verified image input for this task.',503);
      const run={id:runId,attemptId:runId,serviceInstanceId:this.instanceId,requestId:input.requestId,requestHash,projectId,taskType:context.taskType,status:'running',context,inputHash:context.inputHash,capabilitySnapshot:{...connection,checkedAt:now()},route:connection.route,runtimeVersion:connection.version,billing:connection.billing,usage:null,createdAt:now(),error:null};
      this.store.insertRun(projectId,run);
      this.controllers.set(runId,new AbortController());
      const promise=this.execute(projectId,run);
      this.active.set(runId,promise);
      // execute catches errors; background work survives the browser disconnecting.
      void promise.finally(()=>{this.active.delete(runId);this.controllers.delete(runId);});
      return structuredClone(run);
    } catch(error) {this.active.delete(runId);throw error;}
  }
  async execute(projectId,run) {
    let visionInputs=[];
    try {
      const count=run.context.count??1;
      const schema=run.taskType==='extract_brand'?extractSchema:run.taskType==='review_asset'?reviewSchema:run.taskType==='synthesize_insights'?insightSchema:count===1?outputSchema:{type:'object',additionalProperties:false,properties:{concepts:{type:'array',items:outputSchema,minItems:count,maxItems:count}},required:['concepts']};
      visionInputs=await Promise.all((run.context.imageIds??[]).map(assetId=>this.assets.visionInput(projectId,assetId)));
      const result=await this.runtime.generate({prompt:promptFor(run.context),schema,images:visionInputs.map(image=>image.bytes),signal:this.controllers.get(run.id)?.signal});
      // A received result has usage and provenance even when its work product is rejected.
      run.usage=result.usage??null;run.runtimeMetadata={...(result.metadata??{}),imageDerivations:visionInputs.map(image=>image.metadata)};
      if(run.taskType==='extract_brand') {
        const out=result.output;if(!out||!bounded(out.title,120)||!bounded(out.content,2000)||!strings(out.unknowns))throw new AppError('invalid_output','The extracted brand draft is invalid.');
        const content=out.content+(out.unknowns.length?'\n\nUnknown / needs confirmation:\n'+out.unknowns.map(s=>'- '+s).join('\n'):'');
        if(content.length>2000)throw new AppError('invalid_output','The extracted brand draft exceeds 2,000 characters.');
        const record={id:id(),itemId:id(),previousId:null,kind:'brand',status:'draft',title:out.title,content,source:`Imported image ${run.context.assetId}`,assetId:run.context.assetId,tags:[],createdAt:now(),createdBy:'runtime',runId:run.id,schemaVersion:2};record.contentHash=hash(record);run.pendingOutput=record;
      } else if(run.taskType==='review_asset') {
        const out=result.output;if(!out||!bounded(out.summary,4000)||!strings(out.limitations)||!Array.isArray(out.issues)||out.issues.length>40||out.issues.some(i=>!i||!['blocker','warning','unable_to_judge'].includes(i.severity)||!['facts','copy','product','brand'].includes(i.category)||!bounded(i.explanation)||!bounded(i.suggestedAction)))throw new AppError('invalid_output','The runtime returned an invalid review.');
        run.pendingOutput={id:id(),assetId:run.context.assetId,summary:out.summary,limitations:out.limitations,issues:out.issues.map(i=>({...i,id:id()})),snapshot:run.context.reviewSnapshot,runId:run.id,createdAt:now(),createdBy:'runtime',schemaVersion:2};run.pendingOutput.contentHash=hash(run.pendingOutput);
      } else if(run.taskType==='synthesize_insights') {
        const output=validateInsight(result.output,run.context);const insight={...output,id:id(),itemId:id(),previousId:null,tags:[],runId:run.id,createdAt:now(),createdBy:'runtime',schemaVersion:2};insight.contentHash=hash(insight);run.pendingOutput=insight;
      } else {
        const outputs=count===1?[result.output]:result.output?.concepts;
        if(!Array.isArray(outputs)||outputs.length!==count)throw new AppError('invalid_output',`The runtime must return exactly ${count} ideas.`);
        const parent=run.context.sourceConceptId?this.store.record('concepts',projectId,run.context.sourceConceptId):null;
        const concepts=outputs.map(value=>({...validateOutput(value,run.context),id:id(),ideaId:parent?.ideaId??id(),parentId:parent?.id??null,runId:run.id,createdAt:now(),createdBy:'runtime',schemaVersion:2}));
        run.pendingOutput=count===1?concepts[0]:concepts;
      }
      const saved=this.store.record('runs',projectId,run.id);if(saved.cancelRequestedAt)run.cancelRequestedAt=saved.cancelRequestedAt;
      run.status='archiving';this.store.saveRun(projectId,run);
      this.finishArchive(projectId,run);
    } catch(error) {
      const saved=this.store.record('runs',projectId,run.id);if(saved.cancelRequestedAt)run.cancelRequestedAt=saved.cancelRequestedAt;
      if(error.receipt){run.usage=error.receipt.usage??null;run.runtimeMetadata={...(error.receipt.metadata??{}),imageDerivations:visionInputs.map(image=>image.metadata)};}
      run.status=error.code==='result_unknown'?'result_unknown':error.code==='quota_exhausted'?'waiting_quota':error.code==='auth_required'?'waiting_auth':error.code==='cancelled'?'cancelled':'failed';
      run.error={code:error.code||'runtime_failure',message:error.code?error.message:'The task did not complete. Check the local runtime connection.'};
      run.completedAt=now();
      this.store.saveRun(projectId,run);
    }
  }
  finishArchive(projectId,run) {
    try {this.store.archive(projectId,run);}
    catch(error) {
      run.status='archiving';run.error={code:'archive_pending',message:'The result was received but local archiving is incomplete. Check the data directory and restart the service to retry archiving only.'};
      this.store.saveRun(projectId,run);
    }
  }
  async idle() {await Promise.all([...this.active.values()].filter(Boolean));}
}
