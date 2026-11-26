'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const net = require('node:net');
const { once } = require('node:events');
const { spawn } = require('node:child_process');
const path = require('node:path');
const { createSelfPing } = require('../src/self-ping');

const waitUntil = async predicate => {
  const limit = Date.now() + 4000;
  while (!predicate()) {
    if (Date.now() > limit) throw new Error('tempo esgotado no teste');
    await new Promise(resolve => setTimeout(resolve, 10));
  }
};
async function availablePort() {
  const server = net.createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}
function pingHarness(port, timeoutMs = 150) {
  let tick;
  const logs = [];
  const requests = [];
  const timers = {
    setInterval(fn) { tick = fn; return { unref() {} }; },
    setTimeout(fn) { return setTimeout(fn, timeoutMs); },
    clearTimeout
  };
  const get = (_url, options, callback) => {
    const req = http.get({ hostname: '127.0.0.1', port, method: options.method }, callback);
    requests.push(req);
    return req;
  };
  createSelfPing({ get, timers, logger: { warn: msg => logs.push(msg) } }).start();
  return { tick: () => tick(), logs, requests };
}

test('falha de conexão real não derruba o processo e permite tentar novamente', async () => {
  const port = await availablePort();
  const s = pingHarness(port);
  s.tick();
  await waitUntil(() => s.requests[0].closed);
  assert.ok(s.logs.includes('Falha no self-ping.'));
  s.tick();
  await waitUntil(() => s.requests.length === 2 && s.requests[1].closed);
  assert.equal(s.requests.length, 2);
});

test('resposta travada expira, fecha e permite novo ping real', async t => {
  let received = 0;
  const server = http.createServer((req, res) => {
    received++;
    if (received > 1) res.end('ok');
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const s = pingHarness(server.address().port);
  s.tick();
  await waitUntil(() => s.requests[0].closed);
  assert.ok(s.logs.includes('Self-ping excedeu o tempo limite.'));
  s.tick();
  await waitUntil(() => s.requests.length === 2 && s.requests[1].closed);
  assert.equal(received, 2);
});

const fixture = `
const Module = require('node:module'); const original = Module._load;
const report = event => process.send({event});
class Client {
  constructor() { report('client'); }
  once() {} on() {}
  login() { report('login'); return process.env.TEST_FAIL ? Promise.reject(new Error('private')) : Promise.resolve(); }
}
Module._load = function(name, ...args) {
  if (name === 'dotenv') return {config(){}};
  if (name === 'discord.js') return {Client, GatewayIntentBits:{Guilds:1}, Events:{ClientReady:'ready',InteractionCreate:'interaction'},PermissionFlagsBits:{Administrator:8n}};
  if (name === './catalog') return {readCatalog(){return {};}};
  if (name === './http-server') {
    const mod = original.call(this, name, ...args);
    return {...mod, async startHttpServer(port) { const server = await mod.startHttpServer(port); report('server'); return server; }};
  }
  if (name === './handlers') return {makeHandler(){return ()=>{};}};
  if (name === './auto-register') return {registerPanelCommand:async()=> 'existente'};
  if (name === './self-ping') return {createSelfPing(){return {start(){report('ping');}}}};
  return original.call(this,name,...args);
};
require('./src/index.js');`;
function launch(port, fail = false) {
  return spawn(process.execPath, ['-e', fixture], {
    cwd: path.resolve(__dirname, '..'),
    env: { PORT: String(port), DISCORD_TOKEN: 'ficticio', ...(fail ? { TEST_FAIL: '1' } : {}) },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc']
  });
}

test('self-ping inicia após servidor e cliente, antes de login; SIGTERM usa padrão', async t => {
  const port = await availablePort();
  const child = launch(port);
  t.after(() => { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); });
  const events = [];
  child.on('message', msg => events.push(msg.event));
  await waitUntil(() => events.includes('login'));
  assert.deepEqual(events, ['server', 'client', 'ping', 'login']);
  const result = await new Promise((resolve, reject) => {
    const req = http.get({ hostname: '127.0.0.1', port, path: '/health' }, res => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
    req.on('error', reject);
  });
  assert.equal(result, 200);
  child.kill('SIGTERM');
  const [code, signal] = await once(child, 'exit');
  assert.equal(code, null); assert.equal(signal, 'SIGTERM');
});

test('falha de login encerra imediatamente com código 1, sem expor o erro', async () => {
  const child = launch(await availablePort(), true);
  let stderr = ''; child.stderr.on('data', chunk => { stderr += chunk; });
  const events = []; child.on('message', msg => events.push(msg.event));
  const [code] = await once(child, 'exit');
  assert.equal(code, 1);
  assert.deepEqual(events, ['server', 'client', 'ping', 'login']);
  assert.match(stderr, /Não foi possível conectar ao Discord/);
  assert.doesNotMatch(stderr, /private|ficticio/);
});
