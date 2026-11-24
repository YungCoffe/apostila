'use strict';
require('dotenv').config();
const { Client, GatewayIntentBits, Events, PermissionFlagsBits } = require('discord.js');
const { readCatalog } = require('./catalog');
const { makeHandler } = require('./handlers');

if (!process.env.DISCORD_TOKEN) { console.error('DISCORD_TOKEN não configurado.'); process.exit(1); }
try { readCatalog(); } catch (e) { console.error('Catálogo indisponível ou inválido:', e.message); process.exit(1); }
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.once(Events.ClientReady, ready => console.log(`Conectado como ${ready.user.tag}.`));
client.on(Events.InteractionCreate, makeHandler({ readCatalog, adminBit: PermissionFlagsBits.Administrator }));
client.login(process.env.DISCORD_TOKEN).catch(() => { console.error('Não foi possível conectar ao Discord. Confira as credenciais e a rede.'); process.exit(1); });
