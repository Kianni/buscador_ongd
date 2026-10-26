import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { adaptCsv, parseCsv } from '../mvp/adapters/csv.js';
import { adaptJson } from '../mvp/adapters/json.js';
import { AMBITOS, validateBatch } from '../mvp/schema.js';

test('CSV and JSON: five records, three fields, common contract and leading zeros', async () => {
  for (const [extension, adapter] of [['csv', adaptCsv], ['json', adaptJson]]) {
    const text = await readFile(new URL(`../data/mvp_data/entidades.${extension}`, import.meta.url), 'utf8');
    const { source, entities } = adapter(text);
    assert.equal(source.length, 5); assert.equal(entities.length, 5);
    for (const row of source) assert.equal(Object.keys(row).length, 3);
    for (const row of entities) {
      assert.deepEqual(Object.keys(row), ['cod_entidad', 'nombre', 'ambito']);
      assert.ok(AMBITOS.includes(row.ambito));
    }
    assert.match(entities[0].cod_entidad, /:001$/);
  }
});
test('CSV handles BOM, CRLF, commas, escaped quotes and multiline fields', () => {
  const result = adaptCsv('\uFEFFni_centro,nombre,sector\r\n001,"Centro, ""Sol""",PERSONAS MAYORES\r\n');
  assert.equal(result.entities[0].nombre, 'Centro, "Sol"');
  assert.equal(result.entities[0].ambito, 'MAYORES');
  assert.equal(parseCsv('a,b\n"uno\ndos",tres')[0].a, 'uno\ndos');
});
test('Invalid files expose stable error identifiers before import', () => {
  assert.throws(() => adaptCsv('ni_centro,nombre,sector\n1,"broken,MUJERES'), { key: 'csvUnclosed' });
  assert.throws(() => parseCsv('a,b\n1,2,3'), { key: 'csvColumns' });
  assert.throws(() => parseCsv('a,a\n1,2'), { key: 'csvUniqueHeaders' });
  assert.throws(() => adaptJson('{}'), { key: 'expectedList' });
  assert.throws(() => adaptJson('[]'), { key: 'emptyFile' });
  assert.throws(() => adaptJson('[{"numero_registro":"1"}]'), { key: 'missingField' });
  assert.throws(() => adaptJson('[{"numero_registro":"1","denominacion":"Test","area_nombre":"Unknown"}]'), { key: 'unknownCategory' });
  assert.throws(() => adaptJson('[{"numero_registro":1,"denominacion":"Test","area_nombre":null}]'), { key: 'invalidId' });
});
test('Empty categories are allowed; duplicate codes within a file are rejected', () => {
  const { entities } = adaptCsv('ni_centro,nombre,sector\n001,Centro,');
  assert.equal(entities[0].ambito, null);
  assert.throws(() => validateBatch([...entities, ...entities]), { key: 'duplicateCode' });
});
