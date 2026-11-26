'use strict';
const https = require('node:https');

const URL = 'https://leiasp.onrender.com/health';
const INTERVAL_MS = 5 * 60 * 1000;
const TIMEOUT_MS = 15 * 1000;

// Uma instância por processo. O timeout cobre DNS, conexão e leitura do corpo.
function createSelfPing({ get = https.get, logger = console, timers = globalThis } = {}) {
  let interval = null;
  let timeout = null;
  let request = null;
  function warn(message) {
    try { logger.warn(message); } catch (_) { /* logging nunca derruba o serviço */ }
  }
  function tick() {
    if (request) return;
    try {
      const current = get(URL, { method: 'GET' }, response => {
        if (response.statusCode !== 200) warn('Self-ping retornou status diferente de 200.');
        response.on('error', () => { warn('Falha ao ler resposta do self-ping.'); });
        response.resume();
      });
      request = current;
      current.on('error', () => { warn('Falha no self-ping.'); });
      current.on('close', () => {
        if (request !== current) return;
        if (timeout !== null) timers.clearTimeout(timeout);
        timeout = null;
        request = null;
      });
      timeout = timers.setTimeout(() => {
        if (request === current) {
          warn('Self-ping excedeu o tempo limite.');
          current.destroy();
        }
      }, TIMEOUT_MS);
      if (typeof timeout.unref === 'function') timeout.unref();
    } catch (_) {
      warn('Não foi possível iniciar o self-ping.');
    }
  }
  return {
    start() {
      if (interval !== null) return;
      interval = timers.setInterval(tick, INTERVAL_MS);
      if (typeof interval.unref === 'function') interval.unref();

    }
  };
}
module.exports = { createSelfPing, URL, INTERVAL_MS, TIMEOUT_MS };
