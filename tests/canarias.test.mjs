import test from 'node:test';
import assert from 'node:assert/strict';
import fs, { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extraerCAN } from '../scripts/canarias/extractor.mjs';
import { AlmacenMemoria } from '../api/almacen-memoria.mjs';
import { crearServidor } from '../api/server.mjs';
import { exportarEntrega } from '../scripts/exportar-entrega.mjs';

const leer = ruta => fs.readFileSync(new URL(ruta, import.meta.url), 'utf8');

test('Canarias normaliza marcadores, repara contactos y conserva la primera fila duplicada', async () => {
  const { entidades, informe } = await extraerCAN(leer('./fixtures/prueba_can.json'));

  assert.equal(entidades.length, 2);
  assert.equal(entidades[0].cod_entidad, 'CAN:ERE2026CA00001');
  assert.equal(entidades[0].ambito, 'DISCAPACIDAD');
  assert.equal(entidades[0].direccion, 'Calle Mayor, 10');
  assert.equal(entidades[0].contacto, '928414484');
  assert.equal(entidades[0].url, null);
  assert.equal(entidades[1].ambito, null);
  assert.equal(entidades[1].direccion, 'Calle Real, S/n');
  assert.equal(entidades[1].contacto, null);
  assert.equal(entidades[1].url, null);
  assert.equal(informe.resumen.leidos, 5);
  assert.equal(informe.resumen.cargados, 2);
  assert.equal(informe.resumen.rechazados, 1);
  assert.equal(informe.resumen.duplicados, 2);
  assert.deepEqual(informe.duplicados.map(d => d.tipo), ['idéntico', 'conflicto']);
  assert.match(informe.duplicados[1].accion, /Mujer/);
  assert.ok(informe.avisos.some(a => a.campo === 'area_nombre' && /Varios/.test(a.mensaje)));
  assert.ok(informe.rechazados.some(r => r.id === 'ERE2026CA00003' && /municipio/i.test(r.motivo)));
});

test('una fila repetida no sustituye a la primera fila rechazada', async () => {
  const filas = JSON.parse(leer('./fixtures/prueba_can.json'));
  filas.push({
    ...filas[4],
    direccion_provincia_id: '35',
    direccion_provincia_nombre: 'Las Palmas',
    direccion_municipio_nombre: 'Localidad recuperada',
  });
  const { entidades, informe } = await extraerCAN(JSON.stringify(filas));

  assert.equal(entidades.some(e => e.cod_entidad === 'CAN:ERE2026CA00003'), false);
  assert.equal(informe.duplicados.at(-1).fila_original, 5);
  assert.equal(informe.duplicados.at(-1).fila, 6);
});

test('el fichero canario completo se procesa sin red y no filtra el marcador _U', async () => {
  const texto = fs.readFileSync(new URL('../data/datos-abiertos-csv-segundo-trimestre26.json', import.meta.url), 'utf8');
  const { entidades, informe } = await extraerCAN(texto);

  assert.equal(informe.resumen.leidos, 810);
  assert.equal(informe.resumen.duplicados, 61);
  assert.equal(informe.resumen.rechazados, 8);
  assert.equal(entidades.length, 741);
  assert.equal(JSON.stringify(entidades).includes('_U'), false);
  assert.ok(entidades.every(e => !Object.values(e).includes('_U')));
  assert.ok(entidades.every(e => !String(e.contacto).includes('_U') && !String(e.url).includes('_U')));
});

test('la API carga Canarias en memoria y deja los datos duraderos intactos', async () => {
  const almacen = new AlmacenMemoria();
  const dirDatos = fileURLToPath(new URL('../data/', import.meta.url));
  const servidor = crearServidor({ dirDatos, maxBytes: 10 * 1024 * 1024 }, almacen);
  await new Promise(resolve => servidor.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${servidor.address().port}`;

  try {
    const fuentes = await fetch(`${base}/api/fuentes`).then(r => r.json());
    const canarias = fuentes.find(f => f.id === 'CAN');
    assert.equal(canarias.disponible, true);
    assert.equal(canarias.hayArchivoPorDefecto, true);

    const respuesta = await fetch(`${base}/api/carga`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fuentes: [{
          fuente: 'CAN',
          contenido: leer('../data/datos-abiertos-csv-segundo-trimestre26.json'),
        }],
      }),
    });
    const resultado = await respuesta.json();
    assert.equal(respuesta.status, 200);
    assert.equal(resultado.resultados[0].estado, 'cargada');
    assert.equal(resultado.estado.totales.entidades, 741);
    assert.equal(resultado.estado.fuentes[0].fuente, 'CAN');
  } finally {
    await new Promise((resolve, reject) => servidor.close(error => error ? reject(error) : resolve()));
  }
});

test('exportarEntrega genera los TXT de Canarias desde el informe y los datos', () => {
  const raiz = mkdtempSync(path.join(os.tmpdir(), 'ongd-export-'));
  try {
    const salida = path.join(raiz, 'scripts/canarias/salida');
    mkdirSync(salida, { recursive: true });
    mkdirSync(path.join(raiz, 'entrega1'));
    writeFileSync(path.join(salida, 'entidades_CAN.json'), JSON.stringify([{
      cod_entidad: 'CAN:1', nombre: 'Entidad', ambito: null, direccion: null,
      codigo_postal: null, longitud: null, latitud: null, descripcion: null,
      contacto: null, url: null,
      en_localidad: { codigo: '28001', nombre: 'Madrid', en_provincia: { codigo: '28', nombre: 'Madrid' } },
    }]));
    writeFileSync(path.join(salida, 'entidades_CAN.informe.json'), JSON.stringify({
      resumen: { leidos: 1, cargados: 1, rechazados: 0, duplicados: 0 },
      reparados: [], rechazados: [], duplicados: [], avisos: [],
      marcadores_sin_dato: {}, sin_dato_en_origen: {},
    }));

    const archivos = exportarEntrega('CAN', { raiz });
    assert.ok(fs.readFileSync(archivos.datos, 'utf8').includes('CAN:1\tEntidad'));
    const informe = fs.readFileSync(archivos.informe, 'utf8');
    assert.match(informe, /Resumen:/);
    assert.match(informe, /Registros Duplicados:/);
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
});
