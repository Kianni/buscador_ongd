
// Extractor de la Comunitat Valenciana (CV): CSV -> JSON con el formato común del esquema global.
//
// Formato de salida (diagrama "Esquema global"): Entidad -> Localidad -> Provincia.
//
// Uso como módulo:
//   import { extraerCV } from './extractor.mjs';
//   const { entidades, informe } = await extraerCV(textoCsv);
//
// Uso desde consola:
//   node extractor.mjs entrada.csv [salida.json]
//
// Política de errores:
//   - Se informa de los registros erróneos (rechazados).
//   - Se reparan los datos cuando es posible.
//   - Se informa de los datos que no se pueden obtener de servicios externos.
//   - Los fallos de CartoCiudad no provocan el rechazo de registros.
//
// Código postal:
//   Se obtiene mediante geocodificación inversa de CartoCiudad (IGN/CNIG).
//   Las coordenadas UTM EPSG:25830 se convierten a WGS84 EPSG:4326.
//   El código INE identifica el municipio, no el código postal.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  procesarEmails,
  procesarTelefonos,
  SEPARADOR
} from '../../lib/contacto.mjs';
import {
  contarPorCategoria,
  posiblesDuplicados
} from '../../lib/informe.mjs';

export const PREFIJO_FUENTE = 'CV';

// Provincias de la Comunitat Valenciana
// Código INE = dos primeros dígitos del código de municipio.
export const PROVINCIAS = Object.freeze({
  '03': 'Alacant/Alicante',
  '12': 'Castelló/Castellón',
  '46': 'València/Valencia',
});

// Columna sector -> enum Ambito del esquema global.
const AMBITO_POR_SECTOR = Object.freeze({
  'personas mayores': 'MAYORES',
  'personas con discapacidad': 'DISCAPACIDAD',
  'personas con enfermedad mental': 'SALUD_MENTAL',
  'poblacion en general y colectivos socialmente desfavorecidos':
    'INCLUSION_SOCIAL',
  'personas migrantes': 'MIGRACION',
  infancia: 'INFANCIA_Y_JUVENTUD',
  mujeres: 'MUJER',
});

const COLUMNAS_OBLIGATORIAS = [
  'WKT',
  'id',
  'tipo_centro',
  'nombre',
  'domici',
  'cod_ine_mun',
  'provincia',
  'municipio',
  'sector',
  'email',
  'telefono',
  'x_25830',
  'y_25830',
];

// Caja envolvente (EPSG:25830) con margen para la Comunitat Valenciana.
const UTM_MIN_X = 600000;
const UTM_MAX_X = 850000;
const UTM_MIN_Y = 4150000;
const UTM_MAX_Y = 4560000;

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

const clave = texto =>
  String(texto ?? '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ');

const limpiar = texto => {
  const valor = String(texto ?? '').replace(/\s+/g, ' ').trim();
  return valor === '' ? null : valor;
};

/** Lee un CSV con comas, comillas escapadas, saltos de línea dentro de campos y BOM. */
export function parseCsv(texto) {
  texto = String(texto).replace(/^\uFEFF/, '');

  const filas = [];
  let fila = [];
  let campo = '';
  let entreComillas = false;

  const cerrarCampo = () => {
    fila.push(campo);
    campo = '';
  };

  const cerrarFila = () => {
    cerrarCampo();

    if (fila.some(valor => valor.trim() !== '')) {
      filas.push(fila);
    }

    fila = [];
  };

  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];

    if (entreComillas) {
      if (c === '"' && texto[i + 1] === '"') {
        campo += '"';
        i++;
      } else if (c === '"') {
        entreComillas = false;
      } else {
        campo += c;
      }
    } else if (c === '"') {
      entreComillas = true;
    } else if (c === ',') {
      cerrarCampo();
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') {
        i++;
      }

      cerrarFila();
    } else {
      campo += c;
    }
  }

  if (entreComillas) {
    throw new Error('El CSV tiene comillas sin cerrar.');
  }

  if (campo !== '' || fila.length) {
    cerrarFila();
  }

  return filas;
}

/** Carga la tabla de municipios de referencia. */
export function cargarMunicipios(
  ruta = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    'municipios_cv.csv'
  )
) {
  const filas = parseCsv(fs.readFileSync(ruta, 'utf8'));
  const [cabecera, ...datos] = filas;

  const i = nombre => cabecera.indexOf(nombre);
  const mapa = new Map();

  for (const f of datos) {
    mapa.set(
      f[i('codigo_ine')].trim(),
      f[i('nombre')].trim()
    );
  }

  return mapa;
}

// ---------------------------------------------------------------------------
// Coordenadas: UTM 30N (ETRS89, EPSG:25830) -> WGS84 (EPSG:4326)
// Serie de Krüger sobre el elipsoide GRS80.
// ---------------------------------------------------------------------------

export function utm30ToLonLat(este, norte) {
  const a = 6378137;
  const f = 1 / 298.257222101;
  const k0 = 0.9996;
  const E0 = 500000;
  const lon0 = -3 * Math.PI / 180;

  const n = f / (2 - f);
  const n2 = n * n;
  const n3 = n2 * n;
  const n4 = n3 * n;

  const A = a / (1 + n) *
    (1 + n2 / 4 + n4 / 64);

  const beta = [
    n / 2 - 2 * n2 / 3 + 37 * n3 / 96 - n4 / 360,
    n2 / 48 + n3 / 15 - 437 * n4 / 1440,
    17 * n3 / 480 - 37 * n4 / 840,
    4397 * n4 / 161280,
  ];

  const delta = [
    2 * n - 2 * n2 / 3 - 2 * n3 + 116 * n4 / 45,
    7 * n2 / 3 - 8 * n3 / 5 - 227 * n4 / 45,
    56 * n3 / 15 - 136 * n3 / 35,
    4279 * n4 / 630,
  ];

  const xi = norte / (k0 * A);
  const eta = (este - E0) / (k0 * A);

  let xi2 = xi;
  let eta2 = eta;

  beta.forEach((b, idx) => {
    const j = 2 * (idx + 1);

    xi2 -= b * Math.sin(j * xi) * Math.cosh(j * eta);
    eta2 -= b * Math.cos(j * xi) * Math.sinh(j * eta);
  });

  const chi = Math.asin(Math.sin(xi2) / Math.cosh(eta2));

  let lat = chi;

  delta.forEach((d, idx) => {
    lat += d * Math.sin(2 * (idx + 1) * chi);
  });

  const lon = lon0 + Math.atan2(
    Math.sinh(eta2),
    Math.cos(xi2)
  );

  const grados = r =>
    Math.round(r * 180 / Math.PI * 1e6) / 1e6;

  return {
    longitud: grados(lon),
    latitud: grados(lat),
  };
}

const numeroUtm = texto => {
  const valor = String(texto ?? '').trim();

  if (!/^-?\d+([.,]\d+)?$/.test(valor)) {
    return null;
  }

  return Number(valor.replace(',', '.'));
};

function leerWkt(wkt) {
  const m = /^POINT\s*\(\s*(-?\d+(?:[.,]\d+)?)\s+(-?\d+(?:[.,]\d+)?)\s*\)$/i
    .exec(String(wkt ?? '').trim());

  return m
    ? { x: numeroUtm(m[1]), y: numeroUtm(m[2]) }
    : null;
}

const utmValido = (x, y) =>
  x !== null &&
  y !== null &&
  Number.isFinite(x) &&
  Number.isFinite(y) &&
  x >= UTM_MIN_X &&
  x <= UTM_MAX_X &&
  y >= UTM_MIN_Y &&
  y <= UTM_MAX_Y;

// ---------------------------------------------------------------------------
// Código postal: geocodificación inversa mediante CartoCiudad
// ---------------------------------------------------------------------------

const URL_CARTOCIUDAD =
  'https://www.cartociudad.es/geocoder/api/geocoder/reverseGeocode';

// Caché en memoria para evitar consultas repetidas.
// Se redondean las coordenadas a cinco decimales.
const cacheCodigosPostales = new Map();

/**
 * Obtiene el código postal a partir de coordenadas geográficas.
 *
 * @param {number} latitud Latitud WGS84.
 * @param {number} longitud Longitud WGS84.
 * @returns {Promise<string|null>}
 */
export async function obtenerCodigoPostal(latitud, longitud) {
  const claveCoordenadas =
    `${latitud.toFixed(5)},${longitud.toFixed(5)}`;

  if (cacheCodigosPostales.has(claveCoordenadas)) {
    return cacheCodigosPostales.get(claveCoordenadas);
  }

  try {
    const parametros = new URLSearchParams({
      lat: String(latitud),
      lon: String(longitud),
    });

    const respuesta = await fetch(
      `${URL_CARTOCIUDAD}?${parametros}`,
      {
        signal: AbortSignal.timeout(10000),
        headers: {
          'Accept': 'application/json',
        },
      }
    );

    if (!respuesta.ok) {
      throw new Error(`HTTP ${respuesta.status}`);
    }

    const datos = await respuesta.json();

    const codigoPostal = /^\d{5}$/.test(
      String(datos.postalCode ?? '')
    )
      ? String(datos.postalCode)
      : null;

    cacheCodigosPostales.set(
      claveCoordenadas,
      codigoPostal
    );

    return codigoPostal;

  } catch (error) {
    console.warn(
      `Error consultando CartoCiudad (${latitud}, ${longitud}): ${error.message}`
    );

    return null;
  }
}

/**
 * Completa los códigos postales de las entidades mediante CartoCiudad.
 *
 * Se realizan como máximo cinco consultas simultáneas.
 * Los errores se registran como avisos, nunca como rechazos.
 *
 * @param {object[]} entidades
 * @param {object} informe
 */
async function completarCodigosPostales(entidades, informe) {
  const pendientes = entidades.filter(
    entidad =>
      entidad.latitud !== null &&
      entidad.longitud !== null
  );

  let siguiente = 0;

  async function trabajador() {
    while (siguiente < pendientes.length) {
      const entidad = pendientes[siguiente++];

      const codigoPostal = await obtenerCodigoPostal(
        entidad.latitud,
        entidad.longitud
      );

      if (codigoPostal) {
        entidad.codigo_postal = codigoPostal;
      } else {
        // El identificador del informe conserva el ID original.
        const idOriginal = entidad.cod_entidad
          .slice(PREFIJO_FUENTE.length + 1);

        const yaTeniaAviso = informe.avisos.some(
          aviso => aviso.id === idOriginal
        );

        informe.avisos.push({
          id: idOriginal,
          campo: 'codigo_postal',
          categoria: 'servicio_externo',
          mensaje:
            'No se pudo obtener el código postal mediante CartoCiudad. Se conserva codigo_postal = null.',
        });

        // con_avisos cuenta registros, no número de avisos.
        if (!yaTeniaAviso) {
          informe.resumen.con_avisos++;
        }
      }
    }
  }

  const numeroTrabajadores = Math.min(5, pendientes.length);

  await Promise.all(
    Array.from(
      { length: numeroTrabajadores },
      () => trabajador()
    )
  );

  informe.resumen.codigos_postales_obtenidos =
    entidades.filter(
      entidad => entidad.codigo_postal !== null
    ).length;

  informe.resumen.codigos_postales_no_obtenidos =
    entidades.filter(
      entidad => entidad.codigo_postal === null
    ).length;
}

// ---------------------------------------------------------------------------
// Extracción
// ---------------------------------------------------------------------------

/**
 * @param {string} textoCsv Contenido del CSV de la Comunitat Valenciana.
 * @param {{municipios?: Map<string,string>}} [opciones]
 * @returns {Promise<{entidades: object[], informe: object}>}
 */
export async function extraerCV(textoCsv, opciones = {}) {
  const municipios =
    opciones.municipios ?? cargarMunicipios();

  const filas = parseCsv(textoCsv);

  if (filas.length < 2) {
    throw new Error(
      'El CSV está vacío o solo contiene la cabecera.'
    );
  }

  const cabecera = filas[0].map(c => c.trim());

  const faltan = COLUMNAS_OBLIGATORIAS.filter(
    c => !cabecera.includes(c)
  );

  if (faltan.length) {
    throw new Error(
      `Faltan columnas obligatorias en el CSV: ${faltan.join(', ')}.`
    );
  }

  const informe = {
    fuente: 'Comunitat Valenciana',

    resumen: {
      leidos: filas.length - 1,
      cargados: 0,
      rechazados: 0,
      duplicados: 0,
      con_reparaciones: 0,
      con_avisos: 0,
      codigos_postales_obtenidos: 0,
      codigos_postales_no_obtenidos: 0,
    },

    rechazados: [],
    duplicados: [],
    reparados: [],
    avisos: [],

    marcadores_sin_dato: {
      email_zero_gva: 0,
      telefono_0: 0,
    },

    sin_dato_en_origen: {
      codigo_postal: 0,
      url: 0,
    },
  };

  const entidades = [];

  // id -> JSON de la fila original.
  const vistos = new Map();

  filas.slice(1).forEach((valores, indice) => {
    const fila = indice + 1;

    if (valores.length !== cabecera.length) {
      informe.rechazados.push({
        fila,
        id: null,
        campo: null,
        categoria: 'formato',
        motivo:
          `Número de columnas incorrecto (${valores.length} en lugar de ${cabecera.length}).`,
      });

      return;
    }

    const r = Object.fromEntries(
      cabecera.map((c, i) => [c, valores[i]])
    );

    const id = limpiar(r.id);

    const reparados = [];
    const avisos = [];

    const reparar = (
      campo,
      antes,
      despues,
      motivo,
      categoria = 'formato'
    ) => {
      reparados.push({
        fila,
        id,
        campo,
        categoria,
        antes,
        despues,
        motivo,
      });
    };

    const avisar = (
      campo,
      mensaje,
      categoria = 'formato'
    ) => {
      avisos.push({
        fila,
        id,
        campo,
        categoria,
        mensaje,
      });
    };

    const rechazar = (
      campo,
      motivo,
      categoria = 'faltante'
    ) => {
      informe.rechazados.push({
        fila,
        id,
        campo,
        categoria,
        motivo,
      });
    };

    // --- Identificador y duplicados

    if (!id) {
      return rechazar(
        'id',
        'Falta el identificador del centro.'
      );
    }

    const firma = JSON.stringify(
      valores.map(v => v.trim())
    );

    if (vistos.has(id)) {
      const previo = vistos.get(id);

      const tipo =
        previo.firma === firma
          ? 'idéntico'
          : 'conflicto';

      informe.duplicados.push({
        fila,
        id,
        nombre: limpiar(r.nombre) || null,
        fila_original: previo.fila,
        categoria: 'duplicado',
        tipo,
        accion:
          `Se conserva la primera aparición (fila ${previo.fila}).`,
      });

      informe.resumen.duplicados++;

      return;
    }

    vistos.set(id, { firma, fila });

    // --- Nombre (obligatorio)

    const nombre = limpiar(r.nombre);

    if (!nombre) {
      return rechazar(
        'nombre',
        'El nombre del centro está vacío.'
      );
    }

    // --- Localidad y provincia (obligatorias)

    const codigoIne = String(
      r.cod_ine_mun ?? ''
    ).trim();

    const municipio = limpiar(r.municipio);

    if (!/^\d{5}$/.test(codigoIne)) {
      return rechazar(
        'cod_ine_mun',
        `Código de municipio no válido: "${codigoIne}".`,
        'formato'
      );
    }

    const codigoProvincia = codigoIne.slice(0, 2);

    if (!PROVINCIAS[codigoProvincia]) {
      return rechazar(
        'cod_ine_mun',
        `El código de municipio ${codigoIne} no pertenece a la Comunitat Valenciana.`,
        'semantico'
      );
    }

    if (!municipio) {
      return rechazar(
        'municipio',
        'El nombre del municipio está vacío.'
      );
    }

    const esperado = municipios.get(codigoIne);

    if (
      esperado !== undefined &&
      clave(esperado) !== clave(municipio)
    ) {
      return rechazar(
        'municipio',
        `Incoherencia semántica: el código ${codigoIne} corresponde a "${esperado}", no a "${municipio}".`,
        'semantico'
      );
    }

    const nombreProvincia = PROVINCIAS[codigoProvincia];

    const provinciaOrigen = limpiar(r.provincia);

    if (provinciaOrigen !== nombreProvincia) {
      reparar(
        'provincia',
        provinciaOrigen,
        nombreProvincia,
        `La provincia del origen no coincide con el prefijo ${codigoProvincia} del código de municipio ${codigoIne}; manda el código.`,
        'semantico'
      );
    }

    // --- Ámbito

    const sector = limpiar(r.sector);

    const ambito = sector
      ? AMBITO_POR_SECTOR[clave(sector)] ?? null
      : null;

    if (!ambito) {
      avisar(
        'sector',
        sector
          ? `Sector sin correspondencia con el enum Ambito: "${sector}". Ámbito = null.`
          : 'Sector vacío. Ámbito = null.',
        sector ? 'semantico' : 'faltante'
      );
    }

    // --- Dirección

    const direccion = limpiar(r.domici);

    if (!direccion) {
      avisar(
        'domici',
        'El centro no tiene dirección en el origen. direccion = null.',
        'faltante'
      );
    }

    // --- Coordenadas

    let longitud = null;
    let latitud = null;

    const wkt = leerWkt(r.WKT);

    let x = numeroUtm(r.x_25830);
    let y = numeroUtm(r.y_25830);

    const textoX = String(r.x_25830 ?? '').trim();
    const textoY = String(r.y_25830 ?? '').trim();

    if (
      (textoX.includes(',') && x !== null) ||
      (textoY.includes(',') && y !== null)
    ) {
      reparar(
        'x_25830/y_25830',
        `${textoX} ${textoY}`,
        `${x} ${y}`,
        'Coma decimal sustituida por punto.',
        'formato'
      );
    }

    // Si x/y no son válidas, intentar recuperar las coordenadas del WKT.

    if (
      !utmValido(x, y) &&
      wkt &&
      utmValido(wkt.x, wkt.y)
    ) {
      reparar(
        'x_25830/y_25830',
        `${textoX || '(vacío)'} ${textoY || '(vacío)'}`,
        `${wkt.x} ${wkt.y}`,
        'Coordenada no válida o ausente; recuperada del campo WKT.',
        'faltante'
      );

      x = wkt.x;
      y = wkt.y;
    }

    if (utmValido(x, y)) {
      ({ longitud, latitud } = utm30ToLonLat(x, y));

      if (
        wkt &&
        utmValido(wkt.x, wkt.y) &&
        (
          Math.abs(wkt.x - x) > 1 ||
          Math.abs(wkt.y - y) > 1
        )
      ) {
        avisar(
          'WKT',
          `El campo WKT (${wkt.x} ${wkt.y}) no coincide con x/y (${x} ${y}). Se usa x/y.`,
          'semantico'
        );
      }
    } else {
      avisar(
        'x_25830/y_25830',
        `Coordenadas ausentes, de marcador (p. ej. 9999999) o fuera de la Comunitat Valenciana: "${textoX} ${textoY}". longitud/latitud = null.`,
        'rango'
      );
    }

    // --- Contacto

    // Regla: reparar solo si queda válido;
    // si no, conservar el original e informar.

    const telefonos = procesarTelefonos(r.telefono);
    const emails = procesarEmails(r.email);

    for (const [campo, res] of [
      ['telefono', telefonos],
      ['email', emails],
    ]) {
      if (res.estado === 'marcador') {
        informe.marcadores_sin_dato[
          campo === 'email'
            ? 'email_zero_gva'
            : 'telefono_0'
        ]++;
      }

      if (res.estado === 'reparado') {
        reparar(
          campo,
          res.original.trim(),
          res.valor,
          'Valor no válido reparado; el resultado es válido.'
        );
      }

      if (res.estado === 'conservado') {
        avisar(
          campo,
          `No se puede reparar: se conserva el original "${res.valor}".`
        );
      }
    }

    const contactos = [
      telefonos.valor,
      emails.valor,
    ].filter(Boolean);

    // --- Datos no disponibles en el CSV

    informe.sin_dato_en_origen.codigo_postal++;
    informe.sin_dato_en_origen.url++;

    // --- Construcción de la entidad

    entidades.push({
      cod_entidad: `${PREFIJO_FUENTE}:${id}`,
      nombre,
      ambito,
      direccion,

      // Se completará posteriormente mediante CartoCiudad.
      codigo_postal: null,

      longitud,
      latitud,

      descripcion: limpiar(r.tipo_centro),

      contacto: contactos.length
        ? contactos.join(SEPARADOR)
        : null,

      url: null,

      en_localidad: {
        codigo: codigoIne,
        nombre: municipio,

        en_provincia: {
          codigo: codigoProvincia,
          nombre: nombreProvincia,
        },
      },
    });

    if (reparados.length) {
      informe.reparados.push(...reparados);
      informe.resumen.con_reparaciones++;
    }

    if (avisos.length) {
      informe.avisos.push(...avisos);
      informe.resumen.con_avisos++;
    }
  });

  // -------------------------------------------------------------------------
  // Enriquecimiento de datos: obtención de códigos postales
  // -------------------------------------------------------------------------

  await completarCodigosPostales(entidades, informe);

  // -------------------------------------------------------------------------
  // Finalización del informe
  // -------------------------------------------------------------------------

  informe.resumen.cargados = entidades.length;
  informe.resumen.rechazados = informe.rechazados.length;

  posiblesDuplicados(entidades, informe);
  contarPorCategoria(informe);

  return {
    entidades,
    informe,
  };
}

// ---------------------------------------------------------------------------
// Uso desde consola
// ---------------------------------------------------------------------------

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const [entrada, salida] = process.argv.slice(2);

  if (!entrada) {
    console.error(
      'Uso: node extractor.mjs entrada.csv [salida.json]'
    );

    process.exit(1);
  }

  try {
    const { entidades, informe } = await extraerCV(
      fs.readFileSync(entrada, 'utf8')
    );

    const destino =
      salida ?? entrada.replace(/\.csv$/i, '') + '.json';

    fs.writeFileSync(
      destino,
      JSON.stringify(entidades, null, 2),
      'utf8'
    );

    fs.writeFileSync(
      destino.replace(/\.json$/i, '') + '.informe.json',
      JSON.stringify(informe, null, 2),
      'utf8'
    );

    const r = informe.resumen;

    console.log(
      `Leídos ${r.leidos} · cargados ${r.cargados} · rechazados ${r.rechazados} · duplicados ${r.duplicados} · con reparaciones ${r.con_reparaciones} · con avisos ${r.con_avisos}`
    );

    console.log(
      `Códigos postales obtenidos: ${r.codigos_postales_obtenidos} · no obtenidos: ${r.codigos_postales_no_obtenidos}`
    );

    console.log(
      `Salida: ${destino} (+ .informe.json)`
    );

  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}
