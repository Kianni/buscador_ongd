import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { extraerCV, utm30ToLonLat, parseCsv } from '../scripts/valenciana/extractor.mjs';
import { procesarEmails, procesarTelefonos } from '../lib/contacto.mjs';

const prueba = fs.readFileSync(new URL('./fixtures/prueba_cv.csv', import.meta.url), 'utf8');
const { entidades, informe } = extraerCV(prueba);
const porCodigo = codigo => entidades.find(e => e.cod_entidad === codigo);

test('el formato de salida sigue el diagrama Entidad -> Localidad -> Provincia', () => {
  const e = porCodigo('CV:1491');
  assert.deepEqual(Object.keys(e), ['cod_entidad', 'nombre', 'ambito', 'direccion', 'codigo_postal', 'longitud', 'latitud', 'descripcion', 'contacto', 'url', 'en_localidad']);
  assert.deepEqual(e.en_localidad, { codigo: '46250', nombre: 'València', en_provincia: { codigo: '46', nombre: 'València/Valencia' } });
  assert.equal(e.ambito, 'INCLUSION_SOCIAL');
});

test('duplicados idénticos: se conserva uno y se informa', () => {
  assert.equal(entidades.length, 10);
  assert.deepEqual(informe.duplicados.map(d => d.id).sort(), ['1491', '911']);
  assert.ok(informe.duplicados.every(d => d.tipo === 'idéntico'));
});

test('provincia incoherente (Dénia) se repara por el código INE y se informa', () => {
  const e = porCodigo('CV:207');
  assert.equal(e.en_localidad.en_provincia.nombre, 'Alacant/Alicante');
  assert.ok(informe.reparados.some(r => r.id === '207' && r.campo === 'provincia'));
});

test('coma decimal y coordenada vacía recuperada del WKT', () => {
  assert.ok(porCodigo('CV:66').latitud > 38 && porCodigo('CV:66').latitud < 41);
  assert.ok(porCodigo('CV:1645').latitud !== null);
  assert.ok(informe.reparados.some(r => r.id === '1645' && /WKT/.test(r.motivo)));
});

test('coordenada marcador 9999999 queda en null con aviso, sin rechazar el registro', () => {
  const e = porCodigo('CV:364');
  assert.equal(e.longitud, null);
  assert.equal(e.latitud, null);
  assert.ok(informe.avisos.some(a => a.id === '364' && a.campo === 'x_25830/y_25830'));
});

test('el correo marcador zero@gva.es no entra en contacto', () => {
  assert.equal(porCodigo('CV:207').contacto, '966421555');
  assert.equal(informe.marcadores_sin_dato.email_zero_gva, 4);
});

test('conversión UTM -> lon/lat (referencia calculada con pyproj)', () => {
  const { longitud, latitud } = utm30ToLonLat(724558, 4371330);
  assert.ok(Math.abs(longitud - -0.389809) < 2e-6);
  assert.ok(Math.abs(latitud - 39.462275) < 2e-6);
});

test('correos: se repara solo si queda válido; si no, se conserva el original', () => {
  assert.equal(procesarEmails('AJUMTAMENT@VALLDE LAGUAR.ES').valor, 'ajuntament@valldelaguar.es');
  assert.equal(procesarEmails('ALICIA@OLIVA.ES  MP@OLIVA.ES').valor, 'alicia@oliva.es, mp@oliva.es');
  assert.equal(procesarEmails('INFO@VINAROS. ORG').valor, 'info@vinaros.org');
  const truncado = procesarEmails('VIVIENDASUPERVISADA@DOMINIOCORTADODESCONOCIDO');
  assert.equal(truncado.estado, 'conservado');
  assert.equal(truncado.valor, 'VIVIENDASUPERVISADA@DOMINIOCORTADODESCONOCIDO');
});

test('teléfonos: marcador 0, separadores y números incompletos (se conservan)', () => {
  assert.equal(procesarTelefonos('0').estado, 'marcador');
  assert.equal(procesarTelefonos('96 189 90 97').valor, '961899097');
  assert.equal(procesarTelefonos('964360002; 964367054').valor, '964360002, 964367054');
  assert.equal(procesarTelefonos('961366865 676422994').valor, '961366865, 676422994');
  assert.equal(procesarTelefonos('012').valor, '012');
  const parcial = procesarTelefonos('964398869 - 96439828');
  assert.equal(parcial.estado, 'reparado');
  assert.equal(parcial.valor, '964398869');
  assert.equal(procesarTelefonos('96265155').valor, '96265155');
});

test('contacto inválido no se descarta: se conserva el original y se avisa', () => {
  const csv = prueba.split('\n')[0] + '\n' +
    'POINT (700000 4370000),20,1,TIPO,Centro,10,ENT,"C/ X",Entidad Privada,46250,València/Valencia,València,València,PERSONAS MAYORES,PERSONAS MAYORES,1,VIVIENDASUPERVISADA@DOMINIOCORTADODESCONOCIDO,96265155,,700000,4370000\n';
  const r = extraerCV(csv);
  assert.equal(r.entidades[0].contacto, '96265155, VIVIENDASUPERVISADA@DOMINIOCORTADODESCONOCIDO');
  assert.ok(r.informe.avisos.some(a => a.campo === 'email' && /conserva el original/.test(a.mensaje)));
});

test('registro con campos obligatorios inválidos se rechaza e informa', () => {
  const csv = prueba.split('\n')[0] + '\n' +
    'POINT (1 1),9,1,TIPO,,100,ENT,"C/ X",Entidad Privada,46250,València/Valencia,València,València,PERSONAS MAYORES,PERSONAS MAYORES,1,,,,700000,4370000\n' +
    'POINT (1 1),10,1,TIPO,Centro,100,ENT,"C/ X",Entidad Privada,99999,València/Valencia,València,València,PERSONAS MAYORES,PERSONAS MAYORES,1,,,,700000,4370000\n' +
    'POINT (1 1),11,1,TIPO,Centro,100,ENT,"C/ X",Entidad Privada,46250,València/Valencia,València,Alcoi,PERSONAS MAYORES,PERSONAS MAYORES,1,,,,700000,4370000\n';
  const r = extraerCV(csv);
  assert.equal(r.entidades.length, 0);
  assert.deepEqual(r.informe.rechazados.map(x => x.campo), ['nombre', 'cod_ine_mun', 'municipio']);
});

test('CSV sin columnas obligatorias lanza un error claro', () => {
  assert.throws(() => extraerCV('a,b\n1,2\n'), /Faltan columnas obligatorias/);
});

test('el CSV completo se procesa entero y todo cod_entidad es único', () => {
  const ruta = new URL('../data/entidades_CV.csv', import.meta.url);
  if (!fs.existsSync(ruta)) return;
  const r = extraerCV(fs.readFileSync(ruta, 'utf8'));
  assert.equal(r.informe.resumen.leidos, 1697);
  assert.equal(new Set(r.entidades.map(e => e.cod_entidad)).size, r.entidades.length);
  assert.ok(r.entidades.every(e => e.longitud === null || (e.longitud > -1.6 && e.longitud < 0.7 && e.latitud > 37.8 && e.latitud < 40.9)));
});

test('parseCsv admite comillas, comas y saltos de línea dentro de campos', () => {
  assert.deepEqual(parseCsv('a,b\n"x, ""y""","l1\nl2"\n'), [['a', 'b'], ['x, "y"', 'l1\nl2']]);
});

test('correos separados por barra se separan', () => {
  assert.equal(procesarEmails('administracion@avapace.org/contabilidad@avapace.org').valor, 'administracion@avapace.org, contabilidad@avapace.org');
});

test('correos CV: tildes, ,com, .com que falta, .e, apóstrofo y 2 por @', () => {
  assert.equal(procesarEmails('REGISTRO@AIGÜES.ES').valor, 'registro@aigues.es');
  assert.equal(procesarEmails('buendiaresidencia@hotmail,com').valor, 'buendiaresidencia@hotmail.com');
  assert.equal(procesarEmails('C_O_JOSEALCAMI@HOTMAIL').valor, 'c_o_josealcami@hotmail.com');
  assert.equal(procesarEmails('ACLIENTE.NOVAIRESANVICENTE@SARQUAVITAE.E').valor, 'acliente.novairesanvicente@sarquavitae.es');
  assert.equal(procesarEmails("CENTRODEMAYORES@SANTJOAND'ALACANT.ES").valor, 'centrodemayores@santjoandalacant.es');
  assert.equal(procesarEmails('DIRECCION2FUNDACIONSALUDINFANTIL.ORG').valor, 'direccion@fundacionsaludinfantil.org');
});

test('duplicados: el informe indica qué se duplica (fila original y nombre) y los posibles con otro id', () => {
  const r = extraerCV(prueba);
  assert.deepEqual(r.informe.duplicados.map(d => [d.fila, d.fila_original, d.id]), [[6, 1, '1491'], [11, 7, '911']]);
  assert.ok(r.informe.duplicados.every(d => d.nombre));
  const csv = prueba.split('\n')[0] + '\n' +
    'POINT (700000 4370000),20,1,TIPO,Centro,10,ENT,"C/ X",Entidad Privada,46250,València/Valencia,València,València,PERSONAS MAYORES,PERSONAS MAYORES,1,,,,700000,4370000\n' +
    'POINT (700000 4370000),21,2,TIPO,Centro,10,ENT,"C/ X",Entidad Privada,46250,València/Valencia,València,València,PERSONAS MAYORES,PERSONAS MAYORES,1,,,,700000,4370000\n';
  const p = extraerCV(csv).informe.posibles_duplicados;
  assert.equal(p.length, 1);
  assert.equal(p[0].duplica_a, '20');
  assert.equal(p[0].evidencia, 'identica', 'idéntico salvo el id: probable fila repetida del volcado');
  const otro = extraerCV(csv.replace('PERSONAS MAYORES,PERSONAS MAYORES,1,,,,700000,4370000\n', 'DISCAPACIDAD,DISCAPACIDAD,1,,,,700000,4370000\n').replace(/\n$/, '\n')).informe.posibles_duplicados;
  assert.ok(otro.length <= 1);
});

test('correos CV: dominios conocidos (sin @ y dominio cortado)', () => {
  assert.equal(procesarEmails('RECEPCION.MUCHAMIEL.GRUPOCASAVERDE.COM').valor, 'recepcion.muchamiel@grupocasaverde.com');
  assert.equal(procesarEmails('VIVIENDASUPERVISADA@COMITEANTISIDAVALENC').valor, 'viviendasupervisada@comiteantisidavalencia.org');
  assert.equal(procesarEmails('x@comite').estado, 'conservado', 'prefijo demasiado corto: no se completa');
});

test('erratas conocidas: AJUMTAMENT -> ajuntament en correos y webs', () => {
  const r = procesarEmails('AJUMTAMENT@VALLDE LAGUAR.ES');
  assert.equal(r.valor, 'ajuntament@valldelaguar.es');
  assert.equal(r.estado, 'reparado');
  assert.equal(procesarEmails('ajumtament@oliva.es').valor, 'ajuntament@oliva.es');
  assert.equal(procesarEmails('ajuntament@oliva.es').estado, 'valido');
});

test('lib/correcciones.json: todos los ejemplos documentados se reparan como indican', async () => {
  const { CORRECCIONES, procesarUrl } = await import('../lib/contacto.mjs');
  const { separarNombre, normalizarDireccion } = await import('../lib/nombres.mjs');
  assert.ok(CORRECCIONES.ejemplos.length > 0);
  for (const e of CORRECCIONES.ejemplos) {
    const salida = e.tipo === 'url' ? procesarUrl(e.entrada).valor : e.tipo === 'nombre' ? separarNombre(e.entrada) : e.tipo === 'direccion' ? normalizarDireccion(e.entrada) : procesarEmails(e.entrada).valor;
    assert.equal(salida, e.salida, `ejemplo ${e.tipo} "${e.entrada}"`);
  }
});
