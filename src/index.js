'use strict';
require('dotenv').config();
const { Client, GatewayIntentBits, Events, PermissionFlagsBits } = require('discord.js');
const { readCatalog } = require('./catalog');
const { makeHandler } = require('./handlers');
const { getPort, startHttpServer } = require('./http-server');
const { registerPanelCommand } = require('./auto-register');

async function main() {
  if (!process.env.DISCORD_TOKEN) { console.error('DISCORD_TOKEN não configurado.'); process.exit(1); }
  try { readCatalog(); } catch (e) { console.error('Catálogo indisponível ou inválido:', e.message); process.exit(1); }
  try {
    const port = getPort(process.env.PORT);
    await startHttpServer(port);
    console.log(`Servidor HTTP disponível em 0.0.0.0:${port}.`);
  } catch (error) {
    const codes = ['EADDRINUSE', 'EACCES', 'EADDRNOTAVAIL'];
    const detail = codes.includes(error.code) ? ` (${error.code})` : '';
    console.error(`Não foi possível abrir a porta HTTP${detail}. Verifique PORT e a disponibilidade da porta.`);
    process.exit(1);
  }
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  client.once(Events.ClientReady, ready => {
    console.log(`Conectado como ${ready.user.tag}.`);
    registerPanelCommand(ready).then(result => {
      if (result === 'conflito') console.error('Comando /apostilas já existe com configurações diferentes; não foi alterado.');
      else console.log(result === 'criado' ? 'Comando global /apostilas registrado; pode demorar a aparecer.' : 'Comando global /apostilas já registrado.');
    }).catch(() => console.error('Não foi possível confirmar o registro de /apostilas no Discord.'));
  });
  client.on(Events.InteractionCreate, makeHandler({ readCatalog, adminBit: PermissionFlagsBits.Administrator }));
  client.login(process.env.DISCORD_TOKEN).catch(() => { console.error('Não foi possível conectar ao Discord. Confira as credenciais e a rede.'); process.exit(1); });
}

main();
