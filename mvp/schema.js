// A subset of Entidad from data/global_schema.py; the complete entity requires more fields.
import { LocalizedError } from './i18n.js';
export const AMBITOS = Object.freeze([
  'MAYORES', 'DISCAPACIDAD', 'SALUD_MENTAL', 'INFANCIA_Y_JUVENTUD',
  'MUJER', 'MIGRACION', 'INCLUSION_SOCIAL', 'EDUCACION_Y_FORMACION',
  'EMPLEO_E_INSERCION_LABORAL', 'SALUD_Y_ATENCION_SOCIOSANITARIA',
  'VOLUNTARIADO_Y_PARTICIPACION_COMUNITARIA', 'CULTURA_Y_DESARROLLO_COMUNITARIO',
]);

/** @typedef {{cod_entidad: string, nombre: string, ambito: string | null}} EntidadMvp */
export function validateEntity(entity, record = 1) {
  for (const field of ['cod_entidad', 'nombre']) {
    if (typeof entity[field] !== 'string' || !entity[field].trim()) {
      throw new LocalizedError('requiredField', { record, field });
    }
  }
  if (entity.ambito !== null && !AMBITOS.includes(entity.ambito)) {
    throw new LocalizedError('invalidAmbito', { record });
  }
  return { cod_entidad: entity.cod_entidad.trim(), nombre: entity.nombre.trim(), ambito: entity.ambito };
}

export function validateBatch(entities) {
  if (!entities.length) throw new LocalizedError('emptyFile');
  const seen = new Set();
  return entities.map((entity, index) => {
    const clean = validateEntity(entity, index + 1);
    if (seen.has(clean.cod_entidad)) throw new LocalizedError('duplicateCode', { code: clean.cod_entidad });
    seen.add(clean.cod_entidad);
    return clean;
  });
}

export const normalize = value => String(value ?? '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
