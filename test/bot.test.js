'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { spawnSync } = require('node:child_process');
const { EmbedBuilder, ActionRowBuilder, ModalBuilder } = require('discord.js');
const { readCatalog, validFile, GRADES, ACTION } = require('../src/catalog');
const { panel, selection, choiceModal, IDS, BUTTONS, MODALS } = require('../src/ui');
const { makeHandler, makePrefixHandler } = require('../src/handlers');
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
test('as 13 seleções reais mostram exatamente os links cadastrados', () => {
  for (const [id] of [...GRADES, ...ACTION]) {
    const p = selection(actual, GRADES.some(([g])=>g===id) ? IDS.grades : IDS.action, id);
    assert.equal(p.flags,64);
    assert.deepEqual(p.components[0].components.map(button => button.url), actual.groups[id].files.map(f => f.url));
    assert.doesNotMatch(p.embeds[0].description,/não estão disponíveis/);
    assert.doesNotThrow(()=>ActionRowBuilder.from(p.components[0]).toJSON());
  }
});
test('as 13 seleções sem links continuam indisponíveis', () => {
  for (const [id] of [...GRADES, ...ACTION]) {
    const p = selection(catalog, GRADES.some(([g])=>g===id) ? IDS.grades : IDS.action, id);
    assert.equal(p.flags,64); assert.equal(p.components,undefined); assert.match(p.embeds[0].description,/não estão disponíveis/);
  }
});
test('painel tem dois botões lado a lado e os formulários preservam as opções', () => {
  const p = panel(); assert.equal(p.components.length,1);
  assert.equal(p.embeds[0].title,'📄 Apostilas');
  assert.equal(p.embeds[0].description,'Escolha sua apostila abaixo.');
  assert.deepEqual(p.embeds[0].image, { url: 'attachment://banner.png' });
  assert.equal(p.files.length, 1); assert.equal(p.files[0].name, 'banner.png');
  assert.equal(p.files[0].attachment, path.join(__dirname, '../assets/banner.png'));
  assert.equal(fs.readFileSync(p.files[0].attachment).subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.deepEqual(p.components[0].components.map(b=>[b.label,b.custom_id]), [['Apostilas',BUTTONS.grades],['SP em Ação',BUTTONS.action]]);
  for (const [button, modalId, menuId, values] of [[BUTTONS.grades, MODALS.grades, IDS.grades, GRADES], [BUTTONS.action, MODALS.action, IDS.action, ACTION]]) {
    const modal=choiceModal(button);
    assert.equal(modal.custom_id,modalId);
    assert.equal(modal.components[0].component.custom_id,menuId);
    assert.deepEqual(modal.components[0].component.options.map(o=>o.value),values.map(([id])=>id));
    assert.doesNotThrow(()=>new ModalBuilder(modal).toJSON());
  }
  assert.equal(choiceModal('outro'), null);
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
