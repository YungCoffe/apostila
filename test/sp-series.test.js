'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { ActionRowBuilder, EmbedBuilder } = require('discord.js');
const { readCatalog } = require('../src/catalog');
const { actionGradeMenu, selection, IDS, BUTTONS } = require('../src/ui');
const { makeHandler } = require('../src/handlers');
const catalog = readCatalog();
function interaction(extra) {
  return {isChatInputCommand:()=>false,isButton:()=>false,isModalSubmit:()=>false,isStringSelectMenu:()=>false,
    replies:[], async reply(p){this.replies.push(p);this.replied=true;},
    async deferReply(p){this.deferral=p;this.deferred=true;},async editReply(p){this.replies.push(p);},...extra};
}
test('SP em Ação oferece somente 9º e 3ª série em menu privado válido', async()=>{
  const m=actionGradeMenu(catalog), select=m.components[0].components[0];
  assert.equal(m.flags,64); assert.equal(select.custom_id,IDS.actionGrade);
  assert.deepEqual(select.options.map(o=>o.value),['9','em3']);
  assert.deepEqual(select.options.map(o=>o.description),['2 arquivos disponíveis','2 arquivos disponíveis']);
  assert.doesNotThrow(()=>ActionRowBuilder.from(m.components[0]).toJSON());
  assert.doesNotThrow(()=>new EmbedBuilder(m.embeds[0]).toJSON());
  const i=interaction({isButton:()=>true,customId:BUTTONS.action});
  await makeHandler({readCatalog,adminBit:8n})(i); const {flags,...expected}=m;
  assert.equal(i.deferral.flags,64); assert.deepEqual(i.replies,[expected]);
});
test('cada série entrega privadamente os livros corretos e indica manual do professor', async()=>{
  for(const [grade,ids] of [['9',['portugues2','matematica2']],['em3',['portugues3','matematica3']]]) {
    const i=interaction({isStringSelectMenu:()=>true,customId:IDS.actionGrade,values:[grade]});
    await makeHandler({readCatalog,adminBit:8n})(i);
    assert.equal(i.deferral.flags,64); const p=i.replies[0];
    assert.match(p.embeds[0].description,/manuais do professor/i);
    assert.deepEqual(p.components[0].components.map(x=>x.url),ids.map(id=>catalog.groups[id].files[0].url));
    assert.doesNotThrow(()=>ActionRowBuilder.from(p.components[0]).toJSON());
  }
});
test('arquivos não verificados e seleções inválidas não são disponibilizados',()=>{
  const c=structuredClone(catalog); c.groups.portugues2.files[0].url='https://example.com/nao-verificado.pdf';
  assert.equal(actionGradeMenu(c).components[0].components[0].options[0].description,'1 arquivo disponível');
  const one=selection(c,IDS.actionGrade,'9'); assert.equal(one.components[0].components.length,1);
  assert.match(one.embeds[0].description,/1 arquivo/);
  c.groups.matematica2.files[0].url=null;
  const empty=selection(c,IDS.actionGrade,'9'); assert.equal(empty.components,undefined);
  assert.match(empty.embeds[0].description,/não estão disponíveis/);
  for(const bad of ['6','portugues1','toString','__proto__','']) {
    const p=selection(catalog,IDS.actionGrade,bad); assert.equal(p.flags,64); assert.equal(p.components,undefined); assert.match(p.content,/não foi possível/i);
  }
});
test('falha de leitura do catálogo não revela informação e responde de forma privada',async()=>{
  const i=interaction({isButton:()=>true,customId:BUTTONS.action});
  await makeHandler({readCatalog:()=>{throw Error('segredo');},adminBit:8n,log:()=>{}})(i);
  assert.equal(i.deferral.flags,64); assert.doesNotMatch(i.replies[0].content,/segredo/); assert.deepEqual(i.replies[0].components,[]);
});
