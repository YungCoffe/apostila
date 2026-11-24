'use strict';
const { GRADES, ACTION, getGroup, validFile } = require('./catalog');
const path = require('node:path');

const COLOR = 0x8a2be2;
const IDS = { grades: 'apostila:grades:v1', action: 'apostila:sp:v1', actionGrade: 'apostila:sp:serie:v1' };
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

// Menu privado como a referência; a contagem só inclui arquivos liberados.
function gradeMenu(catalog) {
  const labels = { em3: '3ª Série', em2: '2ª Série', em1: '1ª Série',
    '9': '9º Ano', '8': '8º Ano', '7': '7º Ano', '6': '6º Ano' };
  const options = [...GRADES].reverse().map(([id]) => {
    const group = getGroup(catalog, id, GRADES.map(([key]) => key));
    const count = group ? group.files.filter(validFile).length : 0;
    return { label: labels[id], value: id, description: `${count} ${count === 1 ? 'volume disponível' : 'volumes disponíveis'}` };
  });
  return { flags: 64, embeds: [{ color: 0x2b2d31, title: 'Apostilas normais – Série',
    description: 'Escolha a série e veja os volumes disponíveis.' }],
    components: [{ type: 1, components: [{ type: 3, custom_id: IDS.grades,
      placeholder: 'Selecione uma série', min_values: 1, max_values: 1, options }] }],
    allowedMentions: { parse: [] } };
}

// A SEDUC indica o livro 2 para o 9º ano e o livro 3 para a 3ª série.
const ACTION_GRADES = Object.freeze({
  '9': { label: '9º Ano', groups: ['portugues2', 'matematica2'] },
  em3: { label: '3ª Série do Ensino Médio', groups: ['portugues3', 'matematica3'] },
});

function actionFiles(catalog, grade) {
  if (!Object.hasOwn(ACTION_GRADES, grade)) return null;
  const ids = ACTION.map(([id]) => id);
  return ACTION_GRADES[grade].groups.flatMap(id => {
    const group = getGroup(catalog, id, ids);
    return group ? group.files : [];
  });
}

function actionGradeMenu(catalog) {
  const options = Object.keys(ACTION_GRADES).map(id => {
    const count = actionFiles(catalog, id).filter(validFile).length;
    return { label: ACTION_GRADES[id].label, value: id,
      description: `${count} ${count === 1 ? 'arquivo disponível' : 'arquivos disponíveis'}` };
  });
  return { flags: 64, embeds: [{ color: 0x2b2d31, title: 'SP em Ação – Série',
    description: 'Escolha a série para ver os materiais de Português e Matemática.' }],
    components: [{ type: 1, components: [{ type: 3, custom_id: IDS.actionGrade,
      placeholder: 'Selecione uma série', min_values: 1, max_values: 1, options }] }],
    allowedMentions: { parse: [] } };
}

function actionGradeSelection(catalog, value) {
  const files = actionFiles(catalog, value);
  if (!files) return { flags: 64, content: 'Não foi possível encontrar esta seleção. Tente novamente.', allowedMentions: { parse: [] } };
  const valid = files.filter(validFile);
  const missing = 2 - valid.length;
  const description = valid.length
    ? 'Os arquivos disponíveis são manuais do professor. Acesse pelos botões abaixo.' + (missing ? `\n\n⚠️ ${missing} arquivo(s) ainda não estão disponíveis.` : '')
    : 'Os arquivos desta seleção ainda não estão disponíveis. Tente novamente mais tarde.';
  const result = { flags: 64, embeds: [{ color: COLOR, title: `SP em Ação • ${ACTION_GRADES[value].label}`, description }], allowedMentions: { parse: [] } };
  if (valid.length) result.components = [{ type: 1, components: valid.map(file => ({ type: 2, style: 5, label: file.label.trim().slice(0, 80), url: file.url })) }];
  return result;
}

function selection(catalog, customId, value) {
  if (customId === IDS.actionGrade) return actionGradeSelection(catalog, value);
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
module.exports = { IDS, BUTTONS, MODALS, panel, choiceModal, gradeMenu, actionGradeMenu, selection };
