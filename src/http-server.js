'use strict';
const http = require('node:http');

const HOST = '0.0.0.0';
const DEFAULT_PORT = 10000;

function getPort(value) {
  if (value === undefined || value === '') return DEFAULT_PORT;
  if (!/^\d+$/.test(value)) throw new Error('PORT deve ser um número inteiro entre 1 e 65535.');
  const port = Number(value);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error('PORT deve ser um número inteiro entre 1 e 65535.');
  return port;
}

function startHttpServer(value = process.env.PORT) {
  // Valida também chamadas diretas, não apenas a inicialização em index.js.
  const port = getPort(value);
  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      res.writeHead(405);
      return res.end('{"error":"Método não permitido"}');
    }
    // Ignora a query string; não reflete URL, cabeçalhos ou ambiente na resposta.
    const pathname = (req.url || '').split('?')[0];
    if (pathname !== '/' && pathname !== '/health') {
      res.writeHead(404);
      return res.end('{"error":"Não encontrado"}');
    }
    res.writeHead(200);
    res.end('{"http":"disponível","discord":"não verificado"}');
  });

  return new Promise((resolve, reject) => {
    let listening = false;
    server.on('error', error => {
      if (!listening) return reject(error);
      // Um erro posterior ao bind também deve terminar o processo, sem vazar detalhes.
      console.error('Erro no servidor HTTP; encerrando o processo.');
      process.exit(1);
    });
    server.listen(port, HOST, () => {
      listening = true;
      resolve(server);
    });
  });
}

module.exports = { DEFAULT_PORT, HOST, getPort, startHttpServer };
