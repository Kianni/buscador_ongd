
const fs = require('fs');
const path = require('path');
const readline = require('readline/promises');
const { stdin, stdout } = require('process');
const { pathToFileURL } = require('url');
const { XMLParser } = require('fast-xml-parser');
const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');

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
// 3. GEOCODIFICACIÓN CON SELENIUM
// ==========================================

const URL_COORDENADAS_GPS = 'https://www.coordenadas-gps.com/';

function coordenadasValidas(lat, lon) {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= 27 && lat <= 45 &&
    lon >= -19 && lon <= 5
  );
}

function simplificarDireccionParaBusqueda(direccion) {
  const texto = limpiar(String(direccion ?? '')) || '';

  return texto
    .replace(
      /\s+(?:baixos?|bajos?|entresuelo|ático|àtic|atic|pis|bajo|baix|atico|local|principal|piso)(?:\s+[\wªº.-]+)*$/i,
      ''
    )
    .replace(/[,\s]+$/, '');
}

async function asegurarPaginaCoordenadasLista(driver) {
  let urlActual = '';
  try {
    urlActual = await driver.getCurrentUrl();
  } catch {}

  if (urlActual.startsWith(URL_COORDENADAS_GPS)) {
    const yaLista = await driver.executeScript(() =>
      Boolean(document.getElementById('address')) &&
      typeof window.gl_map === 'object' &&
      window.gl_map !== null &&
      !document.querySelector('.fc-consent-root')
    );
    if (yaLista) return;
  }

  await driver.get(URL_COORDENADAS_GPS);

  // Espera al aviso de Google Funding Choices («Consentir») si aparece de forma asíncrona.
  try {
    const botonConsentir = await driver.wait(
      until.elementLocated(By.css('button.fc-cta-consent')),
      5000
    );
    if (await botonConsentir.isDisplayed()) {
      await botonConsentir.click();
      await driver.wait(
        async () => !(await driver.executeScript(() => Boolean(document.querySelector('.fc-consent-root')))),
        5000
      );
      console.log('[GEOCODIFICACIÓN] Se pulsó «Consentir».');
    }
  } catch {
    console.log('[GEOCODIFICACIÓN] No apareció el aviso «Consentir» (consentimiento ya guardado).');
  }

  // Desplaza la vista al mapa/formulario para activar la inicialización diferida (gl_map).
  await driver.wait(until.elementLocated(By.id('address')), 15000);
  await driver.executeScript(() => {
    document.getElementById('map_canvas')?.scrollIntoView({ block: 'center' });
    document.getElementById('address')?.scrollIntoView({ block: 'center' });
  });

  await driver.wait(
    async () => driver.executeScript(() => {
      if (typeof window.gl_map === 'object' && window.gl_map !== null) return true;
      if (typeof window.initializeMap === 'function' && !window.mapLoaded) {
        try {
          window.appeared = 1;
          if (window.geoloc === 0) window.geoloc = 2;
          window.initializeMap();
        } catch {}
      }
      return typeof window.gl_map === 'object' && window.gl_map !== null;
    }),
    10000
  );

  // Evita que alert("Error de geolocalización.") bloquee Selenium si una dirección no tiene resultados.
  await driver.executeScript(() => {
    if (!window.__alertSilenciado) {
      window.alert = msg => { window.__geoAlert = String(msg ?? ''); };
      window.__alertSilenciado = true;
    }
  });
}

async function obtenerCoordenadas(
  driver,
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
    provincia && normalizarTexto(provincia) !== normalizarTexto(municipio) ? provincia : null,
    'España'
  ].filter(Boolean).join(', ');

  try {
    console.log(`[GEOCODIFICACIÓN] Buscando con Selenium: ${consulta}`);
    await asegurarPaginaCoordenadasLista(driver);

    // Limpia coordenadas previas, fija la dirección exacta (con ç/acentos) y reinicia avisos.
    await driver.executeScript(texto => {
      window.__geoAlert = null;
      const latEl = document.getElementById('latitude');
      const lonEl = document.getElementById('longitude');
      if (latEl) latEl.value = '';
      if (lonEl) lonEl.value = '';
      const addrEl = document.getElementById('address');
      if (addrEl) {
        addrEl.value = texto;
        addrEl.dispatchEvent(new Event('input', { bubbles: true }));
        addrEl.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, consulta);

    const boton = await driver.wait(
      until.elementLocated(By.xpath("//button[contains(translate(normalize-space(.), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'obtener coordenadas gps')]|//input[@type='submit' and contains(translate(@value, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'obtener coordenadas gps')]")),
      15000
    );
    await boton.click();

    try {
      await driver.wait(async () => {
        const res = await driver.executeScript(() => ({
          lat: document.getElementById('latitude')?.value ?? '',
          lon: document.getElementById('longitude')?.value ?? '',
          err: window.__geoAlert
        }));
        return Boolean(res.err) || (res.lat !== '' && res.lon !== '');
      }, 8000);
    } catch {
      // Si la API no devuelve resultados a tiempo, los campos permanecen vacíos.
    }

    const valores = await driver.executeScript(() => ({
      lat: document.getElementById('latitude')?.value ?? '',
      lon: document.getElementById('longitude')?.value ?? '',
      err: window.__geoAlert ?? null
    }));
    const lat = Number(String(valores.lat).replace(',', '.'));
    const lon = Number(String(valores.lon).replace(',', '.'));

    if (!coordenadasValidas(lat, lon)) {
      const detalle = valores.err ? ` (${valores.err})` : '';
      console.log(`[GEOCODIFICACIÓN] Sin coordenadas válidas para: ${consulta}${detalle}`);
      return null;
    }

    return { latitud: lat, longitud: lon };

  } catch (error) {
    if (/invalid session id|session deleted|not connected to devtools|disconnected/i.test(error.message)) {
      throw error;
    }
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
  let driver;

  async function crearNavegador() {
    const opciones = new chrome.Options();
    opciones.addArguments('--headless=new', '--disable-dev-shm-usage', '--no-sandbox', '--log-level=3', '--deny-permission-prompts');
    opciones.setUserPreferences({
      'profile.default_content_setting_values.geolocation': 2,
      'profile.managed_default_content_settings.geolocation': 2
    });
    return new Builder().forBrowser('chrome').setChromeOptions(opciones).build();
  }

  if (entidades.length === 0) {
    informe.resumen.coordenadas_obtenidas = 0;
    informe.resumen.coordenadas_no_obtenidas = 0;
    return;
  }

  async function trabajador() {
    while (indice < entidades.length) {
      const entidad = entidades[indice++];

      // El XML no proporciona coordenadas; se buscan en la web con Selenium.
      let resultado = null;
      try {
        resultado = await obtenerCoordenadas(
          driver,
          entidad.direccion,
          entidad.codigo_postal,
          entidad.en_localidad?.nombre,
          entidad.en_localidad?.en_provincia?.nombre
        );
      } catch (error) {
        console.error(`[GEOCODIFICACIÓN] Chrome perdió la sesión; se reinicia y reintenta: ${error.message}`);
        try { await driver.quit(); } catch {}
        driver = await crearNavegador();
        resultado = await obtenerCoordenadas(
          driver,
          entidad.direccion,
          entidad.codigo_postal,
          entidad.en_localidad?.nombre,
          entidad.en_localidad?.en_provincia?.nombre
        );
      }

      if (resultado) {
        entidad.latitud = resultado.latitud;
        entidad.longitud = resultado.longitud;
        obtenidas++;

        informe.reparados.push({
          id: entidad.cod_entidad.replace(/^CAT:/, ''),
          campo: 'latitud_longitud',
          categoria: 'faltante',
          antes: null,
          despues: `${resultado.latitud}, ${resultado.longitud}`,
          motivo: 'El XML no incluye coordenadas; obtenidas mediante geocodificación con Selenium (coordenadas-gps.com).'
        });
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

  driver = await crearNavegador();
  try {
    // Una sola sesión y consultas secuenciales para reutilizar el navegador.
    await trabajador();
  } finally {
    if (driver) await driver.quit();
  }

  informe.resumen.coordenadas_obtenidas = obtenidas;
  informe.resumen.coordenadas_no_obtenidas = noObtenidas;

  informe.resumen.con_reparaciones = new Set(
    informe.reparados.map(reparacion => reparacion.id).filter(Boolean)
  ).size;

  informe.resumen.con_avisos = new Set(
    informe.avisos.map(aviso => aviso.id).filter(Boolean)
  ).size;
}

// ==========================================
// 3B. CLASIFICACIÓN DE ÁMBITO CON IA
// ==========================================

const URL_IA_POLLINATIONS = 'https://text.pollinations.ai/openai';
const RUTA_CACHE_AMBITOS = path.join(__dirname, 'cache_ambitos.json');
const RUTA_ENV = path.join(__dirname, '..', '..', '.env');

function leerVariableConfig(nombre) {
  const deEnv = (process.env[nombre] ?? '').trim();
  if (deEnv) return deEnv;
  try {
    if (!fs.existsSync(RUTA_ENV)) return '';
    for (const linea of fs.readFileSync(RUTA_ENV, 'utf8').split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(linea);
      if (m && !linea.trim().startsWith('#') && m[1] === nombre) {
        return m[2].replace(/^(['"])(.*)\1$/, '$2').trim();
      }
    }
  } catch {}
  return '';
}

function proveedorIAConfigurado() {
  if (leerVariableConfig('GEMINI_API_KEY')) return 'Gemini';
  if (leerVariableConfig('GROQ_API_KEY')) return 'Groq';
  if (leerVariableConfig('OPENAI_API_KEY')) return 'OpenAI';
  return 'Pollinations.ai';
}

const AMBITOS_VALIDOS = [
  'MAYORES',
  'DISCAPACIDAD',
  'SALUD_MENTAL',
  'INFANCIA_Y_JUVENTUD',
  'MUJER',
  'MIGRACION',
  'INCLUSION_SOCIAL',
  'EDUCACION_Y_FORMACION',
  'EMPLEO_E_INSERCION_LABORAL',
  'SALUD_Y_ATENCION_SOCIOSANITARIA',
  'VOLUNTARIADO_Y_PARTICIPACION_COMUNITARIA',
  'CULTURA_Y_DESARROLLO_COMUNITARIO'
];
const SET_AMBITOS_VALIDOS = new Set(AMBITOS_VALIDOS);

function cargarCacheAmbitos() {
  try {
    if (fs.existsSync(RUTA_CACHE_AMBITOS)) {
      const datos = JSON.parse(fs.readFileSync(RUTA_CACHE_AMBITOS, 'utf8'));
      if (datos && typeof datos === 'object') return datos;
    }
  } catch {}
  return {};
}

function guardarCacheAmbitos(cache) {
  try {
    fs.writeFileSync(RUTA_CACHE_AMBITOS, JSON.stringify(cache, null, 2), 'utf8');
  } catch {}
}

function extraerJsonArray(texto) {
  const limpio = String(texto ?? '')
    .replace(/```json\s*/gi, '')
    .replace(/```/g, '')
    .trim();
  const inicio = limpio.indexOf('[');
  const fin = limpio.lastIndexOf(']');
  if (inicio === -1 || fin === -1 || fin < inicio) {
    throw new Error('La respuesta de la IA no contiene un array JSON.');
  }
  return JSON.parse(limpio.slice(inicio, fin + 1));
}

async function llamarProveedorIA(prompt) {
  const geminiKey = leerVariableConfig('GEMINI_API_KEY');
  if (geminiKey) {
    console.log('[IA ÁMBITO] Enviando petición a Gemini...');
    const resp = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': geminiKey
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0,
            responseMimeType: 'application/json',
            responseSchema: {
              type: 'ARRAY',
              items: {
                type: 'OBJECT',
                properties: {
                  id: { type: 'STRING' },
                  ambito: { type: 'STRING', enum: AMBITOS_VALIDOS }
                },
                required: ['id', 'ambito']
              }
            }
          }
        }),
        signal: AbortSignal.timeout(45000)
      }
    );
    if (!resp.ok) {
      const detalle = await resp.text();
      throw new Error(`Gemini HTTP ${resp.status} ${resp.statusText}: ${detalle.slice(0, 1000)}`);
    }
    const data = await resp.json();
    return {
      proveedor: 'Gemini',
      contenido: data?.candidates?.[0]?.content?.parts?.[0]?.text
    };
  }

  const groqKey = leerVariableConfig('GROQ_API_KEY');
  const openaiKey = leerVariableConfig('OPENAI_API_KEY');
  const endpoint = groqKey
    ? 'https://api.groq.com/openai/v1/chat/completions'
    : openaiKey
      ? 'https://api.openai.com/v1/chat/completions'
      : URL_IA_POLLINATIONS;
  const apiKey = groqKey || openaiKey;
  const modelo = groqKey ? 'llama-3.3-70b-versatile' : openaiKey ? 'gpt-4o-mini' : 'openai-fast';
  const proveedor = groqKey ? 'Groq' : openaiKey ? 'OpenAI' : 'Pollinations.ai';
  console.log(`[IA ÁMBITO] Enviando petición a ${proveedor}...`);

  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const resp = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: modelo,
      temperature: 0,
      messages: [{ role: 'user', content: prompt }]
    }),
    signal: AbortSignal.timeout(45000)
  });

  if (!resp.ok) throw new Error(`${proveedor} HTTP ${resp.status} ${resp.statusText}`);
  const data = await resp.json();
  return {
    proveedor,
    contenido: data?.choices?.[0]?.message?.content
  };
}

async function clasificarAmbitosLote(lote) {
  const prompt = [
    'Eres un clasificador de entidades (ONGD y asociaciones de Cataluña).',
    `Asigna a cada entidad exactamente UNO de estos ámbitos: ${AMBITOS_VALIDOS.join(', ')}.`,
    'Clasifica basándote en el nombre de la entidad. Usa CULTURA_Y_DESARROLLO_COMUNITARIO o INCLUSION_SOCIAL si el nombre indica cooperación o solidaridad general. No devuelvas valores fuera de la lista.',
    'Responde ÚNICAMENTE con un array JSON válido con el formato [{"id":"...","ambito":"..."}].',
    '',
    'Entidades:',
    JSON.stringify(lote)
  ].join('\n');

  let ultimoError = null;
  for (let intento = 1; intento <= 3; intento++) {
    try {
      if (intento > 1) console.log(`[IA ÁMBITO] Reintento ${intento}/3...`);
      const { contenido } = await llamarProveedorIA(prompt);
      const lista = extraerJsonArray(contenido);

      const mapa = new Map();
      for (const item of lista) {
        if (!item || typeof item.id !== 'string') continue;
        const val = typeof item.ambito === 'string' ? item.ambito.trim().toUpperCase() : null;
        mapa.set(item.id, SET_AMBITOS_VALIDOS.has(val) ? val : null);
      }
      return mapa;
    } catch (error) {
      ultimoError = error;
      console.error(`[IA ÁMBITO] Intento ${intento}/3 fallido: ${error.message}`);
      if (/HTTP (?:400|401|403|404|429)\b/i.test(error.message)) break;
      if (intento < 3) {
        await new Promise(r => setTimeout(r, 1500 * intento));
      }
    }
  }

  throw ultimoError;
}

async function completarAmbitos(entidades, informe) {
  if (entidades.length === 0) {
    informe.resumen.ambitos_obtenidos = 0;
    informe.resumen.ambitos_no_obtenidos = 0;
    return;
  }

  const cache = cargarCacheAmbitos();
  const pendientes = entidades.filter(e => !SET_AMBITOS_VALIDOS.has(cache[e.cod_entidad]));
  const TAM_LOTE = 25;

  for (let i = 0; i < pendientes.length; i += TAM_LOTE) {
    const loteEntidades = pendientes.slice(i, i + TAM_LOTE);
    const lotePayload = loteEntidades.map(e => ({
      id: e.cod_entidad,
      nombre: e.nombre
    }));

    console.log(
      `[IA ÁMBITO] Clasificando lote ${Math.floor(i / TAM_LOTE) + 1}/${Math.ceil(pendientes.length / TAM_LOTE)} (${lotePayload.length} entidades) con ${proveedorIAConfigurado()}...`
    );

    try {
      const resultado = await clasificarAmbitosLote(lotePayload);
      for (const e of loteEntidades) {
        cache[e.cod_entidad] = resultado.has(e.cod_entidad)
          ? resultado.get(e.cod_entidad)
          : null;
      }
      guardarCacheAmbitos(cache);
    } catch (error) {
      console.error(`[IA ÁMBITO] Error en lote: ${error.message}`);
    }
  }

  let obtenidos = 0;
  let noObtenidos = 0;

  for (const entidad of entidades) {
    const ambito = SET_AMBITOS_VALIDOS.has(cache[entidad.cod_entidad])
      ? cache[entidad.cod_entidad]
      : null;

    if (ambito) {
      entidad.ambito = ambito;
      obtenidos++;

      informe.reparados.push({
        id: entidad.cod_entidad.replace(/^CAT:/, ''),
        campo: 'ambito',
        categoria: 'faltante',
        antes: null,
        despues: ambito,
        motivo: 'El XML no incluye ámbito; inferido mediante IA a partir del nombre y dentro de la lista de ámbitos permitidos.'
      });
    } else {
      entidad.ambito = null;
      noObtenidos++;

      informe.avisos.push({
        id: entidad.cod_entidad,
        campo: 'ambito',
        categoria: 'servicio_externo',
        mensaje: 'No se ha podido inferir el ámbito de la entidad mediante IA.'
      });
    }
  }

  informe.resumen.ambitos_obtenidos = obtenidos;
  informe.resumen.ambitos_no_obtenidos = noObtenidos;

  informe.resumen.con_reparaciones = new Set(
    informe.reparados.map(reparacion => reparacion.id).filter(Boolean)
  ).size;

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

    if (cp && !/^\d{5}$/.test(cp)) {
      return rechazar(
        'codi_postal',
        `Código postal con formato no válido: "${cp}" y no se puede corregir con los datos disponibles del municipio.`,
        'formato'
      );
    }

    if (cp && !TABLA_PROVINCIAS_CP[cp.slice(0, 2)]) {
      const prefijo = cp.slice(0, 2);
      return rechazar(
        'codi_postal',
        `Código postal "${cp}" ${
          Number(prefijo) > 52 || prefijo === '00'
            ? 'fuera de rango (no existe esa provincia)'
            : 'de fuera de Catalunya'
        }. La localidad corresponde a ${info.p_nombre}, pero no hay datos para reconstruir con seguridad los cinco dígitos.`,
        Number(prefijo) > 52 || prefijo === '00' ? 'rango' : 'semantico'
      );
    }

    if (cp && cp.slice(0, 2) !== info.p_codigo) {
      return rechazar(
        'codi_postal',
        `El código postal ${cp} no corresponde a la provincia ${info.p_codigo} (${info.p_nombre}) del municipio ${info.l_codigo}. No se puede reconstruir con seguridad el código postal completo usando solo la localidad.`,
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

  console.log('\nIniciando geocodificación con Selenium y coordenadas-gps.com...');

  await completarCoordenadas(entidades, informe);

  console.log(
    `Coordenadas obtenidas: ${informe.resumen.coordenadas_obtenidas}`
  );

  console.log(
    `Coordenadas no obtenidas: ${informe.resumen.coordenadas_no_obtenidas}`
  );

  // ==========================================
  // 5B. CLASIFICACIÓN DE ÁMBITO CON IA
  // ==========================================

  console.log(`\nIniciando clasificación de ámbito con IA (${proveedorIAConfigurado()})...`);

  await completarAmbitos(entidades, informe);

  console.log(`Ámbitos obtenidos: ${informe.resumen.ambitos_obtenidos}`);
  console.log(`Ámbitos no obtenidos: ${informe.resumen.ambitos_no_obtenidos}`);

  // ==========================================
  // 5C. RECHAZO DE ENTIDADES INCOMPLETAS TRAS PROCESAMIENTO
  // ==========================================

  const esVacio = v =>
    v === null || v === undefined || (typeof v === 'string' && v.trim() === '');

  const entidadesCompletas = [];
  let rechazadasPost = 0;

  for (const entidad of entidades) {
    const idRaw = entidad.cod_entidad ? entidad.cod_entidad.replace(/^CAT:/, '') : '';
    const faltantes = [];

    if (esVacio(entidad.cod_entidad) || esVacio(idRaw)) faltantes.push('id');
    if (esVacio(entidad.nombre)) faltantes.push('nombre');
    if (esVacio(entidad.ambito)) faltantes.push('ambito');
    if (esVacio(entidad.direccion)) faltantes.push('direccion');
    if (esVacio(entidad.codigo_postal)) faltantes.push('codigo_postal');
    if (esVacio(entidad.latitud) || !Number.isFinite(entidad.latitud)) faltantes.push('latitud');
    if (esVacio(entidad.longitud) || !Number.isFinite(entidad.longitud)) faltantes.push('longitud');
    if (
      esVacio(entidad.en_localidad?.codigo) ||
      esVacio(entidad.en_localidad?.nombre) ||
      esVacio(entidad.en_localidad?.en_provincia?.codigo) ||
      esVacio(entidad.en_localidad?.en_provincia?.nombre)
    ) {
      faltantes.push('localizacion');
    }

    if (faltantes.length > 0) {
      rechazadasPost++;
      informe.rechazados.push({
        id: idRaw || null,
        campo: faltantes.join(', '),
        categoria: 'faltante',
        motivo: `Entidad rechazada tras el procesamiento por tener campos obligatorios nulos o en blanco: ${faltantes.join(', ')}.`
      });
    } else {
      entidadesCompletas.push(entidad);
    }
  }

  entidades.splice(0, entidades.length, ...entidadesCompletas);
  if (rechazadasPost > 0) {
    console.log(`Rechazadas tras procesamiento por campos faltantes: ${rechazadasPost}`);
  }

  // ==========================================
  // 6. FINALIZACIÓN DEL INFORME
  // ==========================================

  informe.resumen.cargados = entidades.length;
  informe.resumen.rechazados = informe.rechazados.length;

  informe.sin_dato_en_origen.latitud_longitud =
    informe.resumen.coordenadas_no_obtenidas;
  informe.sin_dato_en_origen.ambito =
    informe.resumen.ambitos_no_obtenidos;

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
  obtenerCoordenadas,
  clasificarAmbitosLote
};

if (require.main === module) {
  ejecutarExtraccion();
}
