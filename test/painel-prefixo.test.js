'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const { BUTTONS, MODALS, IDS, panel, selection, choiceModal, gradeMenu, actionGradeMenu } = require('../src/ui');
const { readCatalog, GRADES, ACTION } = require('../src/catalog');
const { makeHandler, makePrefixHandler } = require('../src/handlers');
const catalog = readCatalog();
function interaction(extra) {
  return { isChatInputCommand:()=>false, isButton:()=>false, isModalSubmit:()=>false, isStringSelectMenu:()=>false,
    replies:[], async reply(p){this.replies.push(p);this.replied=true;}, async showModal(m){this.modal=m;this.replied=true;},
    async deferReply(p){this.deferred=true;this.deferral=p;}, async editReply(p){this.replies.push(p);}, ...extra };
}
test('Apostilas e SP em Ação abrem menus privados', async()=>{
  const handle=makeHandler({readCatalog,adminBit:8n});
  const grades=interaction({isButton:()=>true,customId:BUTTONS.grades});
  await handle(grades); const {flags,...expected}=gradeMenu(catalog);
  assert.equal(flags,64); assert.equal(grades.deferral.flags,64); assert.deepEqual(grades.replies,[expected]);
  assert.equal(grades.modal,undefined);
  const action=interaction({isButton:()=>true,customId:BUTTONS.action});
  await handle(action); const {flags:actionFlags,...actionExpected}=actionGradeMenu(catalog);
  assert.equal(actionFlags,64); assert.equal(action.deferral.flags,64); assert.deepEqual(action.replies,[actionExpected]); assert.equal(action.modal,undefined);
  const unknown=interaction({isButton:()=>true,customId:'outro'}); await handle(unknown); assert.equal(unknown.modal,undefined);
});
test('menu segue a referência e conta somente arquivos liberados',()=>{
  const { ActionRowBuilder, EmbedBuilder }=require('discord.js');
  const p=gradeMenu(catalog); const options=p.components[0].components[0].options;
  assert.equal(p.flags,64); assert.equal(p.embeds[0].title,'Apostilas normais – Série');
  assert.equal(p.components[0].components[0].placeholder,'Selecione uma série');
  assert.deepEqual(options.map(x=>x.value),['em3','em2','em1','9','8','7','6']);
  for(const o of options) { const count=catalog.groups[o.value].files.filter(require('../src/catalog').validFile).length; assert.equal(o.description,`${count} ${count===1?'volume disponível':'volumes disponíveis'}`); }
  assert.doesNotThrow(()=>ActionRowBuilder.from(p.components[0]).toJSON());
  assert.doesNotThrow(()=>new EmbedBuilder(p.embeds[0]).toJSON());
  const empty=structuredClone(catalog); empty.groups.em3.files.forEach(f=>f.url=null);
  assert.equal(gradeMenu(empty).components[0].components[0].options[0].description,'0 volumes disponíveis');
});
test('cada série do novo menu retorna os mesmos arquivos em resposta privada', async()=>{
  for(const option of gradeMenu(catalog).components[0].components[0].options) {
    const i=interaction({isStringSelectMenu:()=>true,customId:IDS.grades,values:[option.value]});
    await makeHandler({readCatalog,adminBit:8n})(i);
    const {flags,...expected}=selection(catalog,IDS.grades,option.value);
    assert.equal(flags,64); assert.equal(i.deferral.flags,64); assert.deepEqual(i.replies,[expected]);
  }
});
test('erro ao carregar catálogo no menu falha em resposta privada', async()=>{
  const i=interaction({isButton:()=>true,customId:BUTTONS.grades});
  await makeHandler({readCatalog:()=>{throw Error('erro');},adminBit:8n,log:()=>{}})(i);
  assert.equal(i.deferral.flags,64); assert.match(i.replies[0].content,/não foi possível/i);
  assert.deepEqual(i.replies[0].components,[]);
});
test('cada uma das 13 escolhas no formulário devolve a mesma resposta privada', async()=>{
  let checks=0;
  for(const [modalId,menuId,values] of [[MODALS.grades,IDS.grades,GRADES],[MODALS.action,IDS.action,ACTION]]) {
    for(const [value] of values) {
      const i=interaction({isModalSubmit:()=>true,customId:modalId,fields:{getStringSelectValues:id=>{assert.equal(id,menuId);return [value];}}});
      await makeHandler({readCatalog:()=>{assert.equal(i.deferred,true); return catalog;},adminBit:8n})(i);
      const {flags,...expected}=selection(catalog,menuId,value);
      assert.equal(flags,64); assert.equal(i.deferral.flags,64); assert.deepEqual(i.replies,[expected]); checks++;
    }
  }
  assert.equal(checks,13);
});
test('seleção inválida no formulário falha fechada e segue privada', async()=>{
  const i=interaction({isModalSubmit:()=>true,customId:MODALS.grades,fields:{getStringSelectValues:()=>['portugues1']}});
  await makeHandler({readCatalog,adminBit:8n})(i); assert.equal(i.deferral.flags,64); assert.match(i.replies[0].content,/não foi possível/i);
});
test('painéis antigos continuam respondendo aos menus', async()=>{
  const i=interaction({isStringSelectMenu:()=>true,customId:IDS.grades,values:['6']});
  await makeHandler({readCatalog,adminBit:8n})(i); const {flags,...expected}=selection(catalog,IDS.grades,'6');
  assert.equal(flags,64); assert.equal(i.deferral.flags,64); assert.deepEqual(i.replies,[expected]);
});
function message(extra={}) {
  const sent=[]; return {sent,guild:{},author:{bot:false},system:false,content:'*apostila',member:{permissions:{has:bit=>bit===8n}},channel:{send:async p=>sent.push(p)},...extra};
}
test('prefixo exato de administrador publica painel sem mencionar pessoas', async()=>{
  const m=message({content:' *APOSTILA '}); await makePrefixHandler({adminBit:8n})(m);
  assert.deepEqual(m.sent,[panel()]); assert.deepEqual(m.sent[0].allowedMentions,{parse:[]});
});
test('prefixo ignora não administrador, bots, PV, texto diferente e argumentos', async()=>{
  const handle=makePrefixHandler({adminBit:8n});
  for(const extra of [{guild:null},{author:{bot:true}},{system:true},{author:null},{member:null},{member:{permissions:{has:()=>false}}},{content:'*apostilas'},{content:'*apostila extra'},{content:'antes *apostila'},{content:null}]) {
    const m=message(extra); await handle(m); assert.deepEqual(m.sent,[]);
  }
});
test('falha no envio do painel não vaza o erro nem derruba o processo', async()=>{
  const logs=[]; const m=message({channel:{send:async()=>{throw Error('segredo');}}});
  await assert.doesNotReject(makePrefixHandler({adminBit:8n,log:x=>logs.push(x)})(m)); assert.doesNotMatch(logs.join(' '),/segredo/);
});
test('inicialização com prefixo opt-in solicita os intents e instala listener',()=>{
  const fixture=`
const Module=require('node:module'),old=Module._load;
class Client {constructor(o){console.log('INTENTS',JSON.stringify(o.intents))} once(){} on(n,f){console.log('EVENT',n,typeof f)} login(){return Promise.resolve()}}
Module._load=function(n,...a){
 if(n==='dotenv') return {config:()=>({})};
 if(n==='discord.js') return {Client,GatewayIntentBits:{Guilds:1,GuildMessages:512,MessageContent:32768},Events:{ClientReady:'ready',InteractionCreate:'interaction',MessageCreate:'message'},PermissionFlagsBits:{Administrator:8n}};
 if(n==='./catalog') return {readCatalog:()=>({})};
 if(n==='./http-server') return {getPort:()=>1,startHttpServer:async()=>{}};
 if(n==='./auto-register') return {registerPanelCommand:async()=>{}};
 return old.call(this,n,...a);
}; require('./src/index');`;
  const r=spawnSync(process.execPath,['-e',fixture],{cwd:require('node:path').join(__dirname,'..'),env:{DISCORD_TOKEN:'dummy',APOSTILA_PREFIX_ENABLED:'1'},encoding:'utf8',timeout:5000});
  assert.equal(r.status,0,r.stderr); assert.match(r.stdout,/INTENTS \[1,512,32768\]/); assert.match(r.stdout,/EVENT message function/);
});
