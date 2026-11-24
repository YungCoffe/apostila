'use strict';
const { GRADES, ACTION, getGroup, validFile } = require('./catalog');

const COLOR = 0x8a2be2;
const IDS = { grades: 'apostila:grades:v1', action: 'apostila:sp:v1' };
const select = (id, placeholder, options) => ({
  type: 1, components: [{ type: 3, custom_id: id, placeholder, min_values: 1, max_values: 1,
    options: options.map(([value, label]) => ({ label, value })) }],
});

function panel() {
  return {
    embeds: [{ color: 0x2b2d31, title: '📄 Apostilas',
      description: 'Escolha sua apostila abaixo.' }],
    components: [select(IDS.grades, 'Apostilas por série', GRADES), select(IDS.action, 'SP em Ação', ACTION)],
    allowedMentions: { parse: [] },
  };
}

function selection(catalog, customId, value) {
  const source = customId === IDS.grades ? GRADES : customId === IDS.action ? ACTION : null;
  const group = source && getGroup(catalog, value, source.map(x => x[0]));
  if (!group) return { flags: 64, content: 'Não foi possível encontrar esta seleção. Tente novamente.', allowedMentions: { parse: [] } };
  const valid = group.files.filter(validFile);
  const missing = group.files.length - valid.length;
  const description = valid.length
    ? 'Acesse os arquivos com a marca VyxUtils pelos botões abaixo.' + (missing ? `\n\n⚠️ ${missing} arquivo(s) ainda não estão disponíveis.` : '')
    : 'Os arquivos desta seleção ainda não estão disponíveis. Tente novamente mais tarde.';
  const result = { flags: 64, embeds: [{ color: COLOR, title: group.title.slice(0, 256), description }], allowedMentions: { parse: [] } };
  if (valid.length) result.components = [{ type: 1, components: valid.map(file => ({ type: 2, style: 5, label: file.label.trim().slice(0, 80), url: file.url })) }];
  return result;
}
module.exports = { IDS, panel, selection };
