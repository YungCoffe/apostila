'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { isIP } = require('node:net');
const VERIFIED = require('./verified-files');

const GRADES = [
  ['6', '6º ano'], ['7', '7º ano'], ['8', '8º ano'], ['9', '9º ano'],
  ['em1', '1ª série do Ensino Médio'], ['em2', '2ª série do Ensino Médio'],
  ['em3', '3ª série do Ensino Médio'],
];
const ACTION = [
  ['portugues1', 'Português • Volume 1'], ['portugues2', 'Português • Volume 2'],
  ['portugues3', 'Português • Volume 3'], ['matematica1', 'Matemática • Volume 1'],
  ['matematica2', 'Matemática • Volume 2'], ['matematica3', 'Matemática • Volume 3'],
];
const SOURCE_IDS = ['169678/1781599','169683/1781645','169673/1781562','169691/1781692','169695/1781734','169686/1781669','169718/1783558','169722/1783579','169714/1783527','169730/1783622','169734/1783646','169726/1783605','169761/1784592','169756/1784568','169766/1784616','169775/1784647','169770/1784631','169785/1784689','169800/1784773','169804/1784795'];
const CONFIG_PATH = () => process.env.APOSTILAS_CONFIG || path.join(__dirname, '..', 'config', 'apostilas.json');

function readCatalog() {
  const value = JSON.parse(fs.readFileSync(CONFIG_PATH(), 'utf8'));
  if (!value || !value.groups || typeof value.groups !== 'object' || Array.isArray(value.groups)) throw new Error('Catálogo inválido');
  for (const [id] of [...GRADES, ...ACTION]) {
    const group = value.groups[id];
    const count = id === 'em3' ? 2 : GRADES.some(([key]) => key === id) ? 3 : 1;
    if (!group || typeof group.title !== 'string' || !group.title.trim() || !Array.isArray(group.files) || group.files.length !== count) throw new Error(`Grupo inválido: ${id}`);
    const expected = new Set(Array.from({ length: count }, (_, n) => count === 1 ? id : `${id}-${n + 1}`));
    for (const file of group.files) {
      if (!file || !expected.delete(file.id) || typeof file.label !== 'string' || !file.label.trim() || (file.url !== null && typeof file.url !== 'string') || typeof file.watermarked !== 'boolean') throw new Error(`Arquivo inválido no grupo: ${id}`);
    }
  }
  return value;
}

// A configuração não comprova a marca: também é necessária uma entrada
// revisada no código. A lista está vazia até haver PDFs comprovados.
function validFile(file) {
  if (!file || file.watermarked !== true || typeof file.id !== 'string' || typeof file.url !== 'string' || typeof file.label !== 'string' || !file.label.trim()) return false;
  if (!Object.hasOwn(VERIFIED, file.id)) return false;
  const reviewed = VERIFIED[file.id];
  if (!reviewed || reviewed.url !== file.url || !/^[a-f0-9]{64}$/i.test(reviewed.sha256 || '')) return false;
  try {
    const u = new URL(file.url);
    const host = u.hostname.toLowerCase();
    if (u.protocol !== 'https:' || u.username || u.password || !host.includes('.') || host === 'localhost' || host.endsWith('.local') || isIP(host.replace(/^\[|\]$/g, ''))) return false;
    const normalized = decodeURIComponent(u.href).toLowerCase();
    if (SOURCE_IDS.some(id => normalized.includes(id))) return false;
    if (host === 'github.com' && /^\/yungcoffe\/sp-acao-apostilas\/releases\/download\/apostilas-2026\/(portugues|matematica)[123]\.pdf$/i.test(u.pathname)) return false;
    return true;
  } catch { return false; }
}

function getGroup(catalog, groupId, allowedIds) {
  if (!allowedIds.includes(groupId)) return null;
  const group = catalog?.groups?.[groupId];
  if (!group || typeof group.title !== 'string' || !Array.isArray(group.files) || group.files.length > 5) return null;
  return group;
}

module.exports = { GRADES, ACTION, readCatalog, validFile, getGroup };
