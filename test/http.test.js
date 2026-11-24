'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const path = require('node:path');
const { DEFAULT_PORT, HOST, getPort, startHttpServer } = require('../src/http-server');

async function reservePort() {
  const server = net.createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return server;
}
async function freePort() {
  const holder = await reservePort();
  const port = holder.address().port;
  await new Promise((resolve, reject) => holder.close(err => err ? reject(err) : resolve()));
  return port;
}
function request(port, pathname, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: pathname, method, timeout: 2000 }, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    req.end();
  });
}
const close = server => new Promise((resolve, reject) => server.close(err => err ? reject(err) : resolve()));

test('PORT padrão, limites e entradas inválidas', () => {
  assert.equal(HOST, '0.0.0.0');
  assert.equal(DEFAULT_PORT, 10000);
  assert.equal(getPort(undefined), 10000);
  assert.equal(getPort(''), 10000);
  assert.equal(getPort('1'), 1);
  assert.equal(getPort('65535'), 65535);
  assert.equal(getPort('3456'), 3456);
  for (const value of ['0', '-1', '65536', '1.1', ' 123', '123 ', 'abc', '1e3', 'Infinity', '99999999999999999999999']) {
    assert.throws(() => getPort(value), /PORT/);
    assert.throws(() => startHttpServer(value), /PORT/);
  }
});

test('servidor usa a porta escolhida e escuta em todas as interfaces IPv4', async t => {
  const port = await freePort();
  const server = await startHttpServer(port);
  t.after(() => close(server));
  assert.equal(server.address().address, '0.0.0.0');
  assert.equal(server.address().port, port);
  for (const url of ['/', '/health', '/health?token=nao-refletir']) {
    const r = await request(port, url);
    assert.equal(r.status, 200);
    assert.match(r.headers['content-type'], /^application\/json/);
    assert.equal(r.headers['cache-control'], 'no-store');
    assert.deepEqual(JSON.parse(r.body), { http: 'disponível', discord: 'não verificado' });
    assert.doesNotMatch(r.body, /nao-refletir/);
  }
  const missing = await request(port, '/desconhecido');
  assert.equal(missing.status, 404);
  assert.deepEqual(JSON.parse(missing.body), { error: 'Não encontrado' });
  const post = await request(port, '/health', 'POST');
  assert.equal(post.status, 405);
  assert.equal(post.headers.allow, 'GET');
});

test('porta já ocupada rejeita com EADDRINUSE', async t => {
  // Em 127.0.0.1, o endereço 0.0.0.0 ainda conflita na mesma porta.
  const holder = await reservePort();
  t.after(() => close(holder));
  await assert.rejects(startHttpServer(holder.address().port), { code: 'EADDRINUSE' });
});

// Subprocesso isola process.exit, e mocks impedem leitura de .env ou conexão real.
const fixture = `
const Module = require('node:module');
const original = Module._load;
class FakeClient {
  constructor(options) { process.send({event:'client', intents:options.intents}); }
  once(event, fn) { process.send({event:'once', name:event, handler:typeof fn}); }
  on(event, fn) { process.send({event:'on', name:event, handler:typeof fn}); }
  login(token) { process.send({event:'login', hasToken:!!token}); return Promise.resolve(); }
}
Module._load = function(name, ...args) {
  if (name === 'dotenv') return {config:()=>({})};
  if (name === 'discord.js') return {Client:FakeClient, GatewayIntentBits:{Guilds:1}, Events:{ClientReady:'ready',InteractionCreate:'interaction'}, PermissionFlagsBits:{Administrator:8n}};
  if (name === './catalog') return {readCatalog:()=>({})};
  if (name === './handlers') return {makeHandler:()=>()=>{}};
  if (name === './auto-register') return {registerPanelCommand:async()=> 'existente'};
  return original.call(this, name, ...args);
};
require('./src/index.js');
`;
function launch(port) {
  return spawn(process.execPath, ['-e', fixture], {
    cwd: path.resolve(__dirname, '..'),
    env: { PORT: String(port), DISCORD_TOKEN: 'token-ficticio-offline' },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc']
  });
}
function collect(child) {
  const messages = [];
  let stderr = '';
  child.on('message', msg => messages.push(msg));
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', data => { stderr += data; });
  return { messages, errors: () => stderr };
}
async function waitForLogin(child, messages) {
  const timeout = setTimeout(() => child.kill(), 5000);
  try {
    while (!messages.some(m => m.event === 'login')) {
      if (child.exitCode !== null || child.signalCode !== null) throw new Error('processo encerrou antes do login simulado');
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  } finally { clearTimeout(timeout); }
}

test('inicialização real abre HTTP e preserva intents, handlers e login simulado', async t => {
  const port = await freePort();
  const child = launch(port);
  const { messages } = collect(child);
  t.after(() => { if (child.exitCode === null && child.signalCode === null) child.kill(); });
  await waitForLogin(child, messages);
  assert.deepEqual(messages.find(m => m.event === 'client').intents, [1]);
  assert.ok(messages.some(m => m.event === 'once' && m.name === 'ready' && m.handler === 'function'));
  assert.ok(messages.some(m => m.event === 'on' && m.name === 'interaction' && m.handler === 'function'));
  assert.ok(messages.some(m => m.event === 'login' && m.hasToken));
  assert.equal((await request(port, '/health')).status, 200);
});

test('porta ocupada encerra inicialização antes de criar cliente ou fazer login', async t => {
  const holder = await reservePort();
  t.after(() => close(holder));
  const child = launch(holder.address().port);
  const { messages, errors } = collect(child);
  const [code] = await once(child, 'exit');
  assert.equal(code, 1);
  assert.match(errors(), /EADDRINUSE/);
  assert.equal(messages.length, 0);
  assert.doesNotMatch(errors(), /token-ficticio-offline/);
});

test('PORT inválida encerra inicialização antes do login, sem expor segredos', async () => {
  const child = launch('invalid');
  const { messages, errors } = collect(child);
  const [code] = await once(child, 'exit');
  assert.equal(code, 1);
  assert.match(errors(), /Não foi possível abrir a porta HTTP/);
  assert.equal(messages.length, 0);
  assert.doesNotMatch(errors(), /token-ficticio-offline/);
});
