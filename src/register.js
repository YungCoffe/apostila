'use strict';
require('dotenv').config();
const { REST, Routes, SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { DISCORD_TOKEN: token, DISCORD_CLIENT_ID: clientId, DISCORD_GUILD_ID: guildId } = process.env;
if (!token || !clientId) { console.error('Preencha DISCORD_TOKEN e DISCORD_CLIENT_ID no .env.'); process.exit(1); }
const command = new SlashCommandBuilder().setName('apostilas').setDescription('Publica o painel de apostilas neste canal.')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator).setDMPermission(false).toJSON();
// POST adds or updates only this command; it does not overwrite other bot commands.
const route = guildId ? Routes.applicationGuildCommands(clientId, guildId) : Routes.applicationCommands(clientId);
new REST({ version: '10' }).setToken(token).post(route, { body: command })
  .then(() => console.log(guildId ? 'Comando registrado no servidor.' : 'Comando global registrado; pode demorar a aparecer.'))
  .catch(e => { console.error('Falha ao registrar comando:', e.message); process.exitCode = 1; });
