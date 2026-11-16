// Clasificación de incidencias según la tipología de errores ETL del enunciado.
export const CATEGORIAS = {
  formato: 'Formato',
  faltante: 'Valor faltante o nulo',
  rango: 'Fuera de rango',
  duplicado: 'Duplicado',
  semantico: 'Semántico / inconsistente',
};

/** Añade resumen.por_categoria con el número de incidencias de cada tipo (rechazadas, reparadas, avisos y duplicados). */
export function contarPorCategoria(informe) {
  const cuenta = Object.fromEntries(Object.keys(CATEGORIAS).map(c => [c, { rechazados: 0, reparados: 0, avisos: 0, duplicados: 0 }]));
  for (const [lista, clave] of [['rechazados', 'rechazados'], ['reparados', 'reparados'], ['avisos', 'avisos'], ['duplicados', 'duplicados'], ['posibles_duplicados', 'duplicados']]) {
    for (const i of informe[lista] ?? []) (cuenta[i.categoria] ?? (cuenta[i.categoria] = { rechazados: 0, reparados: 0, avisos: 0, duplicados: 0 }))[clave]++;
  }
  informe.resumen.por_categoria = cuenta;
  return informe;
}

const normaliza = t => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');

const CAMPOS_COMPARADOS = ['direccion', 'codigo_postal', 'contacto', 'descripcion', 'ambito', 'url', 'longitud', 'latitud'];
const vacio = v => v === null || v === undefined || v === '';

/** Compara dos entidades con mismo nombre y localidad: ¿repetición del volcado o recursos distintos del mismo centro? */
function compararPareja(a, b) {
  const diferentes = [], incompletaA = [], incompletaB = [];
  for (const c of CAMPOS_COMPARADOS) {
    if (a[c] === b[c]) continue;
    if (vacio(a[c]) && !vacio(b[c])) incompletaA.push(c);
    else if (!vacio(a[c]) && vacio(b[c])) incompletaB.push(c);
    else diferentes.push(c);
  }
  if (!diferentes.length && !incompletaA.length && !incompletaB.length) return { evidencia: 'identica', diferencias: [] };
  if (!diferentes.length) return { evidencia: 'una_incompleta', diferencias: [...incompletaA, ...incompletaB], masCompleta: incompletaA.length >= incompletaB.length ? 'la primera' : 'la segunda' };
  return { evidencia: 'distintos', diferencias: [...diferentes, ...incompletaA, ...incompletaB] };
}

const TEXTO_EVIDENCIA = {
  identica: 'Idénticos en todos los campos salvo el id: probable fila repetida del volcado. Se conservan ambos; revisar y borrar uno a mano.',
  una_incompleta: p => `Iguales, pero ${p.masCompleta} está más completa (diferencia en: ${p.diferencias.join(', ')}). Se conservan ambos; revisar si se puede quedar solo la completa.`,
  distintos: p => `Se distinguen en: ${p.diferencias.join(', ')}. Parecen recursos distintos del mismo centro. Se conservan ambos.`,
};

/**
 * Posibles duplicados con identificador distinto: mismo nombre y misma localidad. Solo informa; no elimina.
 * Va a informe.posibles_duplicados indicando con qué entidad coincide y en qué campos se parecen o se distinguen.
 */
export function posiblesDuplicados(entidades, informe) {
  const vistos = new Map();
  informe.posibles_duplicados = [];
  for (const e of entidades) {
    const clave = `${normaliza(e.nombre)}|${e.en_localidad.codigo}`;
    const previo = vistos.get(clave);
    if (previo) {
      const cmp = compararPareja(previo, e);
      const t = TEXTO_EVIDENCIA[cmp.evidencia];
      informe.posibles_duplicados.push({
        id: e.cod_entidad.split(':')[1], nombre: e.nombre, localidad: e.en_localidad.nombre,
        duplica_a: previo.cod_entidad.split(':')[1], nombre_duplica_a: previo.nombre,
        categoria: 'duplicado', tipo: 'posible', evidencia: cmp.evidencia, diferencias: cmp.diferencias,
        accion: typeof t === 'function' ? t(cmp) : t,
      });
    } else vistos.set(clave, e);
  }
}
