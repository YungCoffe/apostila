'use strict';
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

const panelCommand = new SlashCommandBuilder()
  .setName('apostilas')
  .setDescription('Publica o painel de apostilas neste canal.')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .setDMPermission(false)
  .toJSON();

// Only create a missing global command. Never replace other commands or an existing namesake.
async function registerPanelCommand(client) {
  const commands = client.application?.commands;
  if (!commands) throw new Error('Aplicação do Discord indisponível.');
  const current = await commands.fetch();
  const existing = current.find(command => command.name === 'apostilas' && command.type === 1);
  if (existing) {
    const compatible = existing.description === panelCommand.description &&
      existing.defaultMemberPermissions?.has(PermissionFlagsBits.Administrator) &&
      existing.dmPermission === false;
    return compatible ? 'existente' : 'conflito';
  }
  const created = await commands.create(panelCommand);
  const verified = await commands.fetch(created.id, { force: true });
  if (verified.name !== 'apostilas' || verified.type !== 1) throw new Error('Registro não confirmado.');
  return 'criado';
}
module.exports = { registerPanelCommand };
