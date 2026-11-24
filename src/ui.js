'use strict';
const { GRADES, ACTION, getGroup, validFile } = require('./catalog');
const path = require('node:path');

const COLOR = 0x8a2be2;
const IDS = { grades: 'apostila:grades:v1', action: 'apostila:sp:v1' };
const BUTTONS = { grades: 'apostila:botao:grades:v1', action: 'apostila:botao:sp:v1' };
const MODALS = { grades: 'apostila:modal:grades:v1', action: 'apostila:modal:sp:v1' };
const select = (id, placeholder, options) => ({
  type: 1, components: [{ type: 3, custom_id: id, placeholder, min_values: 1, max_values: 1,
    options: options.map(([value, label]) => ({ label, value })) }],
});

function panel() {
  return {
    embeds: [{ color: 0x2b2d31, title: '📄 Apostilas',
      description: 'Escolha sua apostila abaixo.', image: { url: 'attachment://banner.png' } }],
    files: [{ attachment: path.join(__dirname, '../assets/banner.png'), name: 'banner.png' }],
    components: [{ type: 1, components: [
      { type: 2, style: 2, custom_id: BUTTONS.grades, label: 'Apostilas' },
      { type: 2, style: 2, custom_id: BUTTONS.action, label: 'SP em Ação' },
    ] }],
    allowedMentions: { parse: [] },
  };
}

function choiceModal(buttonId) {
  const grade = buttonId === BUTTONS.grades;
  if (!grade && buttonId !== BUTTONS.action) return null;
  const menu = select(grade ? IDS.grades : IDS.action, grade ? 'Apostilas por série' : 'SP em Ação', grade ? GRADES : ACTION).components[0];
  return { custom_id: grade ? MODALS.grades : MODALS.action, title: grade ? 'Apostilas' : 'SP em Ação',
    components: [{ type: 18, label: grade ? 'Escolha a série' : 'Escolha o volume', component: menu }] };
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
module.exports = { IDS, BUTTONS, MODALS, panel, choiceModal, selection };
