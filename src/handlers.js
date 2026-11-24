'use strict';
const { panel, selection, IDS } = require('./ui');

// Dependencies are injected so interactions can be exercised offline.
function makeHandler({ readCatalog, adminBit, log = console.error }) {
  return async function handle(interaction) {
    try {
      if (interaction.isChatInputCommand() && interaction.commandName === 'apostilas') {
        if (!interaction.inGuild() || !interaction.memberPermissions?.has(adminBit)) {
          return await interaction.reply({ content: 'Somente administradores podem criar o painel em um servidor.', flags: 64, allowedMentions: { parse: [] } });
        }
        return await interaction.reply(panel());
      }
      if (interaction.isStringSelectMenu() && Object.values(IDS).includes(interaction.customId)) {
        // Discord expires interaction tokens quickly. Acknowledge before disk I/O.
        await interaction.deferReply({ flags: 64 });
        const { flags: _ephemeralAlreadySet, ...payload } = selection(readCatalog(), interaction.customId, interaction.values[0]);
        return await interaction.editReply(payload);
      }
    } catch (error) {
      log('Falha ao processar interação:', error?.message || 'erro desconhecido');
      const message = { content: 'Não foi possível atender agora. Avise um administrador.', embeds: [], components: [], allowedMentions: { parse: [] } };
      try {
        if (interaction.deferred || interaction.replied) await interaction.editReply(message);
        else await interaction.reply({ ...message, flags: 64 });
      } catch { /* Token expired or response failed; error was logged above. */ }
    }
  };
}
module.exports = { makeHandler };
