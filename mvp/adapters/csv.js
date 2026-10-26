import { transform } from './shared.js';
import { LocalizedError } from '../i18n.js';

export const csvConfig = {
  prefix: 'CV', fields: ['ni_centro', 'nombre', 'sector'],
  categories: {
    'personas mayores': 'MAYORES', 'personas migrantes': 'MIGRACION',
    'personas con discapacidad': 'DISCAPACIDAD', infancia: 'INFANCIA_Y_JUVENTUD', mujeres: 'MUJER',
  },
};

// Parse comma-separated CSV, including CRLF, escaped quotes and multiline fields.
export function parseCsv(text) {
  text = text.replace(/^\uFEFF/, '');
  const rows = [];
  let row = [], field = '', quoted = false, closed = false;
  const cell = () => { row.push(field); field = ''; closed = false; };
  const line = () => { cell(); if (row.some(value => value.trim())) rows.push(row); row = []; };
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (char === '"') { quoted = false; closed = true; }
      else field += char;
    } else if (char === ',') cell();
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++;
      line();
    } else if (char === '"') {
      if (field || closed) throw new LocalizedError('csvQuote');
      quoted = true;
    } else {
      if (closed) throw new LocalizedError('csvDelimiter');
      field += char;
    }
  }
  if (quoted) throw new LocalizedError('csvUnclosed');
  if (field || row.length || closed) line();
  if (rows.length < 2) throw new LocalizedError('csvHeader');
  const headers = rows.shift().map(value => value.trim());
  if (headers.some(value => !value) || new Set(headers).size !== headers.length) throw new LocalizedError('csvUniqueHeaders');
  return rows.map((values, index) => {
    if (values.length !== headers.length) throw new LocalizedError('csvColumns', { record: index + 1 });
    return Object.fromEntries(headers.map((header, i) => [header, values[i]]));
  });
}

export const adaptCsv = text => transform(parseCsv(text), csvConfig);
