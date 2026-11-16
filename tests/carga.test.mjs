import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { crearServidor } from '../api/server.mjs';
import { cargarConfig } from '../api/config.mjs';
import { AlmacenMemoria } from '../api/almacen-memoria.mjs';
import { AlmacenSupabase } from '../api/almacen-supabase.mjs';
import { problemasDeEntidad } from '../api/validar.mjs';
import { procesarEmails, procesarTelefonos, procesarUrl } from '../lib/contacto.mjs';

const require = createRequire(import.meta.url);
const { extraerCAT } = require('../scripts/catalunya/extractor.js');
const leer = nombre => fs.readFileSync(new URL(`./fixtures/${nombre}`, import.meta.url), 'utf8');

async function conServidor(prueba, almacen = new AlmacenMemoria()) {
  const servidor = crearServidor({ ...cargarConfig({}), supabaseUrl: '', supabaseClave: '' }, almacen);
  await new Promise(r => servidor.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  const llamar = async (metodo, ruta, cuerpo, cabeceras = {}) => {
    const r = await fetch(base + ruta, { method: metodo, headers: { 'Content-Type': 'application/json', ...cabeceras }, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) });
    return { estado: r.status, datos: await r.json() };
  };
  try { await prueba(llamar, almacen); } finally { servidor.close(); }
}

const BORRAR = { 'X-Confirmar': 'borrar' };

test('no se puede cargar dos veces una fuente sin borrar antes', () => conServidor(async llamar => {
  const primera = await llamar('POST', '/api/carga', { fuentes: [{ fuente: 'CV', contenido: leer('prueba_cv.csv') }] });
  assert.equal(primera.datos.resultados[0].estado, 'cargada');
  const segunda = await llamar('POST', '/api/carga', { fuentes: [{ fuente: 'CV', contenido: leer('prueba_cv.csv') }] });
  assert.equal(segunda.datos.resultados[0].estado, 'ya_cargada');
  assert.equal(segunda.datos.estado.totales.entidades, 10, 'la segunda carga no duplica datos');
}));

test('borrar el almacén permite volver a cargar', () => conServidor(async llamar => {
  await llamar('POST', '/api/carga', { fuentes: [{ fuente: 'CAT', contenido: leer('prueba_cat.xml') }] });
  const sinCabecera = await llamar('DELETE', '/api/almacen');
  assert.equal(sinCabecera.estado, 400);
  const borrado = await llamar('DELETE', '/api/almacen', undefined, BORRAR);
  assert.equal(borrado.datos.borrado.entidades, 9);
  assert.equal(borrado.datos.estado.totales.entidades, 0);
  const otra = await llamar('POST', '/api/carga', { fuentes: [{ fuente: 'CAT', contenido: leer('prueba_cat.xml') }] });
  assert.equal(otra.datos.resultados[0].estado, 'cargada');
}));

test('cada fuente de una petición múltiple se resuelve por separado', () => conServidor(async llamar => {
  await llamar('POST', '/api/carga', { fuentes: [{ fuente: 'CV', contenido: leer('prueba_cv.csv') }] });
  const { datos } = await llamar('POST', '/api/carga', { fuentes: [{ fuente: 'CV' }, { fuente: 'CAT', contenido: leer('prueba_cat.xml') }, { fuente: 'CAN' }, { fuente: 'XX' }] });
  assert.deepEqual(datos.resultados.map(r => r.estado), ['ya_cargada', 'cargada', 'no_disponible', 'desconocida']);
}));

test('un archivo ilegible no toca el almacén', () => conServidor(async llamar => {
  const { datos } = await llamar('POST', '/api/carga', { fuentes: [{ fuente: 'CV', contenido: 'esto,no,es,el,csv\n1,2,3,4,5' }] });
  assert.equal(datos.resultados[0].estado, 'error_datos');
  assert.equal(datos.estado.totales.entidades, 0);
  assert.equal(datos.estado.fuentes.length, 0, 'tras un error la fuente sigue sin estar bloqueada');
}));

test('peticiones mal formadas', () => conServidor(async llamar => {
  assert.equal((await llamar('POST', '/api/carga', { fuentes: [] })).estado, 400);
  assert.equal((await llamar('POST', '/api/carga', { fuentes: [{ fuente: 'CV' }, { fuente: 'CV' }] })).estado, 400);
  assert.equal((await llamar('POST', '/api/carga', { otra: 1 })).estado, 400);
  assert.equal((await llamar('GET', '/api/inexistente')).estado, 404);
}));

test('validador del esquema', () => {
  const buena = { cod_entidad: 'CV:1', nombre: 'X', ambito: 'MUJER', direccion: null, codigo_postal: null, longitud: -0.3, latitud: 39.4, descripcion: null, contacto: null, url: null, en_localidad: { codigo: '46250', nombre: 'València', en_provincia: { codigo: '46', nombre: 'València' } } };
  assert.deepEqual(problemasDeEntidad(buena, 'CV'), []);
  assert.ok(problemasDeEntidad({ ...buena, cod_entidad: 'CAT:1' }, 'CV').length);
  assert.ok(problemasDeEntidad({ ...buena, ambito: 'INVENTADO' }, 'CV').length);
  assert.ok(problemasDeEntidad({ ...buena, latitud: null }, 'CV').length);
  assert.ok(problemasDeEntidad({ ...buena, en_localidad: { codigo: '1', nombre: '' } }, 'CV').length);
});

test('Supabase: llama a las funciones SQL y traduce FUENTE_YA_CARGADA', async () => {
  const llamadas = [];
  const fetchFalso = async (url, opciones) => {
    llamadas.push({ url, cuerpo: JSON.parse(opciones.body), clave: opciones.headers.apikey });
    if (url.endsWith('/cargar_fuente') && llamadas.filter(l => l.url.endsWith('/cargar_fuente')).length > 1) {
      return new Response(JSON.stringify({ code: 'P0001', message: 'FUENTE_YA_CARGADA' }), { status: 400 });
    }
    return new Response(JSON.stringify({ entidades: 1 }), { status: 200 });
  };
  const almacen = new AlmacenSupabase({ url: 'https://x.supabase.co', clave: 'secreta', fetchFn: fetchFalso });
  await almacen.cargar('CV', [{}]);
  assert.equal(llamadas[0].url, 'https://x.supabase.co/rest/v1/rpc/cargar_fuente');
  assert.deepEqual(Object.keys(llamadas[0].cuerpo), ['p_fuente', 'p_entidades']);
  await assert.rejects(() => almacen.cargar('CV', [{}]), e => e.codigo === 'FUENTE_YA_CARGADA');
});

test('Cataluña: formato común, duplicados, rechazos y reparaciones del archivo de prueba', async () => {
  const { entidades, informe } = await extraerCAT(leer('prueba_cat.xml'));
  const { por_categoria: porCategoria, nombres_separados: separados, direcciones_normalizadas: _dn, ...resumen } = informe.resumen;
  assert.ok(separados > 0, 'se restauran espacios en los nombres pegados');
  assert.deepEqual(resumen, { leidos: 12, cargados: 9, rechazados: 1, duplicados: 2, con_reparaciones: 9, con_avisos: 2 });
  // Tipología del enunciado: formato, faltante, rango, duplicado y semántico.
  assert.equal(porCategoria.faltante.rechazados, 1);
  assert.equal(porCategoria.duplicado.duplicados, 2);
  assert.equal(porCategoria.rango.avisos, 1, 'CP 99033 fuera de rango');
  assert.equal(porCategoria.semantico.avisos, 1, 'CP de Girona con municipio de Barcelona');
  assert.equal(informe.rechazados[0].campo, 'nom_de_l_entitat');
  assert.ok(entidades.every(e => e.cod_entidad.startsWith('CAT:') && e.en_localidad.en_provincia.codigo));
  assert.ok(informe.reparados.some(r => r.campo === 'codi_postal' && r.despues === '08006'));
});

test('Cataluña: el archivo completo se carga sin rechazos', async () => {
  const { informe } = await extraerCAT(fs.readFileSync(new URL('../data/Entitats_ONGD_pretty.xml', import.meta.url), 'utf8'));
  assert.equal(informe.resumen.leidos, 765);
  assert.equal(informe.resumen.rechazados, 0);
});

test('regla de reparación: solo si queda válido; si no, se conserva el original', () => {
  assert.equal(procesarEmails('info@fundaciosergiorg').valor, 'info@fundaciosergi.org');
  const sinReparar = procesarEmails('VIVIENDASUPERVISADA@DOMINIOCORTADODESCONOCIDO');
  assert.deepEqual([sinReparar.estado, sinReparar.valor], ['conservado', 'VIVIENDASUPERVISADA@DOMINIOCORTADODESCONOCIDO']);
  assert.equal(procesarEmails('jpedro1@xteCarrercat').valor, 'jpedro1@xtec.cat');
  assert.equal(procesarUrl('http://wwwaeryCarrerorg/').valor, 'http://www.aeryc.org/');
  assert.equal(procesarTelefonos('934216102\n658577264').valor, '934216102, 658577264');
  assert.equal(procesarTelefonos('934228074 93431426').valor, '934228074', 'se conserva el válido');
  assert.equal(procesarTelefonos('96265155').estado, 'conservado', 'número de 8 dígitos');
  assert.equal(procesarUrl('http://https://wwwisilcat').valor, 'https://www.isil.cat');
  assert.equal(procesarUrl('http://wwwaslong/es/').valor, 'http://www.asl.ong/es/');
  assert.equal(procesarUrl('http://codafestl/').estado, 'conservado');
});

test('reparaciones ampliadas: correos pegados, extensiones, números abreviados y redes sociales', () => {
  assert.equal(procesarEmails('patypall@yahooesacedicar@yahooes').valor, 'patypall@yahoo.es, acedicar@yahoo.es');
  assert.equal(procesarEmails('ingman@ingmancatmaria_novella@igmancat').valor, 'ingman@ingman.cat, maria_novella@igman.cat');
  assert.equal(procesarEmails('germanetesje@gmailcoom').valor, 'germanetesje@gmail.com');
  assert.equal(procesarEmails('juliamargarita@yahooes(personal)').valor, 'juliamargarita@yahoo.es');
  assert.equal(procesarEmails('infoarrobaproinfantsorg').valor, 'info@proinfants.org');
  assert.equal(procesarTelefonos('934328526 915327478/9 649490635').valor, '934328526, 915327478, 915327479, 649490635');
  assert.equal(procesarTelefonos('932065910 Ext187').valor, '932065910 ext. 187');
  assert.equal(procesarUrl('http://https://alasgambia@org').valor, 'https://alasgambia.org');
  assert.equal(procesarUrl('http://@teixpetaniloyant(Instagram)').valor, 'https://www.instagram.com/teixpetaniloyant');
  assert.equal(procesarUrl('http://https://xcom/BretxaOBS').valor, 'https://x.com/BretxaOBS');
  assert.equal(procesarUrl('http://htpp://edpaCarrercat').valor, 'http://edpac.cat');
});

test('reparaciones globales: dominios compuestos, @ que falta, punto volado, tildes en webs', () => {
  assert.equal(procesarEmails('sakadawaorggmailcom').valor, 'sakadawaorg@gmail.com');
  assert.equal(procesarEmails('barcelona@fundacionimagoorgco').valor, 'barcelona@fundacionimago.org.co');
  assert.equal(procesarEmails('col·lectiu@yahoocom').valor, 'collectiu@yahoo.com');
  assert.equal(procesarUrl('http://https://wwwaslong/es/inicio/').valor, 'https://www.asl.ong/es/inicio/');
  assert.equal(procesarUrl('http://wwwfundacionimagoorgco').valor, 'http://www.fundacionimago.org.co');
  assert.equal(procesarUrl('http://wwwfundaciótalibesorg').valor, 'http://www.fundaciotalibes.org');
  assert.equal(procesarUrl('http://wwwbadalonacuba').estado, 'conservado', 'sin dominio deducible');
  assert.equal(procesarTelefonos('964398869 - 96439828').valor, '964398869');
});

test('nombres pegados: se restauran los espacios por fronteras seguras', async () => {
  const { separarNombre } = await import('../lib/nombres.mjs');
  assert.equal(separarNombre('FundacióServeiGironídePedagogiaSocial'), 'Fundació Servei Gironí de Pedagogia Social');
  assert.equal(separarNombre('AccióSolidàriadelVallès'), 'Acció Solidària del Vallès');
  assert.equal(separarNombre('AmigosdeTanzania'), 'Amigos de Tanzania');
  assert.equal(separarNombre('Fundacion Verde'), 'Fundacion Verde', 'si ya tiene espacios no se toca');
  assert.equal(separarNombre('AMAZÒNIACAT'), 'AMAZÒNIACAT', 'sin frontera segura no se inventa');
});

test('direcciones pegadas: espacios, tipo de vía separado y coma antes del número', async () => {
  const { normalizarDireccion } = await import('../lib/nombres.mjs');
  const casos = {
    'TravesseradeGràcia,84baixos': 'Travessera de Gràcia, 84 baixos',
    'CarrerCentre10àtic': 'Carrer Centre, 10 àtic',
    'CostaiCuxart,10àtic1a': 'Costa i Cuxart, 10 àtic 1a',
    'AvRasosdePeguera,67baixos1': 'Av Rasos de Peguera, 67 baixos 1',
    'CarrerPirineus,52local7e': 'Carrer Pirineus, 52 local 7e',
    'CarrerJosepAguileraiMartí19': 'Carrer Josep Aguilera i Martí, 19',
    'CarrerLlibertat,47,baixos': 'Carrer Llibertat, 47, baixos',
  };
  for (const [entrada, salida] of Object.entries(casos)) assert.equal(normalizarDireccion(entrada), salida);
  assert.equal(normalizarDireccion('Carrer Major, 5'), 'Carrer Major, 5', 'si ya trae espacios no se toca');
  assert.equal(normalizarDireccion(''), '');
});

test('nombres y direcciones: conectores pegados y apóstrofos', async () => {
  const { separarNombre, normalizarDireccion } = await import('../lib/nombres.mjs');
  assert.equal(separarNombre('AssociacióperlaInserció'), 'Associació per la Inserció');
  assert.equal(separarNombre('AsociaciónparalaAcciónDelDesarrollo'), 'Asociación para la Acción Del Desarrollo');
  assert.equal(separarNombre('CiutadellaNova'), 'Ciutadella Nova', 'no se parten palabras reales');
  assert.equal(normalizarDireccion("PlaçaDel'Església,s/n"), "Plaça de l'Església, s/n");
  assert.equal(normalizarDireccion("Ramblad'Egara,3402n"), "Rambla d'Egara, 3402n");
  assert.equal(normalizarDireccion('CarrerdelsSalvadors,5bis'), 'Carrer dels Salvadors, 5 bis');
});
