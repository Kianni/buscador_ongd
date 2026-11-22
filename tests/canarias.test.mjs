import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { addCodeEntidad, mapIntoGlobal, groupByRegistration, chooseArea, mapCanariasRecords } from '../scripts/canarias/extractor.mjs';

test('addCodeEntidad adds the CAN prefix to the registration number', () => {
    const input = { nif: 'G38640769', numero_registro: 'ERE2003CA00013' };

    assert.equal(addCodeEntidad(input), 'CAN:ERE2003CA00013');
});

test('Voluntariado keeps its area code and reports a mapped subarea', () => {
    const result = mapIntoGlobal({ area_nombre: 'Voluntariado', subarea_nombre: 'Servicios Sociales' });

    assert.equal(result.ambito, 'VOLUNTARIADO_Y_PARTICIPACION_COMUNITARIA');
    assert.match(result.aviso, /SALUD_Y_ATENCION_SOCIOSANITARIA/);
});

test('Voluntariado without a subarea code produces no report entry', () => {
    const result = mapIntoGlobal({ area_nombre: 'Voluntariado', subarea_nombre: 'Protección Civil' });

    assert.deepEqual(result, { ambito: 'VOLUNTARIADO_Y_PARTICIPACION_COMUNITARIA', aviso: null });
});

test('Varios uses the mapped subarea', () => {
    const result = mapIntoGlobal({ area_nombre: 'Varios', subarea_nombre: 'Migración' });

    assert.deepEqual(result, { ambito: 'MIGRACION', aviso: null });
});

test('Varios with a missing subarea returns null', () => {
    const result = mapIntoGlobal({ area_nombre: 'Varios', subarea_nombre: '_U' });

    assert.deepEqual(result, { ambito: null, aviso: null });
});

test('Tercera Edad maps directly to MAYORES', () => {
    const result = mapIntoGlobal({ area_nombre: 'Tercera Edad', subarea_nombre: null });

    assert.deepEqual(result, { ambito: 'MAYORES', aviso: null });
});

test('an area explicitly mapped to null returns null', () => {
    const result = mapIntoGlobal({ area_nombre: 'Centros Ocupacionales' });

    assert.deepEqual(result, { ambito: null, aviso: null });
});

test('an unknown area returns null', () => {
    const result = mapIntoGlobal({ area_nombre: 'Unknown area' });

    assert.deepEqual(result, { ambito: null, aviso: null });
});

test('chooseArea skips unmapped options and returns the first mapped row', () => {
    const options = [
        { area_nombre: 'Varios', subarea_nombre: 'Otros' },
        { area_nombre: 'Tercera Edad', subarea_nombre: '_U' },
        { area_nombre: 'Varios', subarea_nombre: 'Migración' }
    ];

    assert.deepEqual(chooseArea(options), options[1]);
});

test('chooseArea returns the first mapped subarea within Varios', () => {
    const options = [
        { area_nombre: 'Varios', subarea_nombre: 'Otros' },
        { area_nombre: 'Varios', subarea_nombre: 'Migración' },
        { area_nombre: 'Varios', subarea_nombre: 'Asociación De Igualdad Lgtbi' }
    ];

    assert.deepEqual(chooseArea(options), options[1]);
});


test('group full rows by registration even when they share a NIF', () => {
    const data = [
        { nif: 'A', numero_registro: '101', area_nombre: 'Mujer', subarea_nombre: null },
        { nif: 'A', numero_registro: '101', area_nombre: 'Exclusión Social', subarea_nombre: null },
        { nif: 'A', numero_registro: '102', area_nombre: 'Tercera Edad', subarea_nombre: null }
    ];

    const rows = groupByRegistration(data);

    assert.deepEqual(rows.get('101'), [data[0], data[1]]);
    assert.deepEqual(rows.get('102'), [data[2]]);
});

test('each registration keeps its own activity area when the NIF is shared', () => {
    const fixture = new URL('./fixtures/canarias-shared-nif.json', import.meta.url);
    const rows = JSON.parse(readFileSync(fixture, 'utf8'));
    const { mappedCanariasRecords } = mapCanariasRecords(rows);
    const entities = mappedCanariasRecords.map(({ cod_entidad, ambito }) => ({ cod_entidad, ambito }));

    assert.deepEqual(entities, [
        { cod_entidad: 'CAN:ERE2022TF00115', ambito: 'INCLUSION_SOCIAL' },
        { cod_entidad: 'CAN:ERE2024TF00037', ambito: 'DISCAPACIDAD' }
    ]);
});

test('mapCanariasRecords uses the selected source row for both activity area and contact', () => {
    const rows = [
        {
            numero_registro: '101',
            area_nombre: 'Varios',
            subarea_nombre: 'Otros',
            contacto: '922111111'
        },
        {
            numero_registro: '101',
            area_nombre: 'Varios',
            subarea_nombre: 'Migración',
            contacto: '922222222'
        }
    ];

    const { mappedCanariasRecords: entities, journal } = mapCanariasRecords(rows);

    assert.equal(entities.length, 1);
    assert.equal(entities[0].cod_entidad, 'CAN:101');
    assert.equal(entities[0].ambito, 'MIGRACION');
    assert.equal(entities[0].contacto, '922222222');
    assert.deepEqual(journal, [
        {
            numero_registro: '101',
            all_areas: ['Varios/Otros', 'Varios/Migración'],
            chosen: 'Varios/Migración',
            ambito: 'MIGRACION'
        }
    ]);
});
