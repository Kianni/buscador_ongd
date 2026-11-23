import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { contarPorCategoria, posiblesDuplicados } from '../../lib/informe.mjs';
import { procesarTelefonos, procesarUrl, SEPARADOR } from '../../lib/contacto.mjs';

export const PREFIJO_FUENTE = 'CAN';

const AREA_POR_NOMBRE = Object.freeze({
  discapacidad: 'DISCAPACIDAD',
  'exclusion social': 'INCLUSION_SOCIAL',
  'tercera edad': 'MAYORES',
  'menores y juventud': 'INFANCIA_Y_JUVENTUD',
  mujer: 'MUJER',
  voluntariado: 'VOLUNTARIADO_Y_PARTICIPACION_COMUNITARIA',
});

const PROVINCIAS_CANARIAS = Object.freeze({
  '35': 'Las Palmas',
  '38': 'Santa Cruz de Tenerife',
});

const normalizarClave = texto => String(texto ?? '')
  .trim()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/\s+/g, ' ');

const texto = valor => {
  if (valor === null || valor === undefined) return null;
  const limpio = String(valor).replace(/\s+/g, ' ').trim();
  return !limpio || /^_u$/i.test(limpio) ? null : limpio;
};

const marcador = valor => typeof valor === 'string' && /^_u$/i.test(valor.trim());
const firmaDe = fila => JSON.stringify(
  Object.fromEntries(Object.entries(fila).sort(([a], [b]) => a.localeCompare(b))),
);

function crearDireccion(fila) {
  const tipo = texto(fila.direccion_tipo_via);
  const via = texto(fila.direccion_nombre_via);
  const numero = texto(fila.direccion_numero);
  const complemento = texto(fila.direccion_complemento);
  const tipoNormalizado = normalizarClave(tipo);
  const viaNormalizada = normalizarClave(via);
  const calle = tipo && via &&
    viaNormalizada !== tipoNormalizado &&
    !viaNormalizada.startsWith(`${tipoNormalizado} `)
    ? `${tipo} ${via}`
    : via ?? tipo;
  const partes = calle ? [calle] : [];

  const numeroNormalizado = normalizarClave(numero);
  const calleNormalizada = normalizarClave(calle);
  if (numero && calleNormalizada !== numeroNormalizado &&
    !calleNormalizada.endsWith(` ${numeroNormalizado}`)) partes.push(numero);
  if (complemento && !partes.some(p => normalizarClave(p) === normalizarClave(complemento))) {
    partes.push(complemento);
  }

  return partes.length ? partes.join(', ') : null;
}

function crearContacto(fila, numeroFila, avisos, reparados, id) {
  const contactos = [];
  for (const campo of ['telefono_1', 'telefono_2']) {
    const bruto = texto(fila[campo]);
    if (!bruto) continue;

    const entrada = bruto.replace(/^\(34\)\s*/, '+34');
    const resultado = procesarTelefonos(entrada);
    if (resultado.valor) contactos.push(resultado.valor);

    if (resultado.estado === 'reparado') {
      reparados.push({
        fila: numeroFila, id, campo, categoria: 'formato',
        antes: bruto, despues: resultado.valor,
        motivo: 'Prefijo o formato telefónico normalizado; se conserva solo si el resultado es válido.',
      });
    } else if (resultado.estado === 'conservado') {
      avisos.push({
        fila: numeroFila, id, campo, categoria: 'formato',
        mensaje: `No se puede validar el teléfono; se conserva el original "${bruto}".`,
      });
    }
  }
  return contactos.length ? [...new Set(contactos)].join(SEPARADOR) : null;
}

function informeInicial(leidos) {
  return {
    fuente: 'Canarias',
    resumen: {
      leidos, cargados: 0, rechazados: 0, duplicados: 0,
      con_reparaciones: 0, con_avisos: 0,
    },
    rechazados: [],
    duplicados: [],
    reparados: [],
    avisos: [],
    posibles_duplicados: [],
    marcadores_sin_dato: {},
    campos_vacios: {},
    sin_dato_en_origen: {},
  };
}

function contarAusencias(filas, informe) {
  const marcadores = [
    'direccion_complemento', 'direccion_provincia_id',
    'direccion_provincia_nombre', 'direccion_municipio_nombre',
    'direccion_isla_id', 'direccion_isla_nombre',
    'telefono_1', 'telefono_2', 'pagina_web', 'area_id',
    'area_nombre', 'subarea_id', 'subarea_nombre',
  ];
  const opcionales = ['direccion_tipo_via'];

  for (const campo of marcadores) {
    informe.marcadores_sin_dato[campo] = filas.filter(f => marcador(f[campo])).length;
  }
  for (const campo of opcionales) {
    informe.campos_vacios[campo] = filas.filter(f => !texto(f[campo]) && !marcador(f[campo])).length;
  }

  // La fuente incluye entidades con domicilio fuera del archipiélago; para ellas la isla no aplica.
  informe.sin_dato_en_origen.isla_no_aplica = filas.filter(f => {
    const provincia = texto(f.direccion_provincia_id);
    return provincia && !PROVINCIAS_CANARIAS[provincia] && marcador(f.direccion_isla_id);
  }).length;
}

function areaDe(fila) {
  const clave = normalizarClave(fila.area_nombre);
  return clave ? AREA_POR_NOMBRE[clave] ?? null : null;
}

function municipioYProvincia(fila, numeroFila, informe, reparados, id) {
  const codigoLocalidad = texto(fila.direccion_municipio_id);
  const nombreLocalidad = texto(fila.direccion_municipio_nombre);
  let codigoProvincia = texto(fila.direccion_provincia_id);
  let nombreProvincia = texto(fila.direccion_provincia_nombre);

  if ((!codigoProvincia || !nombreProvincia) && codigoLocalidad) {
    const prefijo = codigoLocalidad.slice(0, 2);
    if (PROVINCIAS_CANARIAS[prefijo]) {
      if (!codigoProvincia) codigoProvincia = prefijo;
      if (!nombreProvincia) nombreProvincia = PROVINCIAS_CANARIAS[prefijo];
      reparados.push({
        fila: numeroFila, id, campo: 'direccion_provincia_id/nombre',
        categoria: 'semantico',
        antes: `${fila.direccion_provincia_id ?? ''} ${fila.direccion_provincia_nombre ?? ''}`.trim(),
        despues: `${codigoProvincia} ${nombreProvincia}`,
        motivo: 'Provincia recuperada del prefijo del código municipal.',
      });
    }
  }

  if (!codigoLocalidad || !nombreLocalidad) {
    informe.rechazados.push({
      fila: numeroFila, id, campo: 'direccion_municipio_id/nombre',
      categoria: 'faltante',
      motivo: 'Falta el código o el nombre de municipio; no se inventa una localidad.',
    });
    return null;
  }
  if (!codigoProvincia || !nombreProvincia) {
    informe.rechazados.push({
      fila: numeroFila, id, campo: 'direccion_provincia_id/nombre',
      categoria: 'faltante',
      motivo: 'Falta el código o el nombre de provincia.',
    });
    return null;
  }
  if (!/^\d{5}$/.test(codigoLocalidad) || !/^\d{2}$/.test(codigoProvincia) ||
    codigoLocalidad.slice(0, 2) !== codigoProvincia) {
    informe.rechazados.push({
      fila: numeroFila, id, campo: 'direccion_municipio_id/provincia_id',
      categoria: 'semantico',
      motivo: `El código municipal "${codigoLocalidad}" no corresponde a la provincia "${codigoProvincia}".`,
    });
    return null;
  }

  return {
    codigo: codigoLocalidad,
    nombre: nombreLocalidad,
    en_provincia: { codigo: codigoProvincia, nombre: nombreProvincia },
  };
}

function registrarDuplicado(fila, numeroFila, id, primero, informe) {
  const areaInicial = texto(primero.datos.area_nombre);
  const areaRepetida = texto(fila.area_nombre);
  const firma = firmaDe(fila);
  const identico = firma === primero.firma;
  const notaArea = areaInicial !== areaRepetida
    ? ` Área repetida "${areaRepetida ?? 'sin dato'}"; se conserva "${areaInicial ?? 'sin dato'}".`
    : '';

  informe.duplicados.push({
    fila: numeroFila,
    id,
    nombre: texto(fila.denominacion),
    fila_original: primero.fila,
    categoria: 'duplicado',
    tipo: identico ? 'idéntico' : 'conflicto',
    accion: `Se conserva la primera aparición (fila ${primero.fila}).${notaArea}`,
  });
}

/**
 * Convierte el JSON del registro canario al esquema común.
 * La primera fila por numero_registro es la entidad canónica; las posteriores se informan como duplicados.
 */
export async function extraerCAN(contenido) {
  let filas;
  try {
    filas = JSON.parse(String(contenido).replace(/^\uFEFF/, ''));
  } catch {
    throw new Error('El archivo JSON de Canarias no tiene sintaxis válida.');
  }
  if (!Array.isArray(filas) || filas.length === 0) {
    throw new Error('El archivo JSON de Canarias debe contener una lista no vacía.');
  }

  const informe = informeInicial(filas.length);
  contarAusencias(filas, informe);
  const entidades = [];
  const vistos = new Map();
  const conAvisos = new Set();
  const conReparaciones = new Set();

  for (const [indice, fila] of filas.entries()) {
    const numeroFila = indice + 1;
    if (!fila || typeof fila !== 'object' || Array.isArray(fila)) {
      informe.rechazados.push({
        fila: numeroFila, id: null, campo: null,
        categoria: 'formato', motivo: 'La fila no es un objeto JSON.',
      });
      continue;
    }

    const id = texto(fila.numero_registro);
    const nombre = texto(fila.denominacion);
    if (!id) {
      informe.rechazados.push({
        fila: numeroFila,
        id,
        campo: 'numero_registro',
        categoria: 'faltante',
        motivo: 'Falta el número de registro.',
      });
      continue;
    }

    const firma = firmaDe(fila);
    const primero = vistos.get(id);
    if (primero) {
      registrarDuplicado(fila, numeroFila, id, primero, informe);
      continue;
    }
    vistos.set(id, { fila: numeroFila, firma, datos: fila });

    if (!nombre) {
      informe.rechazados.push({
        fila: numeroFila, id, campo: 'denominacion',
        categoria: 'faltante', motivo: 'Falta la denominación.',
      });
      continue;
    }

    const reparados = [];
    const avisos = [];
    const localidad = municipioYProvincia(fila, numeroFila, informe, reparados, id);
    if (!localidad) continue;

    const areaNombre = texto(fila.area_nombre);
    const ambito = areaDe(fila);
    if (!ambito) {
      avisos.push({
        fila: numeroFila, id, campo: 'area_nombre',
        categoria: areaNombre ? 'semantico' : 'faltante',
        mensaje: areaNombre
          ? `Área sin equivalencia aprobada: "${areaNombre}". ambito = null.`
          : 'Área no informada. ambito = null.',
      });
    }

    const urlBruta = texto(fila.pagina_web);
    const url = urlBruta ? procesarUrl(urlBruta) : { estado: 'vacio', valor: null };
    if (url.estado === 'reparado') {
      reparados.push({
        fila: numeroFila, id, campo: 'pagina_web', categoria: 'formato',
        antes: urlBruta, despues: url.valor, motivo: 'URL normalizada.',
      });
    } else if (url.estado === 'conservado') {
      avisos.push({
        fila: numeroFila, id, campo: 'pagina_web', categoria: 'formato',
        mensaje: `No se puede validar como URL; se conserva el original "${url.valor}".`,
      });
    }

    const contacto = crearContacto(fila, numeroFila, avisos, reparados, id);
    const subarea = texto(fila.subarea_nombre);
    const descripcion = [
      areaNombre && `Área de origen: ${areaNombre}`,
      subarea && `Subárea de origen: ${subarea}`,
    ].filter(Boolean).join('. ') || null;

    entidades.push({
      cod_entidad: `${PREFIJO_FUENTE}:${id}`,
      nombre,
      ambito,
      direccion: crearDireccion(fila),
      codigo_postal: null,
      longitud: null,
      latitud: null,
      descripcion,
      contacto,
      url: url.valor,
      en_localidad: localidad,
    });

    if (reparados.length) {
      informe.reparados.push(...reparados);
      conReparaciones.add(id);
    }
    if (avisos.length) {
      informe.avisos.push(...avisos);
      conAvisos.add(id);
    }
  }

  informe.resumen.cargados = entidades.length;
  informe.resumen.rechazados = informe.rechazados.length;
  informe.resumen.duplicados = informe.duplicados.length;
  informe.resumen.con_reparaciones = conReparaciones.size;
  informe.resumen.con_avisos = conAvisos.size;
  informe.sin_dato_en_origen.codigo_postal = entidades.length;
  informe.sin_dato_en_origen.longitud_latitud = entidades.length;
  informe.sin_dato_en_origen.correo_electronico = entidades.length;

  posiblesDuplicados(entidades, informe);
  contarPorCategoria(informe);
  return { entidades, informe };
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const [entrada = 'data/datos-abiertos-csv-segundo-trimestre26.json', destino] = process.argv.slice(2);
  const directorioSalida = destino ?? fileURLToPath(new URL('./salida/', import.meta.url));
  try {
    const { entidades, informe } = await extraerCAN(fs.readFileSync(entrada, 'utf8'));
    fs.mkdirSync(directorioSalida, { recursive: true });
    fs.writeFileSync(path.join(directorioSalida, 'entidades_CAN.json'), JSON.stringify(entidades, null, 2));
    fs.writeFileSync(path.join(directorioSalida, 'entidades_CAN.informe.json'), JSON.stringify(informe, null, 2));
    console.log(`Leídas ${informe.resumen.leidos}; cargadas ${informe.resumen.cargados}; rechazadas ${informe.resumen.rechazados}; duplicadas ${informe.resumen.duplicados}.`);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exitCode = 1;
  }
}
