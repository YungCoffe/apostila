'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const net = require('node:net');
const { once } = require('node:events');
const { startHttpServer } = require('../src/http-server');
async function port() { const s=net.createServer(); s.listen(0,'127.0.0.1'); await once(s,'listening'); const p=s.address().port; await new Promise(r=>s.close(r)); return p; }
async function run(method,path) {
 const p=await port(); const server=await startHttpServer(p);
 try { return await new Promise((resolve,reject)=> { const req=http.request({host:'127.0.0.1',port:p,path,method},res=>{let body=''; res.on('data',c=>body+=c); res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body}));}); req.on('error',reject); req.end(); }); }
 finally { await new Promise(r=>server.close(r)); }
}
for (const path of ['/', '/health', '/?private=x', '/health?private=x']) {
 for (const method of ['GET','HEAD']) test(`${method} ${path}`, async ()=>{
  const r=await run(method,path); assert.equal(r.status,200); assert.equal(r.headers['cache-control'],'no-store'); assert.match(r.headers['content-type'],/^application\/json/);
  if(method==='HEAD') assert.equal(r.body,''); else assert.deepEqual(JSON.parse(r.body),{http:'disponível',discord:'não verificado'});
 });
}
test('HEAD desconhecido 404 sem corpo',async()=>{const r=await run('HEAD','/missing');assert.equal(r.status,404);assert.equal(r.body,'');});
test('GET desconhecido 404',async()=>{const r=await run('GET','/missing');assert.equal(r.status,404);});
for (const method of ['POST','PUT','DELETE','OPTIONS']) test(`${method} 405 com Allow`,async()=>{const r=await run(method,'/health'); assert.equal(r.status,405); assert.equal(r.headers.allow,'GET, HEAD');});
