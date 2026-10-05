import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync, unlinkSync, mkdirSync } from 'node:fs';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { Store, safeDataPath } from './store.mjs';
import { CreativeService } from './service.mjs';
import { CodexRuntime } from './runtime.mjs';
import { CodexImageRuntime } from './runtime-image.mjs';
import { SkillLibrary } from './skills.mjs';
import { AssetService } from './assets.mjs';
import { fetchSource, ResearchError } from './research.mjs';
import { exportProject, restoreProject, BACKUP_LIMITS } from './backup.mjs';
import { decodeBase64 } from './assets.mjs';
import { AppError, id, now } from './common.mjs';

const publicRoot=fileURLToPath(new URL('../public/',import.meta.url));
function equal(a,b) {return typeof a==='string'&&Buffer.byteLength(a)===Buffer.byteLength(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));}
async function jsonBody(req,maxBytes=64000) {
  if(!req.headers['content-type']?.startsWith('application/json')) throw new AppError('invalid_input','The request must use JSON.',415);
  const chunks=[];let bytes=0;
  for await(const chunk of req) {bytes+=chunk.length;if(bytes>maxBytes) throw new AppError('too_large','The request exceeds its size limit.',413);chunks.push(chunk);}
  try {const value=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!value||Array.isArray(value)||typeof value!=='object')throw new Error();return value;}
  catch {throw new AppError('invalid_input','Invalid JSON request.');}
}
function lockData(store) {
  const lock=store.safePath('service.lock');
  try {writeFileSync(lock,String(process.pid),{flag:'wx'});}
  catch(error) {
    if(error.code!=='EEXIST') throw error;
    const pid=Number(readFileSync(lock,'utf8'));
    if(!Number.isInteger(pid)||pid<1) throw new Error('Invalid data-directory lock; inspect service.lock before removing it.');
    try {process.kill(pid,0);throw new Error('Another Third Draft process owns this data directory.');}
    catch(probe) {if(probe.code!=='ESRCH')throw probe;}
    unlinkSync(lock);writeFileSync(lock,String(process.pid),{flag:'wx'});
  }
  return ()=>{if(readFileSync(lock,'utf8')===String(process.pid))unlinkSync(lock);};
}
export async function startServer({dataDir,port=4057,runtime,imageRuntime,lock=true}={}) {
  dataDir ??= process.env.THIRD_DRAFT_DATA_DIR || path.join(process.env.LOCALAPPDATA||path.join(os.homedir(),'.local','share'),'ThirdDraft');
  mkdirSync(safeDataPath(dataDir),{recursive:true});
  const unlock=lock?lockData({safePath:relative=>safeDataPath(dataDir,relative)}):()=>{};
  let store;
  try { store=new Store(dataDir);runtime ??= new CodexRuntime({runtimeHome:store.safePath(path.join('runtime','codex'))}); }
  catch(error){store?.close();unlock();throw error;}
  const skills=new SkillLibrary(store),assetService=new AssetService(store);imageRuntime??=new CodexImageRuntime({nativeRuntime:runtime});
  const service=new CreativeService(store,runtime,{skills,assets:assetService,imageRuntime});
  service.recover();
  const session=randomBytes(32).toString('hex');const csrf=randomBytes(32).toString('hex');
  const server=http.createServer(async(req,res)=>{
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    const send=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(value));};
    try {
      const allowedHosts=new Set([`127.0.0.1:${server.address().port}`,`localhost:${server.address().port}`]);
      if(!allowedHosts.has(req.headers.host)) throw new AppError('forbidden','This host is not allowed.',403);
      const origin=`http://${req.headers.host}`;
      if(req.headers.origin&&req.headers.origin!==origin)throw new AppError('forbidden','Cross-site requests are not allowed.',403);
      if(req.headers['sec-fetch-site']==='cross-site')throw new AppError('forbidden','Cross-site requests are not allowed.',403);
      const url=new URL(req.url,origin); const pathname=url.pathname;
      if(req.method==='GET'&&pathname==='/favicon.ico'){res.writeHead(204);res.end();return;}
      if(req.method==='GET'&&pathname==='/api/session') {
        res.setHeader('Set-Cookie',`td_session=${session}; HttpOnly; SameSite=Strict; Path=/`);
        return send(200,{csrfToken:csrf});
      }
      if(pathname.startsWith('/api/')) {
        const cookie=req.headers.cookie?.split(';').map(c=>c.trim()).find(c=>c.startsWith('td_session='))?.slice(11);
        if(!equal(cookie,session))throw new AppError('unauthorized','Reopen the workspace to establish a local session.',401);
        if(req.method==='POST'&&!equal(req.headers['x-csrf-token'],csrf))throw new AppError('forbidden','Session verification failed. Refresh this page.',403);
        if(req.method==='GET'&&pathname==='/api/projects')return send(200,store.projects());
        if(req.method==='POST'&&pathname==='/api/projects')return send(201,store.createProject(await jsonBody(req)));
        if(req.method==='GET'&&pathname==='/api/runtime')return send(200,{...await runtime.inspect(),checkedAt:now()});
        if(req.method==='GET'&&pathname==='/api/image-runtime')return send(200,await imageRuntime.inspect());
        if(req.method==='GET'&&pathname==='/api/skills')return send(200,skills.list());
        if(req.method==='POST'&&pathname==='/api/skills')return send(201,skills.import(await jsonBody(req,8*1024*1024)));
        if(req.method==='POST'&&pathname==='/api/restore'){const input=await jsonBody(req,90*1024*1024);const result=restoreProject(decodeBase64(input.base64,BACKUP_LIMITS.bytes),store.safePath(path.join('restores',id())));return send(201,result);}
        if(req.method==='GET'&&pathname==='/api/dispatch')return send(200,store.setting('dispatch')??{paused:false});
        if(req.method==='POST'&&pathname==='/api/dispatch')return send(200,service.pause((await jsonBody(req)).paused));
        const match=pathname.match(/^\/api\/projects\/([^/]+)(?:\/(.*))?$/);
        if(!match)throw new AppError('not_found','This page was not found.',404);
        const [,projectId,tail='']=match;store.project(projectId);
        if(req.method==='GET'&&!tail)return send(200,{...store.snapshot(projectId),skills:skills.bindings(projectId)});
        if(req.method==='GET'&&tail==='backup'){const content=exportProject(store,skills,projectId);res.writeHead(200,{'Content-Type':'application/zip','Content-Disposition':`attachment; filename="third-draft-${projectId}.tdbackup"`});res.end(content);return;}
        if(req.method==='POST'&&tail==='skills')return send(200,skills.bind(projectId,await jsonBody(req)));
        if(req.method==='POST'&&tail==='archive')return send(200,store.archiveProject(projectId,(await jsonBody(req)).archived));
        if(req.method==='POST'&&tail==='knowledge')return send(201,store.addKnowledge(projectId,await jsonBody(req)));
        if(req.method==='POST'&&tail==='evidence')return send(201,store.addEvidence(projectId,await jsonBody(req)));
        if(req.method==='POST'&&tail==='research'){store.assertWritable(projectId);const input=await jsonBody(req),source=await fetchSource(input.url);return send(201,store.addEvidence(projectId,{title:source.title,url:source.url,observation:source.excerpt,inference:'',retrievedAt:source.retrievedAt,sourceResponseHash:source.contentHash,excerptTruncated:source.truncated,tags:input.tags??[]},{retrieved:true}));}
        if(req.method==='POST'&&tail==='insights')return send(201,store.addInsight(projectId,await jsonBody(req)));
        if(req.method==='POST'&&tail==='concepts')return send(201,store.addConcept(projectId,await jsonBody(req)));
        if(req.method==='POST'&&tail==='sets')return send(201,store.createSet(projectId,await jsonBody(req)));
        if(req.method==='POST'&&tail==='selections')return send(201,assetService.adopt(projectId,await jsonBody(req)));
        if(req.method==='POST'&&tail==='images')return send(201,await assetService.import(projectId,await jsonBody(req,28*1024*1024)));
        if(req.method==='POST'&&tail==='compose')return send(201,await assetService.compose(projectId,await jsonBody(req)));
        if(req.method==='POST'&&tail==='production')return send(202,await service.startProduction(projectId,await jsonBody(req)));
        const image=tail.match(/^assets\/([^/]+)\/file$/);
        if(req.method==='GET'&&image){const content=assetService.read(projectId,image[1]);res.writeHead(200,{'Content-Type':'image/png'});res.end(content);return;}
        const caption=tail.match(/^assets\/([^/]+)\/caption$/);
        if(req.method==='POST'&&caption)return send(201,await assetService.caption(projectId,caption[1],await jsonBody(req)));
        const resolveReview=tail.match(/^reviews\/([^/]+)\/resolve$/);
        if(req.method==='POST'&&resolveReview)return send(201,assetService.resolve(projectId,resolveReview[1],await jsonBody(req)));
        const exportSet=tail.match(/^sets\/([^/]+)\/export$/);
        if(req.method==='GET'&&exportSet){const content=assetService.export(projectId,exportSet[1],{draft:url.searchParams.get('draft')==='1'});res.writeHead(200,{'Content-Type':'application/zip','Content-Disposition':`attachment; filename="third-draft-${exportSet[1]}.zip"`});res.end(content);return;}
        const setBrief=tail.match(/^sets\/([^/]+)\/briefs$/);
        const archiveSet=tail.match(/^sets\/([^/]+)\/archive$/);
        if(req.method==='POST'&&archiveSet)return send(200,store.archiveSet(projectId,archiveSet[1],(await jsonBody(req)).archived));
        if(req.method==='POST'&&setBrief)return send(201,store.reviseBrief(projectId,setBrief[1],await jsonBody(req)));
        const setConcepts=tail.match(/^sets\/([^/]+)\/concepts$/);
        if(req.method==='POST'&&setConcepts)return send(200,store.addSetConcepts(projectId,setConcepts[1],await jsonBody(req)));
        const confirm=tail.match(/^knowledge\/([^/]+)\/confirm$/);
        if(req.method==='POST'&&confirm){await jsonBody(req);return send(201,store.confirmKnowledge(projectId,confirm[1]));}
        const favorite=tail.match(/^concepts\/([^/]+)\/favorite$/);
        if(req.method==='POST'&&favorite){const input=await jsonBody(req);return send(200,store.favorite(projectId,favorite[1],input.active,input.reason));}
        if(req.method==='POST'&&tail==='feedback')return send(201,store.addFeedback(projectId,await jsonBody(req)));
        if(req.method==='POST'&&tail==='context')return send(200,service.context(projectId,await jsonBody(req)));
        if(req.method==='POST'&&tail==='runs')return send(202,await service.start(projectId,await jsonBody(req)));
        const cancel=tail.match(/^runs\/([^/]+)\/cancel$/);
        if(req.method==='POST'&&cancel){await jsonBody(req);return send(200,service.cancel(projectId,cancel[1]));}
        const run=tail.match(/^runs\/([^/]+)$/);
        if(req.method==='GET'&&run){const {pendingOutput,...value}=store.record('runs',projectId,run[1]);return send(200,value);}
        const download=tail.match(/^concepts\/([^/]+)\/export$/);
        if(req.method==='GET'&&download){
          const content=store.readArtifact(projectId,download[1]);
          res.writeHead(200,{'Content-Type':'text/markdown; charset=utf-8','Content-Disposition':`attachment; filename="third-draft-${download[1]}.md"`});res.end(content);return;
        }
        throw new AppError('not_found','This operation was not found.',404);
      }
      const assets={'/':['index.html','text/html'],'/app.js':['app.js','text/javascript'],'/styles.css':['styles.css','text/css']};
      if(req.method!=='GET'||!assets[pathname])throw new AppError('not_found','This page was not found.',404);
      const [file,type]=assets[pathname];res.writeHead(200,{'Content-Type':type+'; charset=utf-8'});res.end(readFileSync(path.join(publicRoot,file)));
    }catch(error){if(error instanceof ResearchError)error.status=422;if(!res.headersSent)send(error.status||500,{error:{code:error.code||'internal_error',message:error.status?error.message:'The local operation failed. Check the data directory and service status.'}});else res.end();}
  });
  try {await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});}
  catch(error){unlock();store.close();throw error;}
  return {server,store,service,url:`http://127.0.0.1:${server.address().port}`,async close(){await service.idle();await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));unlock();store.close();}};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const app=await startServer({port:Number(process.env.THIRD_DRAFT_PORT||4057)});
  console.log(`Third Draft: ${app.url}\nData: ${app.store.dataDir}`);
  let closing=false;
  const stop=async()=>{if(closing)return;closing=true;await app.close();process.exit(0);};
  process.on('SIGINT',stop);process.on('SIGTERM',stop);
}
