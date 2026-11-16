// Última comprobación antes de subir al almacén: cada entidad debe cumplir el diagrama UML.
export const AMBITOS = [
  'MAYORES', 'DISCAPACIDAD', 'SALUD_MENTAL', 'INFANCIA_Y_JUVENTUD', 'MUJER', 'MIGRACION',
  'INCLUSION_SOCIAL', 'EDUCACION_Y_FORMACION', 'EMPLEO_E_INSERCION_LABORAL',
  'SALUD_Y_ATENCION_SOCIOSANITARIA', 'VOLUNTARIADO_Y_PARTICIPACION_COMUNITARIA',
  'CULTURA_Y_DESARROLLO_COMUNITARIO',
];

const texto = v => typeof v === 'string' && v.trim() !== '';
const opcional = v => v === null || v === undefined || typeof v === 'string';

/** Devuelve la lista de problemas de una entidad (vacía si es válida). */
export function problemasDeEntidad(e, prefijo) {
  const p = [];
  if (!e || typeof e !== 'object') return ['No es un objeto.'];
  if (!texto(e.cod_entidad) || !e.cod_entidad.startsWith(`${prefijo}:`) || e.cod_entidad.length <= prefijo.length + 1) p.push(`cod_entidad debe empezar por "${prefijo}:".`);
  if (!texto(e.nombre)) p.push('nombre vacío.');
  if (e.ambito != null && !AMBITOS.includes(e.ambito)) p.push(`ambito "${e.ambito}" no pertenece al enum.`);
  for (const campo of ['direccion', 'codigo_postal', 'descripcion', 'contacto', 'url']) if (!opcional(e[campo])) p.push(`${campo} debe ser texto o null.`);
  if (e.longitud != null && !(typeof e.longitud === 'number' && e.longitud >= -180 && e.longitud <= 180)) p.push('longitud fuera de rango.');
  if (e.latitud != null && !(typeof e.latitud === 'number' && e.latitud >= -90 && e.latitud <= 90)) p.push('latitud fuera de rango.');
  if ((e.longitud == null) !== (e.latitud == null)) p.push('longitud y latitud deben ir juntas.');
  const l = e.en_localidad;
  if (!l || !texto(l.codigo) || !texto(l.nombre)) p.push('en_localidad requiere codigo y nombre.');
  const pr = l?.en_provincia;
  if (!pr || !texto(pr.codigo) || !texto(pr.nombre)) p.push('en_provincia requiere codigo y nombre.');
  return p;
}
