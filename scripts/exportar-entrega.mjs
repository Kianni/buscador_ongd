import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const FUENTES = {
  CAT: {
    datos: 'scripts/catalunya/Entitats_ONGD_pretty.json',
    informe: 'scripts/catalunya/Entitats_ONGD_pretty.informe.json',
  },
  CV: {
    datos: 'scripts/valenciana/salida/entidades_CV.json',
    informe: 'scripts/valenciana/salida/entidades_CV.informe.json',
  },
  CAN: {
    datos: 'scripts/canarias/salida/entidades_CAN.json',
    informe: 'scripts/canarias/salida/entidades_CAN.informe.json',
  },
};

export function aTsv(entidades) {
  const columnas = [
    'cod_entidad', 'nombre', 'ambito', 'direccion', 'codigo_postal',
    'longitud', 'latitud', 'descripcion', 'contacto', 'url',
    'en_localidad.codigo', 'en_localidad.nombre',
    'en_localidad.en_provincia.codigo', 'en_localidad.en_provincia.nombre',
  ];
  const celda = v => String(v ?? '');
  const filas = entidades.map(e => {
    const l = e.en_localidad;
    const p = l.en_provincia;
    return [
      e.cod_entidad, e.nombre, e.ambito, e.direccion, e.codigo_postal,
      e.longitud, e.latitud, e.descripcion, e.contacto, e.url,
      l.codigo, l.nombre, p.codigo, p.nombre,
    ].map(celda).join('\t');
  });
  return [columnas.join('\t'), ...filas].join('\n');
}

export function textoInforme(informe, incluirIncidenciasCanarias) {
  const secciones = [
    'Resumen:',
    JSON.stringify(informe.resumen, null, 2),
    'Registros Reparados:',
    JSON.stringify(informe.reparados ?? [], null, 2),
    'Registros Rechazados:',
    JSON.stringify(informe.rechazados ?? [], null, 2),
  ];

  if (incluirIncidenciasCanarias) {
    secciones.push(
      'Registros Duplicados:',
      JSON.stringify(informe.duplicados ?? [], null, 2),
      'Avisos:',
      JSON.stringify(informe.avisos ?? [], null, 2),
      'Marcadores sin dato:',
      JSON.stringify(informe.marcadores_sin_dato ?? {}, null, 2),
      'Campos vacíos:',
      JSON.stringify(informe.campos_vacios ?? {}, null, 2),
      'Sin dato en origen:',
      JSON.stringify(informe.sin_dato_en_origen ?? {}, null, 2),
    );
  }

  return secciones.join('\n\n');
}

export function exportarEntrega(origen, { raiz = process.cwd() } = {}) {
  const fuente = String(origen ?? '').toUpperCase();
  const archivos = FUENTES[fuente];
  if (!archivos) throw new Error('Indique una fuente válida: CAT, CV o CAN.');

  const entidades = JSON.parse(readFileSync(path.join(raiz, archivos.datos), 'utf8'));
  const informe = JSON.parse(readFileSync(path.join(raiz, archivos.informe), 'utf8'));
  const directorio = path.join(raiz, 'entrega1');
  mkdirSync(directorio, { recursive: true });

  const datos = path.join(directorio, `Datos_${fuente}.txt`);
  const informeTxt = path.join(directorio, `Informe_${fuente}.txt`);
  writeFileSync(datos, aTsv(entidades), 'utf8');
  writeFileSync(informeTxt, textoInforme(informe, fuente === 'CAN'), 'utf8');
  return { datos, informe: informeTxt };
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    const archivos = exportarEntrega(process.argv[2]);
    console.log(`Datos: ${archivos.datos}\nInforme: ${archivos.informe}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
