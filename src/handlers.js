'use strict';
const { panel, selection, IDS, BUTTONS, MODALS, gradeMenu, actionGradeMenu } = require('./ui');

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
      if (interaction.isButton?.() && Object.values(BUTTONS).includes(interaction.customId)) {
        await interaction.deferReply({ flags: 64 });
        const menu = interaction.customId === BUTTONS.grades ? gradeMenu : actionGradeMenu;
        const { flags: _ephemeralAlreadySet, ...payload } = menu(readCatalog());
        return await interaction.editReply(payload);
      }
      if (interaction.isModalSubmit?.() && Object.values(MODALS).includes(interaction.customId)) {
        const menuId = interaction.customId === MODALS.grades ? IDS.grades : IDS.action;
        const values = interaction.fields.getStringSelectValues(menuId);
        await interaction.deferReply({ flags: 64 });
        const { flags: _ephemeralAlreadySet, ...payload } = selection(readCatalog(), menuId, values[0]);
        return await interaction.editReply(payload);
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

function makePrefixHandler({ adminBit, log = console.error }) {
  return async function handleMessage(message) {
    if (!message.guild || !message.author || message.author.bot || message.system ||
        typeof message.content !== 'string' || message.content.trim().toLowerCase() !== '*apostila' ||
        !message.member?.permissions?.has(adminBit)) return;
    try { await message.channel.send(panel()); }
    catch { log('Não foi possível criar o painel pelo comando de texto.'); }
  };
}
module.exports = { makeHandler, makePrefixHandler };
