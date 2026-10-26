import { transform } from './shared.js';
import { LocalizedError } from '../i18n.js';

export const jsonConfig = {
  prefix: 'CA', fields: ['numero_registro', 'denominacion', 'area_nombre'],
  categories: {
    discapacidad: 'DISCAPACIDAD', 'exclusion social': 'INCLUSION_SOCIAL',
    'tercera edad': 'MAYORES', 'menores y juventud': 'INFANCIA_Y_JUVENTUD',
    voluntariado: 'VOLUNTARIADO_Y_PARTICIPACION_COMUNITARIA',
  },
};

export function adaptJson(text) {
  let rows;
  try { rows = JSON.parse(text.replace(/^\uFEFF/, '')); }
  catch { throw new LocalizedError('jsonSyntax'); }
  return transform(rows, jsonConfig);
}
