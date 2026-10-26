import { transform } from './shared.js';
import { LocalizedError } from '../i18n.js';

export const xmlConfig = {
  prefix: 'CAT', fields: ['n_mero_registre', 'nom_de_l_entitat', 'ambit'],
  categories: {
    educacio: 'EDUCACION_Y_FORMACION', 'salut mental': 'SALUD_MENTAL',
    'inclusio social': 'INCLUSION_SOCIAL', ocupacio: 'EMPLEO_E_INSERCION_LABORAL',
    cultura: 'CULTURA_Y_DESARROLLO_COMUNITARIO',
  },
};

export function adaptXml(text) {
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new LocalizedError('xmlDeclarations');
  const document = new DOMParser().parseFromString(text, 'application/xml');
  if (document.getElementsByTagName('parsererror').length) throw new LocalizedError('xmlSyntax');
  const root = document.documentElement;
  if (root.tagName !== 'registre_ongd') throw new LocalizedError('xmlRoot');
  const rows = Array.from(root.children, entry => {
    if (entry.tagName !== 'entitat') throw new LocalizedError('xmlEntry');
    const row = Object.create(null);
    for (const child of entry.children) {
      if (Object.hasOwn(row, child.tagName)) throw new LocalizedError('xmlDuplicateField', { field: child.tagName });
      if (child.children.length) throw new LocalizedError('xmlTextOnly');
      row[child.tagName] = child.textContent.trim();
    }
    return row;
  });
  return transform(rows, xmlConfig);
}
