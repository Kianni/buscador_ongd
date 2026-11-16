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
  for (const [lista, clave] of [['rechazados', 'rechazados'], ['reparados', 'reparados'], ['avisos', 'avisos'], ['duplicados', 'duplicados']]) {
    for (const i of informe[lista]) (cuenta[i.categoria] ?? (cuenta[i.categoria] = { rechazados: 0, reparados: 0, avisos: 0, duplicados: 0 }))[clave]++;
  }
  informe.resumen.por_categoria = cuenta;
  return informe;
}

const normaliza = t => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/** Posibles duplicados con identificador distinto: mismo nombre y misma localidad. Solo informa; no elimina. */
export function posiblesDuplicados(entidades, informe) {
  const vistos = new Map();
  for (const e of entidades) {
    const clave = `${normaliza(e.nombre)}|${e.en_localidad.codigo}`;
    const previo = vistos.get(clave);
    if (previo) informe.avisos.push({ fila: null, id: e.cod_entidad.split(':')[1], campo: 'nombre', categoria: 'duplicado', mensaje: `Posible duplicado de ${previo}: mismo nombre y localidad con otro identificador. Se conservan ambos.` });
    else vistos.set(clave, e.cod_entidad);
  }
}
