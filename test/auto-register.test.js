'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { PermissionFlagsBits } = require('discord.js');
const { registerPanelCommand } = require('../src/auto-register');

function fixture(entries = []) {
  const calls = [];
  const commands = {
    async fetch(id, options) { calls.push(['fetch', id, options]); return id ? { id, name: 'apostilas', type: 1 } : { find: fn => entries.find(fn) }; },
    async create(body) { calls.push(['create', body]); return { id: 'new' }; }
  };
  return { client: { application: { commands } }, calls };
}
test('cria e confirma apenas o comando ausente', async () => {
  const { client, calls } = fixture([{ name: 'outro', type: 1 }]);
  assert.equal(await registerPanelCommand(client), 'criado');
  assert.equal(calls.filter(c => c[0] === 'create').length, 1);
  assert.equal(calls[1][1].name, 'apostilas');
  assert.equal(calls[1][1].default_member_permissions, String(PermissionFlagsBits.Administrator));
  assert.equal(calls[1][1].dm_permission, false);
  assert.deepEqual(calls[2], ['fetch', 'new', { force: true }]);
});
test('não recria um comando compatível', async () => {
  const existing = { name: 'apostilas', type: 1, description: 'Publica o painel de apostilas neste canal.', defaultMemberPermissions: { has: p => p === PermissionFlagsBits.Administrator }, dmPermission: false };
  const { client, calls } = fixture([existing]);
  assert.equal(await registerPanelCommand(client), 'existente');
  assert.equal(calls.length, 1);
});
test('não sobrescreve comando homônimo incompatível', async () => {
  const { client, calls } = fixture([{ name: 'apostilas', type: 1, description: 'outro' }]);
  assert.equal(await registerPanelCommand(client), 'conflito');
  assert.equal(calls.length, 1);
});
test('não mascara erro ao consultar Discord', async () => {
  await assert.rejects(registerPanelCommand({ application: { commands: { fetch: async () => { throw Error('erro'); } } } }), /erro/);
});
test('não considera confirmado comando inesperado', async () => {
  const f = fixture();
  const original = f.client.application.commands.fetch;
  f.client.application.commands.fetch = async id => id ? { name: 'outro', type: 1 } : original(id);
  await assert.rejects(registerPanelCommand(f.client), /não confirmado/);
});
