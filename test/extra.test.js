'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { ActionRowBuilder } = require('discord.js');

function loadWithMocks(relative, replacements) {
  const filename = require.resolve(relative);
  const m = new Module(filename, module); m.filename=filename; m.paths=Module._nodeModulePaths(path.dirname(filename));
  const original=m.require.bind(m); m.require=name=>Object.hasOwn(replacements,name)?replacements[name]:original(name);
  m._compile(fs.readFileSync(filename,'utf8'),filename); return m.exports;
}

test('arquivo revisado simulado produz botão válido e alerta parcial', () => {
  const url='https://publico.exemplo.org/marcado.pdf';
  const cat=loadWithMocks('../src/catalog',{'./verified-files':{'6-1':{url,sha256:'a'.repeat(64)}}});
  const ui=loadWithMocks('../src/ui',{'./catalog':cat});
  const c=structuredClone(cat.readCatalog());
  for (const f of c.groups['6'].files) Object.assign(f,{url:null,watermarked:false});
  Object.assign(c.groups['6'].files[0],{url,watermarked:true});
  const p=ui.selection(c,ui.IDS.grades,'6');
  assert.equal(p.flags,64); assert.match(p.embeds[0].description,/2 arquivo/);
  assert.equal(p.components[0].components.length,1); assert.equal(p.components[0].components[0].url,url);
  assert.doesNotThrow(()=>ActionRowBuilder.from(p.components[0]).toJSON());
});

test('inicialização aguarda a porta e configura intents, handlers e login sem rede', async () => {
  const old=process.env.DISCORD_TOKEN; process.env.DISCORD_TOKEN='token-de-teste';
  let instance; class FakeClient {
    constructor(opts) { this.opts=opts; this.handlers={}; instance=this; }
    once(event,fn) { this.handlers[event]=fn; }
    on(event,fn) { this.handlers[event]=fn; }
    login(token) { this.token=token; return Promise.resolve(); }
  }
  try {
    let release;
    let receivedPort;
    loadWithMocks('../src/index',{
      'dotenv':{config:()=>({})},
      './http-server':{getPort:()=>12345,startHttpServer:port=>{receivedPort=port; return new Promise(resolve=>{release=resolve;});}},
      'discord.js':{Client:FakeClient,GatewayIntentBits:{Guilds:1},Events:{ClientReady:'ready',InteractionCreate:'interaction'},PermissionFlagsBits:{Administrator:8n}},
    });
    assert.equal(receivedPort,12345); assert.equal(instance,undefined);
    release(); await new Promise(resolve=>setImmediate(resolve));
    assert.deepEqual(instance.opts.intents,[1]); assert.equal(instance.token,'token-de-teste');
    assert.equal(typeof instance.handlers.ready,'function'); assert.equal(typeof instance.handlers.interaction,'function');
  } finally { if (old===undefined) delete process.env.DISCORD_TOKEN; else process.env.DISCORD_TOKEN=old; }
});
