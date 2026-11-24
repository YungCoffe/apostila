'use strict';

// Lista intencionalmente vazia: não foram encontrados PDFs cuja marca roxa
// no rodapé tenha sido verificada. Somente uma revisão humana do PDF correto,
// do arquivo efetivamente hospedado e de sua disponibilidade pode justificar
// acrescentar uma entrada aqui. Alterar apenas apostilas.json não a contorna.
// As chaves são os IDs do catálogo e os valores são objetos congelados:
// { url: 'https://...', sha256: '<64 caracteres hexadecimais>' }.
// A URL precisa ser imutável e servir exatamente os bytes revisados. O hash é
// evidência de revisão, não uma verificação automática em cada clique.
module.exports = Object.freeze({});
