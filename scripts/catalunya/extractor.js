const fs = require('fs');
const path = require('path');
const readline = require('readline/promises');
const { stdin, stdout } = require('process');
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

const TLDS_COMUNES = ['com', 'org', 'es', 'cat', 'eu', 'net', 'info', 'gob', 'edu'];

// Reparador exclusivo para correos electrónicos.
function repararEmail(texto) {
  if (!texto) return null;

  let limpio = String(texto).trim();

  // Corrige únicamente los casos conocidos de TLD pegado al final.
  for (const tld of TLDS_COMUNES) {
    const regexFinal = new RegExp(`(?<!\\.)${tld}$`, 'i');

    if (regexFinal.test(limpio)) {
      limpio = limpio.replace(regexFinal, `.${tld}`);
      break;
    }
  }

  return limpio;
}

// Reparador exclusivo para URLs.
function limpiarUrl(urlCruda) {
  if (!urlCruda) return null;

  let limpia = String(urlCruda).trim();

  // Corrige protocolos repetidos, por ejemplo: http://https://dominio.cat
  limpia = limpia.replace(/^(?:(?:https?):\/\/)+/i, 'https://');

  // Añade protocolo cuando falta.
  if (!/^https?:\/\//i.test(limpia)) {
    limpia = 'http://' + limpia;
  }

  try {
    const urlObj = new URL(limpia);
    let host = urlObj.hostname;

    // Corrige TLD pegados al final del dominio.
    for (const tld of TLDS_COMUNES) {
      const regexFinal = new RegExp(`(?<!\\.)${tld}$`, 'i');

      if (regexFinal.test(host)) {
        host = host.replace(regexFinal, `.${tld}`);
        break;
      }
    }

    // Corrige "www" pegado al nombre del dominio.
    host = host.replace(/^www([a-zA-Z0-9])/i, 'www.$1');

    urlObj.hostname = host;
    return urlObj.href;
  } catch (error) {
    // Si la URL no se puede interpretar, conserva el texto con el protocolo añadido/corregido.
    return limpia;
  }
}

// Divide campos con varios valores separados por saltos de línea.
function extraerMultiplesValores(valor) {
  if (valor === null || valor === undefined) return [];

  return String(valor)
    .split(/\r?\n/)
    .map(v => v.trim())
    .filter(v => v.length > 0);
}

function concatenarContacto(telefono, movil, email) {
  const listaTelefonos = extraerMultiplesValores(telefono);
  const listaMoviles = extraerMultiplesValores(movil);
  const listaEmails = extraerMultiplesValores(email);

  const emailsReparados = listaEmails.map(correo => {
    return correo.includes('@') ? repararEmail(correo) : correo;
  });

  const componentes = [
    ...listaTelefonos,
    ...listaMoviles,
    ...emailsReparados
  ];

  return componentes.length > 0 ? componentes.join(' | ') : null;
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

function cargarDiccionarioDesdeCSV(rutaCSV) {
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

    console.log(`   Municipios cargados: ${filas.length - 1}`);
    console.log(`   Claves de búsqueda creadas: ${diccionario.size}`);
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
// 3. FUNCIÓN PRINCIPAL DE EXTRACCIÓN Y MAPEO
// ==========================================

async function ejecutarExtraccion() {
  const consola = readline.createInterface({ input: stdin, output: stdout });

  try {
    const nombreIntroducido = (await consola.question(
      'Nombre del archivo XML que quieres convertir (por ejemplo, entidades.xml): '
    )).trim();
    consola.close();

    if (!nombreIntroducido) {
      throw new Error('Debes indicar el nombre del archivo XML.');
    }

    // Se admiten nombres con o sin extensi?n .xml, siempre dentro de esta carpeta.
    const nombreXML = path.basename(nombreIntroducido);
    const nombreBase = path.parse(nombreXML).name;
    const RUTA_XML = path.join(__dirname, nombreXML.toLowerCase().endsWith('.xml')
      ? nombreXML
      : `${nombreXML}.xml`);
    const RUTA_CSV = path.join(__dirname, 'municipios_catalunya.csv');
    const RUTA_JSON = path.join(__dirname, `${nombreBase}.json`);

    console.log('Comprobando archivos...');

    if (!fs.existsSync(RUTA_CSV)) {
      throw new Error(`No se encuentra el CSV: '${RUTA_CSV}'`);
    }

    if (!fs.existsSync(RUTA_XML)) {
      throw new Error(`No se encuentra el XML: '${RUTA_XML}'`);
    }

    console.log('1. Cargando municipios desde el CSV...');
    const diccionarioOficial = cargarDiccionarioDesdeCSV(RUTA_CSV);

    if (diccionarioOficial.size === 0) {
      throw new Error('El CSV no contiene municipios válidos.');
    }

    console.log('2. Parseando archivo XML...');
    const xmlContent = fs.readFileSync(RUTA_XML, 'utf8');

    if (!xmlContent || xmlContent.trim().length === 0) {
      throw new Error('El archivo XML está vacío.');
    }

    const parser = new XMLParser({
      ignoreAttributes: false,
      parseNodeValue: false,
      trimValues: true
    });

    const parsed = parser.parse(xmlContent);

    const entitatsRaw = parsed.registre_ongd?.entitat || [];
    const listaEntidades = Array.isArray(entitatsRaw)
      ? entitatsRaw
      : [entitatsRaw];

    if (listaEntidades.length === 0) {
      throw new Error('No se encontraron etiquetas <entitat> dentro de <registre_ongd>.');
    }

    console.log('3. Transformando datos al esquema global...');

    const entidadesGlobales = listaEntidades.map(item => {
      let codiPostal = item.codi_postal
        ? String(item.codi_postal).trim()
        : null;

      if (codiPostal && codiPostal.length < 5) {
        codiPostal = codiPostal.padStart(5, '0');
      }

      const geoData = resolverMunicipioProvincia(
        item.municipi,
        codiPostal,
        diccionarioOficial
      );

      return {
        cod_entidad: item.n_mero_registre
          ? String(item.n_mero_registre)
          : null,
        cif_entidad: item.cif_entitat
          ? String(item.cif_entitat)
          : null,
        nombre: item.nom_de_l_entitat
          ? String(item.nom_de_l_entitat).trim()
          : null,
        direccion: item.adre_a
          ? String(item.adre_a).trim()
          : null,
        codigo_postal: codiPostal,
        descripcion: item.naturalesa
          ? String(item.naturalesa).trim()
          : null,
        contacto: concatenarContacto(
          item.tel_fon,
          item.tel_fon_m_bil,
          item.correu_electr_nic
        ),
        url: limpiarUrl(item.web),
        ambito: null,
        localidad: {
          codigo: geoData.localidad_codigo,
          nombre: geoData.localidad_nombre ||
            (item.municipi ? String(item.municipi).trim() : null)
        },
        provincia: {
          codigo: geoData.provincia_codigo,
          nombre: geoData.provincia_nombre
        },
        coordenadas: {
          latitud: null,
          longitud: null
        }
      };
    });

    console.log('4. Guardando resultados...');
    fs.writeFileSync(
      RUTA_JSON,
      JSON.stringify(entidadesGlobales, null, 2),
      'utf8'
    );

    console.log(
      `¡Éxito! Procesadas ${entidadesGlobales.length} entidades en '${RUTA_JSON}'.`
    );
  } catch (error) {
    consola.close();
    console.error('\n❌ ERROR DURANTE LA EXTRACCIÓN:');
    console.error(error.message);
    console.error('Proceso abortado. No se generó el archivo JSON.\n');
  }
}

// Ejecutar el script.
ejecutarExtraccion();