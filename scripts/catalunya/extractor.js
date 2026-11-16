const fs = require('fs');
const path = require('path');
const readline = require('readline/promises');
const { stdin, stdout } = require('process');
const { pathToFileURL } = require('url');
const { XMLParser } = require('fast-xml-parser');

// ==========================================
// 1. FUNCIONES DE LIMPIEZA Y FORMATEO
// ==========================================

function normalizarTexto(texto) {
  if (texto === null || texto === undefined || String(texto).trim() === '') {
    return null;
  }

  return String(texto)
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
}

// Clave para comparar municipios ignorando espacios, signos y diferencias
// de formato: "L'Hospitalet de Llobregat" = "LHospitaletdeLlobregat".
function normalizarClaveMunicipio(texto) {
  const normalizado = normalizarTexto(texto);
  return normalizado ? normalizado.replace(/[^A-Z0-9]/g, '') : null;
}

// ==========================================
// 2. CARGA Y RESOLUCIÓN DEL CSV DE MUNICIPIOS
// ==========================================

const TABLA_PROVINCIAS_CP = {
  '08': { p_codigo: '08', p_nombre: 'Barcelona' },
  '17': { p_codigo: '17', p_nombre: 'Girona' },
  '25': { p_codigo: '25', p_nombre: 'Lleida' },
  '43': { p_codigo: '43', p_nombre: 'Tarragona' }
};

// Parser CSV sencillo que respeta campos entrecomillados, comas dentro
// de los campos, comillas escapadas y saltos de línea entre registros.
function parsearCSV(contenido) {
  const filas = [];
  let fila = [];
  let campo = '';
  let dentroComillas = false;

  for (let i = 0; i < contenido.length; i++) {
    const caracter = contenido[i];

    if (caracter === '"') {
      if (dentroComillas && contenido[i + 1] === '"') {
        campo += '"';
        i++;
      } else {
        dentroComillas = !dentroComillas;
      }
    } else if (caracter === ',' && !dentroComillas) {
      fila.push(campo);
      campo = '';
    } else if ((caracter === '\n' || caracter === '\r') && !dentroComillas) {
      if (caracter === '\r' && contenido[i + 1] === '\n') {
        i++;
      }

      fila.push(campo);
      campo = '';

      if (fila.some(valor => valor.trim() !== '')) {
        filas.push(fila);
      }

      fila = [];
    } else {
      campo += caracter;
    }
  }

  // Añade el último campo/fila si el fichero no termina en salto de línea.
  if (campo.length > 0 || fila.length > 0) {
    fila.push(campo);

    if (fila.some(valor => valor.trim() !== '')) {
      filas.push(fila);
    }
  }

  return filas;
}

function cargarDiccionarioDesdeCSV(rutaCSV, silencioso = false) {
  const diccionario = new Map();

  try {
    // Elimina el BOM UTF-8 si está presente.
    const csvData = fs.readFileSync(rutaCSV, 'utf8').replace(/^\uFEFF/, '');
    const filas = parsearCSV(csvData);

    if (filas.length < 2) {
      throw new Error('El CSV no contiene filas de municipios.');
    }

    const cabeceras = filas[0].map(cabecera => cabecera.trim());
    const indices = {
      municipioXml: cabeceras.indexOf('municipi_xml'),
      nombreOficial: cabeceras.indexOf('nombre_oficial'),
      codigoIne: cabeceras.indexOf('codigo_ine'),
      provinciaCodigo: cabeceras.indexOf('provincia_codigo'),
      provinciaNombre: cabeceras.indexOf('provincia_nombre')
    };

    for (const [nombre, indice] of Object.entries(indices)) {
      if (indice === -1) {
        throw new Error(`Falta la columna obligatoria "${nombre}" en el CSV.`);
      }
    }

    for (let i = 1; i < filas.length; i++) {
      const columnas = filas[i];

      const municipioXML = (columnas[indices.municipioXml] || '').trim();
      const nombreOficial = (columnas[indices.nombreOficial] || '').trim();
      const codigoIne = (columnas[indices.codigoIne] || '').trim();
      const provinciaCodigo = (columnas[indices.provinciaCodigo] || '').trim();
      const provinciaNombre = (columnas[indices.provinciaNombre] || '').trim();

      if (!municipioXML || !nombreOficial || !codigoIne) {
        continue;
      }

      const info = {
        l_nombre: nombreOficial,
        l_codigo: codigoIne,
        p_codigo: provinciaCodigo || null,
        p_nombre: provinciaNombre || null
      };

      // Se indexan los dos nombres del CSV. Así se puede encontrar el
      // municipio tanto por el nombre usado en el XML como por el oficial.
      const claves = [
        normalizarClaveMunicipio(municipioXML),
        normalizarClaveMunicipio(nombreOficial)
      ];

      for (const clave of claves) {
        if (clave) {
          diccionario.set(clave, info);
        }
      }
    }

    if (!silencioso) {
      console.log(`   Municipios cargados: ${filas.length - 1}`);
      console.log(`   Claves de búsqueda creadas: ${diccionario.size}`);
    }
  } catch (error) {
    throw new Error(`Error al cargar el CSV: ${error.message}`);
  }

  return diccionario;
}

function resolverMunicipioProvincia(municipi, codiPostal, diccionarioMunicipios) {
  const resultado = {
    localidad_codigo: null,
    localidad_nombre: null,
    provincia_codigo: null,
    provincia_nombre: null
  };

  const muniClave = normalizarClaveMunicipio(municipi);

  if (muniClave && diccionarioMunicipios.has(muniClave)) {
    const info = diccionarioMunicipios.get(muniClave);

    resultado.localidad_codigo = info.l_codigo;
    resultado.localidad_nombre = info.l_nombre;
    resultado.provincia_codigo = info.p_codigo;
    resultado.provincia_nombre = info.p_nombre;

    return resultado;
  }

  // Si el municipio no aparece en el CSV, intenta obtener la provincia
  // a partir de los dos primeros dígitos del código postal.
  if (codiPostal && /^\d{5}$/.test(String(codiPostal))) {
    const prefijo = String(codiPostal).substring(0, 2);

    if (TABLA_PROVINCIAS_CP[prefijo]) {
      resultado.provincia_codigo = TABLA_PROVINCIAS_CP[prefijo].p_codigo;
      resultado.provincia_nombre = TABLA_PROVINCIAS_CP[prefijo].p_nombre;
    }
  }

  return resultado;
}

// ==========================================
// 3. EXTRACCIÓN AL FORMATO COMÚN (usable desde la API y desde consola)
// ==========================================

const PREFIJO_FUENTE = 'CAT';
const RUTA_CSV_MUNICIPIOS = path.join(__dirname, 'municipios_catalunya.csv');

const limpiar = valor => {
  if (valor === null || valor === undefined) return null;
  const t = String(valor).replace(/\s+/g, ' ').trim();
  return t === '' ? null : t;
};

// Municipios con artículo: "Hospitalet de Llobregat, l'" o "Masnou, el" -> "l'Hospitalet de Llobregat".
function variantesMunicipio(texto) {
  const t = limpiar(texto);
  if (!t) return [];
  const salida = [t];
  const m = /^(.*?)[\s]*[(,]\s*(l'|el|la|els|les|los|las)\s*\)?$/i.exec(t);
  if (m) salida.push(`${m[2]}${m[2].endsWith("'") ? '' : ' '}${m[1]}`);
  return salida;
}

/**
 * Convierte el XML del registro de ONGD de Catalunya al formato común.
 * Regla de datos: se repara solo si el resultado queda válido; si no, se conserva el original y se informa.
 * @param {string} textoXml
 * @param {{diccionario?: Map<string, object>}} [opciones]
 * @returns {Promise<{entidades: object[], informe: object}>}
 */
async function extraerCAT(textoXml, opciones = {}) {
  const libUrl = nombre => pathToFileURL(path.join(__dirname, '..', '..', 'lib', nombre)).href;
  const { procesarEmails, procesarTelefonos, procesarUrl } = await import(libUrl('contacto.mjs'));
  const { contarPorCategoria, posiblesDuplicados } = await import(libUrl('informe.mjs'));
  const diccionario = opciones.diccionario ?? cargarDiccionarioDesdeCSV(RUTA_CSV_MUNICIPIOS, true);
  if (!textoXml || textoXml.trim() === '') throw new Error('El archivo XML está vacío.');

  const parsed = new XMLParser({ ignoreAttributes: false, parseTagValue: false, trimValues: true }).parse(textoXml);
  const bruto = parsed?.registre_ongd?.entitat;
  if (bruto === undefined) throw new Error('No se encontraron etiquetas <entitat> dentro de <registre_ongd>.');
  const lista = Array.isArray(bruto) ? bruto : [bruto];

  const informe = {
    fuente: 'Catalunya',
    resumen: { leidos: lista.length, cargados: 0, rechazados: 0, duplicados: 0, con_reparaciones: 0, con_avisos: 0 },
    rechazados: [], duplicados: [], reparados: [], avisos: [],
    sin_dato_en_origen: { ambito: lista.length, latitud_longitud: lista.length },
  };
  const entidades = [];
  const vistos = new Map();

  lista.forEach((item, indice) => {
    const fila = indice + 1;
    let id = limpiar(item.n_mero_registre);
    const reparados = [], avisos = [];
    const reparar = (campo, antes, despues, motivo, categoria = 'formato') => reparados.push({ fila, id, campo, categoria, antes, despues, motivo });
    const avisar = (campo, mensaje, categoria = 'formato') => avisos.push({ fila, id, campo, categoria, mensaje });
    const rechazar = (campo, motivo, categoria = 'faltante') => informe.rechazados.push({ fila, id, campo, categoria, motivo });

    if (!id) return rechazar('n_mero_registre', 'Falta el número de registro.');
    if (/^\d{1,3}(\.\d{3})+$/.test(id)) {
      const limpio = id.replace(/\./g, '');
      reparar('n_mero_registre', id, limpio, 'Separador de miles eliminado del número de registro.');
      id = limpio;
    } else if (!/^\d+$/.test(id)) avisar('n_mero_registre', `El número de registro no es numérico: "${id}".`, 'formato');
    const firma = JSON.stringify(item);
    if (vistos.has(id)) {
      informe.duplicados.push({ fila, id, categoria: 'duplicado', tipo: vistos.get(id) === firma ? 'idéntico' : 'conflicto', accion: 'Se conserva la primera aparición.' });
      informe.resumen.duplicados++;
      return;
    }
    vistos.set(id, firma);

    const nombre = limpiar(item.nom_de_l_entitat);
    if (!nombre) return rechazar('nom_de_l_entitat', 'El nombre de la entidad está vacío.');

    // --- Código postal: espacios y ceros iniciales se reparan; si no es un CP de Catalunya se conserva y se avisa.
    let cp = limpiar(item.codi_postal);
    if (cp && /^\d{2}\s?\d{3}$|^\d{4}$/.test(cp)) {
      const arreglado = cp.replace(/\s/g, '').padStart(5, '0');
      if (arreglado !== cp) reparar('codi_postal', cp, arreglado, /^\d{4}$/.test(cp) ? 'Código postal de 4 dígitos: se añade el cero inicial.' : 'Espacio interno eliminado.');
      cp = arreglado;
    }
    if (cp && !/^\d{5}$/.test(cp)) {
      avisar('codi_postal', `Código postal con formato no válido: "${cp}". Se conserva el original.`, 'formato');
    } else if (cp && !TABLA_PROVINCIAS_CP[cp.slice(0, 2)]) {
      avisar('codi_postal', `Código postal "${cp}" ${Number(cp.slice(0, 2)) > 52 ? 'fuera de rango (no existe esa provincia)' : 'de fuera de Catalunya'}. Se conserva el original.`, Number(cp.slice(0, 2)) > 52 ? 'rango' : 'semantico');
    }
    if (!cp) avisar('codi_postal', 'La entidad no tiene código postal en el origen.', 'faltante');

    // --- Localidad y provincia (obligatorias). El código INE solo sale del CSV oficial: nunca se inventa.
    const municipioOrigen = limpiar(item.municipi);
    let info = null;
    for (const v of variantesMunicipio(municipioOrigen)) {
      const clave = normalizarClaveMunicipio(v);
      if (clave && diccionario.has(clave)) { info = diccionario.get(clave); break; }
    }
    if (!info) {
      return rechazar('municipi', municipioOrigen
        ? `Municipio sin correspondencia en la tabla oficial (no se inventa el código INE): "${municipioOrigen}".`
        : 'El municipio está vacío.', municipioOrigen ? 'semantico' : 'faltante');
    }
    if (cp && /^\d{5}$/.test(cp) && TABLA_PROVINCIAS_CP[cp.slice(0, 2)] && cp.slice(0, 2) !== info.p_codigo) {
      avisar('codi_postal', `El código postal ${cp} no corresponde a la provincia ${info.p_codigo} del municipio ${info.l_codigo}. Manda el municipio.`, 'semantico');
    }

    if (!limpiar(item.adre_a)) avisar('adre_a', 'La entidad no tiene dirección en el origen. direccion = null.', 'faltante');

    // --- Contacto, teléfonos y correo (reparar solo si queda válido)
    const tel = procesarTelefonos((item.tel_fon ?? '') + (item.tel_fon_m_bil ? '\n' + item.tel_fon_m_bil : ''));
    const mail = procesarEmails(item.correu_electr_nic);
    for (const [campo, res] of [['tel_fon', tel], ['correu_electr_nic', mail]]) {
      if (res.estado === 'reparado') reparar(campo, res.original.trim(), res.valor, 'Valor no válido reparado; el resultado es válido.');
      if (res.estado === 'conservado') avisar(campo, `No se puede reparar: se conserva el original "${res.valor}".`);
    }
    const contactos = [tel.valor, mail.valor].filter(Boolean);

    // --- Web
    const web = procesarUrl(item.web);
    if (web.estado === 'reparado') reparar('web', web.original.trim(), web.valor, 'URL reparada; el resultado es válido.');
    if (web.estado === 'conservado') avisar('web', `No se puede reparar: se conserva el original "${web.valor}".`);

    entidades.push({
      cod_entidad: `${PREFIJO_FUENTE}:${id}`,
      nombre,
      ambito: null,
      direccion: limpiar(item.adre_a),
      codigo_postal: cp,
      longitud: null,
      latitud: null,
      descripcion: limpiar(item.naturalesa),
      contacto: contactos.length ? contactos.join(' | ') : null,
      url: web.valor,
      en_localidad: {
        codigo: info.l_codigo,
        nombre: info.l_nombre,
        en_provincia: { codigo: info.p_codigo, nombre: info.p_nombre },
      },
    });
    if (reparados.length) { informe.reparados.push(...reparados); informe.resumen.con_reparaciones++; }
    if (avisos.length) { informe.avisos.push(...avisos); informe.resumen.con_avisos++; }
  });

  informe.resumen.cargados = entidades.length;
  informe.resumen.rechazados = informe.rechazados.length;
  posiblesDuplicados(entidades, informe);
  contarPorCategoria(informe);
  return { entidades, informe };
}

// ==========================================
// 4. USO DESDE CONSOLA
// ==========================================

async function ejecutarExtraccion() {
  const consola = readline.createInterface({ input: stdin, output: stdout });
  try {
    const nombreIntroducido = (await consola.question(
      'Nombre del archivo XML que quieres convertir (por ejemplo, entidades.xml): '
    )).trim();
    consola.close();
    if (!nombreIntroducido) throw new Error('Debes indicar el nombre del archivo XML.');

    const nombreXML = path.basename(nombreIntroducido);
    const nombreBase = path.parse(nombreXML).name;
    const RUTA_XML = path.join(__dirname, nombreXML.toLowerCase().endsWith('.xml') ? nombreXML : `${nombreXML}.xml`);
    const RUTA_JSON = path.join(__dirname, `${nombreBase}.json`);
    const RUTA_INFORME = path.join(__dirname, `${nombreBase}.informe.json`);

    if (!fs.existsSync(RUTA_XML)) throw new Error(`No se encuentra el XML: '${RUTA_XML}'`);
    const { entidades, informe } = await extraerCAT(fs.readFileSync(RUTA_XML, 'utf8'));

    fs.writeFileSync(RUTA_JSON, JSON.stringify(entidades, null, 2), 'utf8');
    fs.writeFileSync(RUTA_INFORME, JSON.stringify(informe, null, 2), 'utf8');
    const r = informe.resumen;
    console.log(`Leídas ${r.leidos}; cargadas ${r.cargados}; rechazadas ${r.rechazados}; duplicadas ${r.duplicados}; ` +
      `con reparaciones ${r.con_reparaciones}; con avisos ${r.con_avisos}.`);
    console.log(`Datos: '${RUTA_JSON}'\nInforme: '${RUTA_INFORME}'`);
  } catch (error) {
    consola.close();
    console.error('\nERROR DURANTE LA EXTRACCIÓN:');
    console.error(error.message);
    console.error('Proceso abortado. No se generó el archivo JSON.\n');
    process.exitCode = 1;
  }
}

module.exports = { extraerCAT, PREFIJO_FUENTE, normalizarClaveMunicipio, parsearCSV };

if (require.main === module) ejecutarExtraccion();
