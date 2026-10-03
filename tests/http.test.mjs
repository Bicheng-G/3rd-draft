import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync,mkdtempSync,rmSync } from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { startServer } from '../src/server.mjs';

test('loopback HTTP protects sessions, origins, CSRF, projects and static paths',async t=>{
  const root=path.resolve('.workbench/tests');mkdirSync(root,{recursive:true});const dir=mkdtempSync(path.join(root,'http-'));
  const runtime={inspect:async()=>({available:false,billing:'unknown',route:'test',reason:'fixture'})};
  const app=await startServer({dataDir:dir,port:0,runtime});
  t.after(async()=>{await app.close();assert.ok(dir.startsWith(root+path.sep));rmSync(dir,{recursive:true,force:true});});
  assert.equal((await fetch(app.url+'/api/projects')).status,401);
  assert.equal((await fetch(app.url+'/api/session',{headers:{Origin:'https://example.invalid'}})).status,403);
  const rebound=await new Promise((resolve,reject)=>{http.get(app.url+'/api/session',{headers:{Host:'rebind.invalid'}},res=>{res.resume();resolve(res.statusCode);}).on('error',reject);});
  assert.equal(rebound,403);
  const session=await fetch(app.url+'/api/session');const cookie=session.headers.get('set-cookie').split(';')[0];const {csrfToken}=await session.json();
  const headers={Cookie:cookie,'Content-Type':'application/json','X-CSRF-Token':csrfToken};
  assert.equal((await fetch(app.url+'/api/projects',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:'{}'})).status,403);
  const create=await fetch(app.url+'/api/projects',{method:'POST',headers,body:JSON.stringify({name:'HTTP fixture'})});assert.equal(create.status,201);const project=await create.json();
  const payload=Buffer.from(JSON.stringify({name:'品牌'}));const split=payload.indexOf(Buffer.from('品'))+1;
  const fragmented=await new Promise((resolve,reject)=>{
    const req=http.request(app.url+'/api/projects',{method:'POST',headers:{...headers,'Content-Length':payload.length}},res=>{const chunks=[];res.on('data',chunk=>chunks.push(chunk));res.on('end',()=>resolve(JSON.parse(Buffer.concat(chunks))));});
    req.on('error',reject);req.write(payload.subarray(0,split));setTimeout(()=>req.end(payload.subarray(split)),30);
  });
  assert.equal(fragmented.name,'品牌','fragmented UTF-8 must round-trip exactly');
  assert.equal((await fetch(app.url+'/api/projects/'+project.id,{headers})).status,200);
  assert.equal((await fetch(app.url+'/api/projects/'+project.id+'/knowledge',{method:'POST',headers,body:JSON.stringify({kind:'brand',title:'x',content:'x',source:''})})).status,400);
  assert.equal((await fetch(app.url+'/api/projects/'+project.id+'/runs',{method:'POST',headers,body:JSON.stringify({goal:'test',language:'en',requestId:crypto.randomUUID()})})).status,503);
  assert.equal((await fetch(app.url+'/src/store.mjs')).status,404);
  const page=await fetch(app.url);assert.equal(page.status,200);assert.ok(page.headers.get('content-security-policy').includes("frame-ancestors 'none'"));
  await assert.rejects(startServer({dataDir:dir,port:0,runtime}),/Another Third Draft/);
});
