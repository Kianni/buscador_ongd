
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

function normalizarClaveMunicipio(texto) {
  const normalizado = normalizarTexto(texto);
  return normalizado ? normalizado.replace(/[^A-Z0-9]/g, '') : null;
}

function limpiar(valor) {
  if (valor === null || valor === undefined) return null;

  const t = String(valor).replace(/\s+/g, ' ').trim();
  return t === '' ? null : t;
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
    } else if (
      (caracter === '\n' || caracter === '\r') &&
      !dentroComillas
    ) {
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

  if (codiPostal && /^\d{5}$/.test(String(codiPostal))) {
    const prefijo = String(codiPostal).substring(0, 2);

    if (TABLA_PROVINCIAS_CP[prefijo]) {
      resultado.provincia_codigo = TABLA_PROVINCIAS_CP[prefijo].p_codigo;
      resultado.provincia_nombre = TABLA_PROVINCIAS_CP[prefijo].p_nombre;
    }
  }

  return resultado;
}

// Municipios con artículo:
// "Hospitalet de Llobregat, l'" -> "l'Hospitalet de Llobregat"
// "Masnou, el" -> "el Masnou"

function variantesMunicipio(texto) {
  const t = limpiar(texto);
  if (!t) return [];

  const salida = new Set([t]);

  const parentesis = /^(.*?)\s*\(\s*(l'|el|la|els|les|los|las)\s*\)$/i.exec(t);

  if (parentesis) {
    const articulo = parentesis[2];
    const municipio = parentesis[1].trim();

    salida.add(
      `${articulo}${articulo.endsWith("'") ? '' : ' '}${municipio}`
    );
  }

  const final = /^(.*?)[\s,]+(l'|el|la|els|les|los|las)$/i.exec(t);

  if (final) {
    const articulo = final[2];

    salida.add(
      `${articulo}${articulo.endsWith("'") ? '' : ' '}${final[1].trim()}`
    );
  }

  const inicial = /^(l'|el |la |els |les |los |las )(.*)$/i.exec(t);

  if (inicial) {
    salida.add(inicial[2].trim());
  }

  return [...salida];
}

// ==========================================
// 3. GEOCODIFICACIÓN CON CARTOCIUDAD
// ==========================================

const URL_CARTOCIUDAD =
  'https://www.cartociudad.es/geocoder/api/geocoder';

function extraerResultados(datos) {
  if (Array.isArray(datos)) return datos;
  if (Array.isArray(datos?.result)) return datos.result;
  if (Array.isArray(datos?.results)) return datos.results;
  if (datos && typeof datos === 'object') return [datos];
  return [];
}

function coordenadasValidas(lat, lon) {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= 27 && lat <= 45 &&
    lon >= -19 && lon <= 5
  );
}

// MISMA SIMPLIFICACIÓN QUE LA PRUEBA INDEPENDIENTE.
function simplificarDireccionParaBusqueda(direccion) {
  const texto = limpiar(String(direccion ?? '')) || '';

  return texto
    .replace(
      /\s+(?:baixos?|bajos?|entresuelo|ático|àtic|atic|pis|bajo|baix|atico|local|principal|piso)(?:\s+[\wªº.-]+)*$/i,
      ''
    )
    .replace(/[,\s]+$/, '');
}

async function consultarCartoCiudad(endpoint, parametros) {
  const url = new URL(`${URL_CARTOCIUDAD}/${endpoint}`);

  for (const [clave, valor] of Object.entries(parametros)) {
    if (valor !== null && valor !== undefined && valor !== '') {
      url.searchParams.set(clave, String(valor));
    }
  }

  const respuesta = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(15000)
  });

  const cuerpo = await respuesta.text();

  if (!respuesta.ok) {
    throw new Error(
      `${endpoint} HTTP ${respuesta.status}: ${cuerpo.slice(0, 300)}`
    );
  }

  if (!cuerpo.trim()) {
    throw new Error(`${endpoint} ha devuelto una respuesta vacía.`);
  }

  try {
    return JSON.parse(cuerpo);
  } catch {
    throw new Error(
      `${endpoint} no ha devuelto JSON válido: ${cuerpo.slice(0, 300)}`
    );
  }
}

// MISMA PUNTUACIÓN QUE LA PRUEBA INDEPENDIENTE.
function puntuarCandidato(
  c,
  numeroPortal,
  cp,
  municipio,
  provincia
) {
  let puntos = 0;

  if (c.type === 'portal') puntos += 100;

  if (
    numeroPortal &&
    String(c.portalNumber ?? '') === numeroPortal
  ) {
    puntos += 80;
  }

  if (
    cp &&
    String(c.postalCode ?? '') === String(cp)
  ) {
    puntos += 40;
  }

  if (
    municipio &&
    c.muni &&
    normalizarClaveMunicipio(c.muni) ===
      normalizarClaveMunicipio(municipio)
  ) {
    puntos += 20;
  }

  if (
    provincia &&
    c.province &&
    normalizarClaveMunicipio(c.province) ===
      normalizarClaveMunicipio(provincia)
  ) {
    puntos += 10;
  }

  return puntos;
}

// MISMO FLUJO QUE probar-geocodificacion.cjs.
async function obtenerCoordenadas(
  direccion,
  codigoPostal,
  municipio,
  provincia
) {
  if (!direccion || !municipio) {
    console.log(
      '[GEOCODIFICACIÓN] No se consulta: falta la dirección o el municipio.'
    );
    return null;
  }

  const direccionBusqueda =
    simplificarDireccionParaBusqueda(direccion);

  if (!direccionBusqueda) return null;

  const consulta = [
    direccionBusqueda,
    codigoPostal,
    municipio,
    provincia,
    'España'
  ].filter(Boolean).join(', ');

  try {
    console.log('\n' + '='.repeat(72));
    console.log(`[GEOCODIFICACIÓN] Dirección original: ${direccion}`);
    console.log(`[GEOCODIFICACIÓN] Dirección simplificada: ${direccionBusqueda}`);
    console.log(`[GEOCODIFICACIÓN] Consulta de referencia: ${consulta}`);

    // 1. Primera búsqueda con filtros de código postal y municipio.
    const parametros = {
      q: direccionBusqueda,
      limit: '10'
    };

    if (codigoPostal && /^\d{5}$/.test(String(codigoPostal))) {
      parametros.cod_postal_filter = codigoPostal;
    }

    if (municipio) {
      parametros.municipio_filter = municipio;
    }

    let candidatos = extraerResultados(
      await consultarCartoCiudad('candidates', parametros)
    );

    // 2. Si no hay resultados, repetir sin filtros,
    // incluyendo municipio y provincia en el texto de búsqueda.
    if (!candidatos.length) {
      console.log(
        '[GEOCODIFICACIÓN] Sin resultados con filtros; se repite sin filtros.'
      );

      candidatos = extraerResultados(
        await consultarCartoCiudad('candidates', {
          q: [
            direccionBusqueda,
            municipio,
            provincia,
            'España'
          ].filter(Boolean).join(', '),
          limit: '10'
        })
      );
    }

    if (!candidatos.length) {
      console.log(
        '[GEOCODIFICACIÓN] RESULTADO: no se han encontrado candidatos.'
      );
      return null;
    }

    const muniNorm = normalizarClaveMunicipio(municipio);
    const provNorm = normalizarClaveMunicipio(provincia);

    const numeroPortal =
      direccionBusqueda.match(/\b(\d{1,5})\b/)?.[1] ?? null;

    // 3. Descartar candidatos que contradigan municipio,
    // provincia o código postal.
    const validos = candidatos.filter(c => {
      if (
        c.muni &&
        muniNorm &&
        normalizarClaveMunicipio(c.muni) !== muniNorm
      ) {
        return false;
      }

      if (
        c.province &&
        provNorm &&
        normalizarClaveMunicipio(c.province) !== provNorm
      ) {
        return false;
      }

      if (
        codigoPostal &&
        c.postalCode &&
        String(c.postalCode) !== String(codigoPostal)
      ) {
        return false;
      }

      return true;
    });

    console.log(
      `[GEOCODIFICACIÓN] Candidatos recibidos: ${candidatos.length}`
    );

    console.log(
      `[GEOCODIFICACIÓN] Candidatos válidos: ${validos.length}`
    );

    if (!validos.length) {
      console.log(
        '[GEOCODIFICACIÓN] RESULTADO: todos contradicen municipio, provincia o CP.'
      );
      return null;
    }

    // 4. Ordenar según la puntuación de la prueba.
    validos.sort((a, b) =>
      puntuarCandidato(
        b,
        numeroPortal,
        codigoPostal,
        municipio,
        provincia
      ) -
      puntuarCandidato(
        a,
        numeroPortal,
        codigoPostal,
        municipio,
        provincia
      )
    );

    console.log('\n[GEOCODIFICACIÓN] Candidatos válidos ordenados:');

    validos.forEach((c, i) => {
      console.log({
        posicion: i + 1,
        puntuacion: puntuarCandidato(
          c,
          numeroPortal,
          codigoPostal,
          municipio,
          provincia
        ),
        address: c.address,
        type: c.type,
        portalNumber: c.portalNumber,
        postalCode: c.postalCode,
        muni: c.muni,
        province: c.province,
        lat: c.lat,
        lng: c.lng,
        id: c.id
      });
    });

    const candidato = validos[0];

    let lat = Number(candidato.lat);
    let lon = Number(candidato.lng);

    // 5. Consultar find únicamente si las coordenadas no son válidas.
    if (
      !coordenadasValidas(lat, lon) &&
      candidato.id &&
      candidato.type
    ) {
      console.log(
        '[GEOCODIFICACIÓN] Coordenadas no válidas; se consulta find.'
      );

      const encontrado = extraerResultados(
        await consultarCartoCiudad('find', {
          id: candidato.id,
          type: candidato.type,
          portal: candidato.portalNumber
        })
      )[0];

      if (encontrado) {
        lat = Number(encontrado.lat);
        lon = Number(encontrado.lng);
      }
    }

    // 6. Si no hay coordenadas válidas, no se devuelve nada.
    if (!coordenadasValidas(lat, lon)) {
      console.log(
        '[GEOCODIFICACIÓN] RESULTADO: el candidato seleccionado no tiene coordenadas válidas.'
      );
      return null;
    }

    const resultado = {
      latitud: lat,
      longitud: lon,
      direccion: candidato.address ?? null,
      tipo: candidato.type ?? null,
      numeroPortal: candidato.portalNumber ?? null,
      codigoPostal: candidato.postalCode ?? null,
      municipio: candidato.muni ?? null,
      provincia: candidato.province ?? null
    };

    console.log('\n[GEOCODIFICACIÓN] CANDIDATO SELECCIONADO:');
    console.log(resultado);

    return resultado;

  } catch (error) {
    console.error(
      `[GEOCODIFICACIÓN] Error buscando "${consulta}": ${error.message}`
    );

    return null;
  }
}

async function completarCoordenadas(entidades, informe) {
  let obtenidas = 0;
  let noObtenidas = 0;
  let indice = 0;

  async function trabajador() {
    while (indice < entidades.length) {
      const entidad = entidades[indice++];

      // El XML no proporciona coordenadas.
      // Se buscan mediante CartoCiudad.
      const resultado = await obtenerCoordenadas(
        entidad.direccion,
        entidad.codigo_postal,
        entidad.en_localidad?.nombre,
        entidad.en_localidad?.en_provincia?.nombre
      );

      if (resultado) {
        entidad.latitud = resultado.latitud;
        entidad.longitud = resultado.longitud;
        obtenidas++;
      } else {
        // Si no se encuentra, las coordenadas siguen siendo null.
        entidad.latitud = null;
        entidad.longitud = null;
        noObtenidas++;

        informe.avisos.push({
          id: entidad.cod_entidad,
          campo: 'latitud_longitud',
          categoria: 'servicio_externo',
          mensaje: 'No se han podido obtener las coordenadas de la dirección.'
        });
      }
    }
  }

  const numeroTrabajadores = Math.min(5, entidades.length);

  await Promise.all(
    Array.from({ length: numeroTrabajadores }, () => trabajador())
  );

  informe.resumen.coordenadas_obtenidas = obtenidas;
  informe.resumen.coordenadas_no_obtenidas = noObtenidas;

  informe.resumen.con_avisos = new Set(
    informe.avisos.map(aviso => aviso.id).filter(Boolean)
  ).size;
}

// ==========================================
// 4. EXTRACCIÓN AL FORMATO COMÚN
// ==========================================

const PREFIJO_FUENTE = 'CAT';

const RUTA_CSV_MUNICIPIOS = path.join(
  __dirname,
  'municipios_catalunya.csv'
);

async function extraerCAT(textoXml, opciones = {}) {
  const libUrl = nombre =>
    pathToFileURL(
      path.join(__dirname, '..', '..', 'lib', nombre)
    ).href;

  const {
    procesarEmails,
    procesarTelefonos,
    procesarUrl,
    SEPARADOR
  } = await import(libUrl('contacto.mjs'));

  const {
    contarPorCategoria,
    posiblesDuplicados
  } = await import(libUrl('informe.mjs'));

  const {
    separarNombre,
    normalizarDireccion
  } = await import(libUrl('nombres.mjs'));

  const diccionario = opciones.diccionario ??
    cargarDiccionarioDesdeCSV(RUTA_CSV_MUNICIPIOS, true);

  if (!textoXml || textoXml.trim() === '') {
    throw new Error('El archivo XML está vacío.');
  }

  const parsed = new XMLParser({
    ignoreAttributes: false,
    parseTagValue: false,
    trimValues: true
  }).parse(textoXml);

  const bruto = parsed?.registre_ongd?.entitat;

  if (bruto === undefined) {
    throw new Error(
      'No se encontraron etiquetas <entitat> dentro de <registre_ongd>.'
    );
  }

  const lista = Array.isArray(bruto) ? bruto : [bruto];

  const informe = {
    fuente: 'Catalunya',

    resumen: {
      leidos: lista.length,
      cargados: 0,
      rechazados: 0,
      duplicados: 0,
      con_reparaciones: 0,
      con_avisos: 0,
      coordenadas_obtenidas: 0,
      coordenadas_no_obtenidas: 0
    },

    rechazados: [],
    duplicados: [],
    reparados: [],
    avisos: [],

    sin_dato_en_origen: {
      ambito: lista.length,
      latitud_longitud: lista.length
    }
  };

  const entidades = [];
  const vistos = new Map();

  lista.forEach((item, indice) => {
    const fila = indice + 1;
    let id = limpiar(item.n_mero_registre);

    const reparados = [];
    const avisos = [];

    const reparar = (
      campo,
      antes,
      despues,
      motivo,
      categoria = 'formato'
    ) => reparados.push({
      fila,
      id,
      campo,
      categoria,
      antes,
      despues,
      motivo
    });

    const avisar = (
      campo,
      mensaje,
      categoria = 'formato'
    ) => avisos.push({
      fila,
      id,
      campo,
      categoria,
      mensaje
    });

    const rechazar = (
      campo,
      motivo,
      categoria = 'faltante'
    ) => informe.rechazados.push({
      fila,
      id,
      campo,
      categoria,
      motivo
    });

    if (!id) {
      return rechazar(
        'n_mero_registre',
        'Falta el número de registro.'
      );
    }

    if (/^\d{1,3}(?:\.\d{3})+$/.test(id)) {
      const limpio = id.replace(/\./g, '');

      reparar(
        'n_mero_registre',
        id,
        limpio,
        'Separador de miles eliminado del número de registro.'
      );

      id = limpio;

    } else if (!/^\d+$/.test(id)) {
      avisar(
        'n_mero_registre',
        `El número de registro no es numérico: "${id}".`,
        'formato'
      );
    }

    const firma = JSON.stringify(item);

    if (vistos.has(id)) {
      const previo = vistos.get(id);

      informe.duplicados.push({
        fila,
        id,
        nombre: limpiar(item.nom_de_l_entitat) || null,
        fila_original: previo.fila,
        categoria: 'duplicado',
        tipo: previo.firma === firma ? 'idéntico' : 'conflicto',
        accion: `Se conserva la primera aparición (fila ${previo.fila}).`
      });

      informe.resumen.duplicados++;
      return;
    }

    vistos.set(id, { firma, fila });

    // Nombre de la entidad.
    const nombreOrigen = limpiar(item.nom_de_l_entitat);
    const nombre = separarNombre(nombreOrigen);

    if (nombre !== nombreOrigen) {
      reparar(
        'nom_de_l_entitat',
        nombreOrigen,
        nombre,
        'Nombre pegado en el origen: espacios restaurados y erratas corregidas (lib/correcciones.json).'
      );
    }

    if (!nombre) {
      return rechazar(
        'nom_de_l_entitat',
        'El nombre de la entidad está vacío.'
      );
    }

    // Código postal.
    let cp = limpiar(item.codi_postal);

    if (cp && /^\d{2}\s?\d{3}$|^\d{4}$/.test(cp)) {
      const arreglado = cp.replace(/\s/g, '').padStart(5, '0');

      if (arreglado !== cp) {
        reparar(
          'codi_postal',
          cp,
          arreglado,
          /^\d{4}$/.test(cp)
            ? 'Código postal de 4 dígitos: se añade el cero inicial.'
            : 'Espacio interno eliminado.'
        );
      }

      cp = arreglado;
    }

    if (cp && !/^\d{5}$/.test(cp)) {
      avisar(
        'codi_postal',
        `Código postal con formato no válido: "${cp}". Se conserva el original.`,
        'formato'
      );

    } else if (cp && !TABLA_PROVINCIAS_CP[cp.slice(0, 2)]) {
      avisar(
        'codi_postal',
        `Código postal "${cp}" ${
          Number(cp.slice(0, 2)) > 52 || cp.slice(0, 2) === '00'
            ? 'fuera de rango (no existe esa provincia)'
            : 'de fuera de Catalunya'
        }. Se conserva el original.`,
        Number(cp.slice(0, 2)) > 52 || cp.slice(0, 2) === '00'
          ? 'rango'
          : 'semantico'
      );
    }

    if (!cp) {
      avisar(
        'codi_postal',
        'La entidad no tiene código postal en el origen.',
        'faltante'
      );
    }

    // Municipio y provincia.
    const municipioOrigen = limpiar(item.municipi);
    let info = null;

    for (const v of variantesMunicipio(municipioOrigen)) {
      const clave = normalizarClaveMunicipio(v);

      if (clave && diccionario.has(clave)) {
        info = diccionario.get(clave);
        break;
      }
    }

    if (!info) {
      return rechazar(
        'municipi',
        municipioOrigen
          ? `Municipio sin correspondencia en la tabla oficial (no se inventa el código INE): "${municipioOrigen}".`
          : 'El municipio está vacío.',
        municipioOrigen ? 'semantico' : 'faltante'
      );
    }

    if (
      cp &&
      /^\d{5}$/.test(cp) &&
      TABLA_PROVINCIAS_CP[cp.slice(0, 2)] &&
      cp.slice(0, 2) !== info.p_codigo
    ) {
      avisar(
        'codi_postal',
        `El código postal ${cp} no corresponde a la provincia ${info.p_codigo} del municipio ${info.l_codigo}. Manda el municipio.`,
        'semantico'
      );
    }

    // Dirección.
    const direccionOrigen = limpiar(item.adre_a);
    const direccion = normalizarDireccion(direccionOrigen) || null;

    if (direccionOrigen && direccion !== direccionOrigen) {
      reparar(
        'adre_a',
        direccionOrigen,
        direccion,
        'Dirección pegada en el origen: espacios, coma antes del número y erratas corregidas (lib/correcciones.json).'
      );
    }

    if (!direccionOrigen) {
      avisar(
        'adre_a',
        'La entidad no tiene dirección en el origen. direccion = null.',
        'faltante'
      );
    }

    // Contacto, teléfonos y correo.
    const tel = procesarTelefonos(
      (item.tel_fon ?? '') +
      (item.tel_fon_m_bil ? '\n' + item.tel_fon_m_bil : '')
    );

    const mail = procesarEmails(item.correu_electr_nic);

    for (const [campo, res] of [
      ['tel_fon', tel],
      ['correu_electr_nic', mail]
    ]) {
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

    const contactos = [tel.valor, mail.valor].filter(Boolean);

    // Web.
    const web = procesarUrl(item.web);

    if (web.estado === 'reparado') {
      reparar(
        'web',
        web.original.trim(),
        web.valor,
        'URL reparada; el resultado es válido.'
      );
    }

    if (web.estado === 'conservado') {
      avisar(
        'web',
        `No se puede reparar: se conserva el original "${web.valor}".`
      );
    }

    // Entidad.
    entidades.push({
      cod_entidad: `${PREFIJO_FUENTE}:${id}`,
      nombre,
      ambito: null,
      direccion,
      codigo_postal: cp,

      // El XML no incluye coordenadas.
      // Se completarán mediante CartoCiudad.
      longitud: null,
      latitud: null,

      descripcion: limpiar(item.naturalesa),
      contacto: contactos.length ? contactos.join(SEPARADOR) : null,
      url: web.valor,

      en_localidad: {
        codigo: info.l_codigo,
        nombre: info.l_nombre,

        en_provincia: {
          codigo: info.p_codigo,
          nombre: info.p_nombre
        }
      }
    });

    if (reparados.length) {
      informe.reparados.push(...reparados);
      informe.resumen.con_reparaciones++;
    }

    if (avisos.length) {
      informe.avisos.push(
        ...avisos.map(aviso => ({
          ...aviso,
          id: `${PREFIJO_FUENTE}:${id}`
        }))
      );

      informe.resumen.con_avisos++;
    }
  });

  // ==========================================
  // 5. GEOCODIFICACIÓN DE LAS ENTIDADES
  // ==========================================

  console.log('\nIniciando geocodificación con CartoCiudad...');

  await completarCoordenadas(entidades, informe);

  console.log(
    `Coordenadas obtenidas: ${informe.resumen.coordenadas_obtenidas}`
  );

  console.log(
    `Coordenadas no obtenidas: ${informe.resumen.coordenadas_no_obtenidas}`
  );

  // ==========================================
  // 6. FINALIZACIÓN DEL INFORME
  // ==========================================

  informe.resumen.cargados = entidades.length;
  informe.resumen.rechazados = informe.rechazados.length;

  informe.sin_dato_en_origen.latitud_longitud =
    informe.resumen.coordenadas_no_obtenidas;

  posiblesDuplicados(entidades, informe);
  contarPorCategoria(informe);

  return { entidades, informe };
}

// ==========================================
// 7. USO DESDE CONSOLA
// ==========================================

async function ejecutarExtraccion() {
  const consola = readline.createInterface({
    input: stdin,
    output: stdout
  });

  try {
    const nombreIntroducido = (
      await consola.question(
        'Nombre del archivo XML que quieres convertir (por ejemplo, entidades.xml): '
      )
    ).trim();

    consola.close();

    if (!nombreIntroducido) {
      throw new Error('Debes indicar el nombre del archivo XML.');
    }

    const nombreXML = path.basename(nombreIntroducido);
    const nombreBase = path.parse(nombreXML).name;

    const RUTA_XML = path.join(
      __dirname,
      nombreXML.toLowerCase().endsWith('.xml')
        ? nombreXML
        : `${nombreXML}.xml`
    );

    const RUTA_JSON = path.join(
      __dirname,
      `${nombreBase}.json`
    );

    const RUTA_INFORME = path.join(
      __dirname,
      `${nombreBase}.informe.json`
    );

    if (!fs.existsSync(RUTA_XML)) {
      throw new Error(`No se encuentra el XML: '${RUTA_XML}'`);
    }

    const { entidades, informe } = await extraerCAT(
      fs.readFileSync(RUTA_XML, 'utf8')
    );

    fs.writeFileSync(
      RUTA_JSON,
      JSON.stringify(entidades, null, 2),
      'utf8'
    );

    fs.writeFileSync(
      RUTA_INFORME,
      JSON.stringify(informe, null, 2),
      'utf8'
    );

    const r = informe.resumen;

    console.log(
      `\nLeídas ${r.leidos}; cargadas ${r.cargados}; ` +
      `rechazadas ${r.rechazados}; duplicadas ${r.duplicados}; ` +
      `con reparaciones ${r.con_reparaciones}; con avisos ${r.con_avisos}.`
    );

    console.log(
      `Coordenadas obtenidas: ${r.coordenadas_obtenidas}; ` +
      `no obtenidas: ${r.coordenadas_no_obtenidas}.`
    );

    console.log(
      `Datos: '${RUTA_JSON}'\nInforme: '${RUTA_INFORME}'`
    );

  } catch (error) {
    consola.close();

    console.error('\nERROR DURANTE LA EXTRACCIÓN:');
    console.error(error.message);
    console.error('Proceso abortado. No se generó el archivo JSON.\n');

    process.exitCode = 1;
  }
}

// ==========================================
// 8. EXPORTACIONES
// ==========================================

module.exports = {
  extraerCAT,
  PREFIJO_FUENTE,
  normalizarClaveMunicipio,
  parsearCSV,
  obtenerCoordenadas
};

if (require.main === module) {
  ejecutarExtraccion();
}
