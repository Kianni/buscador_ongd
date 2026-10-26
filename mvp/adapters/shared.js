import { AMBITOS, normalize, validateBatch } from '../schema.js';
import { LocalizedError } from '../i18n.js';

export function transform(rows, config) {
  if (!Array.isArray(rows)) throw new LocalizedError('expectedList');
  const entities = rows.map((row, index) => {
    const record = index + 1;
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw new LocalizedError('expectedObject', { record });
    for (const field of config.fields) {
      if (!Object.hasOwn(row, field)) throw new LocalizedError('missingField', { record, field });
    }
    const [idField, nameField, categoryField] = config.fields;
    const id = row[idField];
    const name = row[nameField];
    const rawCategory = row[categoryField];
    if (typeof id !== 'string' || !id.trim()) throw new LocalizedError('invalidId', { record, field: idField });
    if (typeof name !== 'string') throw new LocalizedError('invalidName', { record, field: nameField });
    if (rawCategory !== null && typeof rawCategory !== 'string') throw new LocalizedError('invalidCategoryType', { record });
    let ambito = null;
    if (rawCategory !== null && rawCategory.trim()) {
      ambito = AMBITOS.includes(rawCategory.trim()) ? rawCategory.trim() : config.categories[normalize(rawCategory)];
      if (!ambito) throw new LocalizedError('unknownCategory', { record, category: rawCategory });
    }
    return { cod_entidad: `${config.prefix}:${id.trim()}`, nombre: name, ambito };
  });
  return { source: rows, entities: validateBatch(entities) };
}
