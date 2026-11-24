'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { readCatalog, validFile } = require('../src/catalog');
const verified = require('../src/verified-files');
const assets = require('./fixtures/release-assets.json');
const manifestBytes = fs.readFileSync(path.join(__dirname, 'fixtures/manifesto-vyxutils.json'));
const manifest = JSON.parse(manifestBytes);
const base = 'https://github.com/YungCoffe/apostila-vyxutils-pdfs/releases/download/apostilas-2026-vyxutils/';

test('manifesto e metadados vinculam os 26 IDs, fontes, URLs, nomes e hashes', () => {
  assert.equal(crypto.createHash('sha256').update(manifestBytes).digest('hex'), '525bc58f59cc1f234daf469117106a9d7113431b6e7f6f20c31543b31d283f07');
  const files = Object.values(readCatalog().groups).flatMap(g => g.files);
  assert.equal(files.length, 26);
  assert.equal(manifest.length, 26);
  assert.equal(assets.length, 26);
  assert.equal(Object.keys(verified).length, 26);
  assert.equal(new Set(files.map(f => f.id)).size, 26);
  assert.equal(new Set(files.map(f => f.sourceReference)).size, 26);
  assert.equal(new Set(manifest.map(m => m.fonte)).size, 26);
  assert.equal(new Set(assets.map(a => a.name)).size, 26);
  for (const file of files) {
    const m = manifest.find(entry => entry.fonte === file.sourceReference);
    assert.ok(m, file.id);
    const sourceName = new URL(file.sourceReference).pathname.split('/').pop().replace(/\.pdf$/, '');
    assert.equal(m.nome, sourceName, file.id);
    const a = assets.find(asset => asset.name === `${sourceName}-VyxUtils.pdf`);
    assert.ok(a, file.id);
    assert.equal(m.url, base + a.name, file.id);
    assert.equal(a.browser_download_url, m.url, file.id);
    assert.equal(a.digest, `sha256:${m.sha256}`, file.id);
    assert.equal(a.size, m.bytes, file.id);
    assert.deepEqual(verified[file.id], { url: m.url, sha256: m.sha256 }, file.id);
    assert.equal(file.url, m.url, file.id);
    assert.equal(file.watermarked, true, file.id);
    assert.equal(validFile(file), true, file.id);
    assert.ok(Object.isFrozen(verified[file.id]));
  }
  assert.ok(Object.isFrozen(verified));
});

test('todas as URLs não autorizadas são negadas para cada ID real', () => {
  const files = Object.values(readCatalog().groups).flatMap(g => g.files);
  for (const file of files) {
    for (const bad of [file.sourceReference, file.url + '?extra=1', file.url.replace('https:', 'http:'), 'https://publico.exemplo.org/alterado.pdf', 'https://localhost/a.pdf', 'https://127.0.0.1/a.pdf']) {
      assert.equal(validFile({ ...file, url: bad }), false, `${file.id}: ${bad}`);
    }
    assert.equal(validFile({ ...file, watermarked: false }), false, file.id);
    assert.equal(validFile({ ...file, id: file.id + '-inexistente' }), false, file.id);
  }
});
