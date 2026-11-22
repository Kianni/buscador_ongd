import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { addCodeEntidad, mapStreetAddress, mapUrl, mapIntoGlobal, groupByRegistration, chooseArea, mapCanariasRecords } from '../scripts/canarias/extractor.mjs';

test('mapStreetAddress omits the _U complement marker', () => {
    const row = {
        direccion_tipo_via: 'Calle',
        direccion_nombre_via: 'Real',
        direccion_numero: '132',
        direccion_complemento: '_U'
    };

    assert.equal(mapStreetAddress(row), 'Calle Real, 132');
});

test('mapStreetAddress trims and preserves a meaningful complement', () => {
    const row = {
        direccion_tipo_via: 'Calle',
        direccion_nombre_via: 'Juan Rejon',
        direccion_numero: '141',
        direccion_complemento: '  3º B '
    };

    assert.equal(mapStreetAddress(row), 'Calle Juan Rejon, 141, 3º B');
});

test('mapStreetAddress omits an empty street type', () => {
    const row = {
        direccion_tipo_via: ' ',
        direccion_nombre_via: 'Real',
        direccion_numero: '132',
        direccion_complemento: 'Bajo'
    };

    assert.equal(mapStreetAddress(row), 'Real, 132, Bajo');
});

test('mapStreetAddress returns null when all address parts are missing', () => {
    assert.equal(mapStreetAddress({}), null);
});

test('mapStreetAddress avoids repeating a street type already in the name', () => {
    const row = {
        direccion_tipo_via: 'CALLE',
        direccion_nombre_via: 'Calle Alcalde Garcia Ramos',
        direccion_numero: '6',
        direccion_complemento: '11 D 2'
    };

    assert.equal(mapStreetAddress(row), 'Calle Alcalde Garcia Ramos, 6, 11 D 2');
});

test('mapStreetAddress omits a house number already at the end of the street name', () => {
    const row = {
        direccion_tipo_via: 'Calle',
        direccion_nombre_via: 'La Gomera 63',
        direccion_numero: '63'
    };

    assert.equal(mapStreetAddress(row), 'Calle La Gomera 63');
});

test('mapStreetAddress keeps a house number that matches only part of the street suffix', () => {
    const row = {
        direccion_tipo_via: 'Calle',
        direccion_nombre_via: 'La Gomera 163',
        direccion_numero: '63'
    };

    assert.equal(mapStreetAddress(row), 'Calle La Gomera 163, 63');
});

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

test('mapCanariasRecords converts _U to null in locality and province fields', () => {
    const rows = [
        {
            numero_registro: '101',
            direccion_municipio_id: '38060',
            direccion_municipio_nombre: 'Arona',
            direccion_provincia_id: '_U',
            direccion_provincia_nombre: '_U'
        },
        {
            numero_registro: '102',
            direccion_municipio_id: '_U',
            direccion_municipio_nombre: '_U',
            direccion_provincia_id: '35',
            direccion_provincia_nombre: 'Las Palmas'
        }
    ];

    const { mappedCanariasRecords } = mapCanariasRecords(rows);

    assert.deepEqual(mappedCanariasRecords.map(record => record.en_localidad), [
        { codigo: '38060', nombre: 'Arona', en_provincia: { codigo: null, nombre: null } },
        { codigo: null, nombre: null, en_provincia: { codigo: '35', nombre: 'Las Palmas' } }
    ]);
});

test('mapCanariasRecords writes pagina_web to url and converts _U to null', () => {
    const rows = [
        { numero_registro: '101', pagina_web: 'https://example.org' },
        { numero_registro: '102', pagina_web: '_U' }
    ];

    const { mappedCanariasRecords } = mapCanariasRecords(rows);

    assert.deepEqual(mappedCanariasRecords.map(record => record.url), [
        'https://example.org',
        null
    ]);
});

for (const [description, input, expected] of [
    ['keeps a website without a scheme', 'www.example.org', 'www.example.org'],
    ['keeps a complete HTTPS URL', 'https://example.org/about', 'https://example.org/about'],
    ['returns null for a missing value', undefined, null],
    ['returns null for a blank value', '   ', null],
    ['rejects an email address', 'info@example.org', null],
    ['rejects a description', 'en migración a nuevo dominio', null],
    ['rejects a single word', 'pendiente', null],
    ['rejects a misspelled scheme', 'hhtps://example.org', null]
]) {
    test(`mapUrl ${description}`, () => {
        assert.equal(mapUrl(input), expected);
    });
}
