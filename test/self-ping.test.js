'use strict';
const { test }=require('node:test');
const assert=require('node:assert/strict');
const { EventEmitter }=require('node:events');
const { createSelfPing, URL, INTERVAL_MS, TIMEOUT_MS }=require('../src/self-ping');
function setup(opts={}) {
 const calls=[], logs=[], intervals=[], timeouts=[];
 const timers={setInterval(fn,ms){const o={fn,ms,cleared:false,unref(){}};intervals.push(o);return o;},clearInterval(o){o.cleared=true;},setTimeout(fn,ms){const o={fn,ms,cleared:false,unref(){}};timeouts.push(o);return o;},clearTimeout(o){o.cleared=true;}};
 const get=opts.get || ((url,options,cb)=>{const req=new EventEmitter(); req.destroyed=false; req.destroy=()=>{req.destroyed=true;};calls.push({url,options,cb,req}); return req;});
 const ping=createSelfPing({get,timers,logger:opts.logger||{warn:m=>logs.push(m)}});
 const tick=()=>intervals[0].fn();
 const response=(i,status=200)=>{const res=new EventEmitter();res.statusCode=status;res.resumed=false;res.resume=()=>{res.resumed=true;};calls[i].cb(res);return res;};
 return {ping,calls,logs,intervals,timeouts,tick,response};
}
test('constantes exatas',()=>{assert.equal(URL,'https://leiasp.onrender.com/health');assert.equal(INTERVAL_MS,300000);assert.equal(TIMEOUT_MS,15000);});
test('início agenda uma única vez',()=>{const s=setup();s.ping.start();s.ping.start();assert.equal(s.intervals.length,1);assert.equal(s.intervals[0].ms,300000);assert.equal(s.calls.length,0);});
test('envia GET público após intervalo',()=>{const s=setup();s.ping.start();s.tick();assert.equal(s.calls[0].url,URL);assert.equal(s.calls[0].options.method,'GET');});
test('não sobrepõe pedidos em andamento',()=>{const s=setup();s.ping.start();s.tick();s.tick();s.tick();assert.equal(s.calls.length,1);});
test('próximo pedido só após fechamento',()=>{const s=setup();s.ping.start();s.tick();s.calls[0].req.emit('close');s.tick();assert.equal(s.calls.length,2);});
test('resposta é drenada',()=>{const s=setup();s.ping.start();s.tick();assert.equal(s.response(0).resumed,true);assert.equal(s.logs.length,0);});
test('status diferente de 200 é registrado',()=>{const s=setup();s.ping.start();s.tick();s.response(0,503);assert.equal(s.logs.length,1);});
test('erro de rede não vaza segredo',()=>{const s=setup();s.ping.start();s.tick();s.calls[0].req.emit('error',new Error('segredo'));assert.equal(s.logs.length,1);assert.ok(!s.logs.join().includes('segredo'));});
test('erro de resposta não vaza segredo',()=>{const s=setup();s.ping.start();s.tick();s.response(0).emit('error',new Error('segredo'));assert.equal(s.logs.length,1);assert.ok(!s.logs.join().includes('segredo'));});
test('erro síncrono não interrompe agenda',()=>{const s=setup({get:()=>{throw new Error('segredo');}});s.ping.start();s.tick();s.tick();assert.equal(s.logs.length,2);assert.ok(!s.logs.join().includes('segredo'));});
test('timeout absoluto destrói pedido',()=>{const s=setup();s.ping.start();s.tick();assert.equal(s.timeouts[0].ms,15000);s.timeouts[0].fn();assert.equal(s.calls[0].req.destroyed,true);});
test('timeout não permite sobreposição até fechar',()=>{const s=setup();s.ping.start();s.tick();s.timeouts[0].fn();s.tick();assert.equal(s.calls.length,1);s.calls[0].req.emit('close');s.tick();assert.equal(s.calls.length,2);});
test('fechamento cancela timeout',()=>{const s=setup();s.ping.start();s.tick();s.calls[0].req.emit('close');assert.equal(s.timeouts[0].cleared,true);});
test('logger com falha não interrompe o serviço',()=>{const s=setup({logger:{warn(){throw Error('x');}}});s.ping.start();s.tick();assert.doesNotThrow(()=>s.calls[0].req.emit('error',new Error('x')));});
