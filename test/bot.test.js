'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { spawnSync } = require('node:child_process');
const { EmbedBuilder, ActionRowBuilder } = require('discord.js');
const { readCatalog, validFile, GRADES, ACTION } = require('../src/catalog');
const { panel, selection, IDS } = require('../src/ui');
const { makeHandler } = require('../src/handlers');
const actual = readCatalog();
const catalog = structuredClone(actual);
for (const group of Object.values(catalog.groups)) for (const f of group.files) { f.url = null; f.watermarked = false; }

// Instâncias isoladas para testar a lógica de arquivos revisados sem aprovar
// nenhum link no código de produção nem tocar em PDFs ou configurações.
function catalogWithMocks({ verified = {}, source = JSON.stringify(actual) } = {}) {
  const filename = require.resolve('../src/catalog');
  const m = new Module(filename, module);
  m.filename = filename; m.paths = Module._nodeModulePaths(path.dirname(filename));
  const realRequire = m.require.bind(m);
  m.require = name => name === './verified-files' ? verified : name === 'node:fs' ? { readFileSync: () => source } : realRequire(name);
  m._compile(fs.readFileSync(filename, 'utf8'), filename);
  return m.exports;
}
const url = 'https://publico.exemplo.org/marcado.pdf';
const file = { id:'6-1', label:'Teste', watermarked:true, url };
const reviewed = { '6-1': {url, sha256:'a'.repeat(64)} };
function interaction(overrides = {}) {
  return { commandName:'apostilas', isChatInputCommand:()=>true, isStringSelectMenu:()=>false,
    inGuild:()=>true, memberPermissions:{has:()=>true}, replies:[],
    async reply(x) { this.replies.push(x); this.replied=true; },
    async deferReply(x) { this.deferred=true; this.deferral=x; },
    async editReply(x) { this.replies.push(x); }, ...overrides };
}

test('catálogo real tem 7 séries, 6 volumes e 26 arquivos', () => {
  assert.equal(GRADES.length, 7); assert.equal(ACTION.length, 6);
  assert.deepEqual(GRADES.map(([id]) => actual.groups[id].files.length), [3,3,3,3,3,3,2]);
  assert.equal(Object.values(actual.groups).reduce((n,g)=>n+g.files.length,0), 26);
});
test('arquivo não revisado não é liberado mesmo com declaração e URL HTTPS', () => {
  assert.equal(validFile(file), false);
  const c = structuredClone(catalog); Object.assign(c.groups['6'].files[0], file);
  assert.equal(selection(c, IDS.grades, '6').components, undefined);
});
test('as 13 seleções reais nunca mostram links sem revisão', () => {
  for (const [id] of [...GRADES, ...ACTION]) {
    const p = selection(actual, GRADES.some(([g])=>g===id) ? IDS.grades : IDS.action, id);
    assert.equal(p.flags,64); assert.equal(p.components,undefined); assert.match(p.embeds[0].description,/não estão disponíveis/);
  }
});
test('painel e banner têm formato aceito pelos builders do discord.js instalado', () => {
  const p = panel(); assert.equal(p.components.length,2);
  assert.equal(p.components[0].components[0].options.length,7); assert.equal(p.components[1].components[0].options.length,6);
  assert.equal(p.files[0].name,'banner.png'); assert.ok(fs.statSync(p.files[0].attachment).size > 0);
  assert.equal(p.embeds[0].image.url,'attachment://banner.png');
  assert.doesNotThrow(()=>new EmbedBuilder(p.embeds[0]).toJSON());
  for (const row of p.components) assert.doesNotThrow(()=>ActionRowBuilder.from(row).toJSON());
});
test('revisão isolada só libera ID, URL e hash registrados', () => {
  const check = catalogWithMocks({verified:reviewed}).validFile;
  assert.equal(check(file),true);
  for (const f of [{...file,id:'6-2'},{...file,url:url+'?outro'}, {...file,watermarked:false}, {...file,label:' '}]) assert.equal(check(f),false);
  assert.equal(catalogWithMocks({verified:{'6-1':{url,sha256:'ruim'}}}).validFile(file),false);
});
test('URLs perigosas e originais são recusadas mesmo que alguém as registre', () => {
  for (const bad of ['http://publico.exemplo.org/a.pdf','https://user:pass@exemplo.org/a.pdf','https://localhost/a.pdf','https://127.0.0.1/a.pdf','https://example.org/169678/1781599','https://github.com/YungCoffe/sp-acao-apostilas/releases/download/apostilas-2026/portugues1.pdf','https://publico.exemplo.org/%ZZ']) {
    const check=catalogWithMocks({verified:{'6-1':{url:bad,sha256:'a'.repeat(64)}}}).validFile;
    assert.equal(check({...file,url:bad}),false,bad);
  }
});
test('catálogo inválido, malformado, grupo ausente ou título vazio falha fechado', () => {
  for (const source of ['{}','{', 'null', JSON.stringify({...actual,groups:[]}), JSON.stringify({groups:{}})]) assert.throws(()=>catalogWithMocks({source}).readCatalog());
  const c=structuredClone(actual); c.groups['6'].title=' '; assert.throws(()=>catalogWithMocks({source:JSON.stringify(c)}).readCatalog());
});
test('quantidade, IDs duplicados e campos inválidos são recusados', () => {
  for (const mutate of [c=>c.groups['6'].files.pop(), c=>c.groups['6'].files[1].id='6-1', c=>c.groups['6'].files[0].watermarked='true', c=>c.groups['6'].files[0].url=123, c=>c.groups['6'].files[0].label='']) {
    const c=structuredClone(actual); mutate(c); assert.throws(()=>catalogWithMocks({source:JSON.stringify(c)}).readCatalog());
  }
});
test('valores e menus incorretos não fornecem arquivos', () => {
  for (const [menu,value] of [[IDS.grades,'portugues1'],['outro','6'],[IDS.action,'em1'],[IDS.grades,'__proto__']]) assert.match(selection(catalog,menu,value).content,/não foi possível/i);
});
test('administrador publica painel público', async () => {
  const i=interaction(); await makeHandler({readCatalog,adminBit:8n})(i); assert.equal(i.replies[0].components.length,2); assert.equal(i.replies[0].flags,undefined);
});
test('não administrador e conversa privada recebem recusa privada', async () => {
  for (const i of [interaction({memberPermissions:{has:()=>false}}),interaction({inGuild:()=>false})]) { await makeHandler({readCatalog,adminBit:8n})(i); assert.equal(i.replies[0].flags,64); assert.match(i.replies[0].content,/administradores/); }
});
test('menu reconhecido defere privadamente antes da leitura e responde', async () => {
  const i=interaction({isChatInputCommand:()=>false,isStringSelectMenu:()=>true,customId:IDS.action,values:['portugues2']});
  let reads=0; const handle=makeHandler({readCatalog:()=>{assert.equal(i.deferred,true); reads++; return catalog;},adminBit:8n});
  await handle(i); assert.equal(i.deferral.flags,64); assert.equal(reads,1); assert.match(i.replies[0].embeds[0].title,/Português.*2/); assert.equal(i.replies[0].flags,undefined);
});
test('interações de outros comandos ou componentes são ignoradas', async () => {
  let reads=0; const handle=makeHandler({readCatalog:()=>{reads++;},adminBit:8n});
  for (const i of [interaction({commandName:'outro'}),interaction({isChatInputCommand:()=>false,isStringSelectMenu:()=>true,customId:'desconhecido'})]) {await handle(i); assert.equal(i.replies.length,0);}
  assert.equal(reads,0);
});
test('catálogo quebrado gera erro privado sem detalhes internos', async () => {
  const handle=makeHandler({readCatalog:()=>{throw Error('segredo');},adminBit:8n,log:()=>{}});
  const i=interaction({isChatInputCommand:()=>false,isStringSelectMenu:()=>true,customId:IDS.grades,values:['6']});
  await handle(i); assert.equal(i.deferred,true); assert.doesNotMatch(i.replies[0].content,/segredo/); assert.deepEqual(i.replies[0].components,[]);
});
test('erro antes da resposta é tratado privadamente', async () => {
  const i=interaction({inGuild:()=>{throw Error('segredo');}}); await makeHandler({readCatalog,adminBit:8n,log:()=>{}})(i);
  assert.equal(i.replies[0].flags,64); assert.doesNotMatch(i.replies[0].content,/segredo/);
});
test('falha ao responder não derruba o processo', async () => {
  const i=interaction({reply:async()=>{throw Error('falha');}}); await assert.doesNotReject(makeHandler({readCatalog,adminBit:8n,log:()=>{}})(i));
});
test('inicialização sem token falha claramente e sem rede', () => {
  const r=spawnSync(process.execPath,['src/index.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,DISCORD_TOKEN:''},encoding:'utf8',timeout:5000});
  assert.equal(r.status,1); assert.match(r.stderr,/DISCORD_TOKEN não configurado/);
});
test('registro sem credenciais falha claramente e sem rede', () => {
  const r=spawnSync(process.execPath,['src/register.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,DISCORD_TOKEN:'',DISCORD_CLIENT_ID:''},encoding:'utf8',timeout:5000});
  assert.equal(r.status,1); assert.match(r.stderr,/Preencha DISCORD_TOKEN e DISCORD_CLIENT_ID/);
});
