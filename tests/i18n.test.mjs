import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { LANGUAGES, messages, categoryLabels, translate, resolveLanguage, LocalizedError } from '../mvp/i18n.js';
import { AMBITOS } from '../mvp/schema.js';
import { adaptJson } from '../mvp/adapters/json.js';

test('All languages cover the same messages, placeholders and categories', () => {
  const keys = Object.keys(messages.en).sort();
  const placeholders = text => [...text.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();
  for (const language of LANGUAGES) {
    assert.deepEqual(Object.keys(messages[language]).sort(), keys);
    assert.equal(categoryLabels[language].length, AMBITOS.length);
    for (const key of keys) {
      assert.ok(messages[language][key].trim());
      assert.deepEqual(placeholders(messages[language][key]), placeholders(messages.en[key]), `${language}.${key}`);
    }
  }
});

test('Saved language takes priority; browser locales and unsupported languages resolve safely', () => {
  assert.equal(resolveLanguage('es', ['en-US']), 'es');
  assert.equal(resolveLanguage(null, ['de-DE', 'en-GB']), 'en');
  assert.equal(resolveLanguage('unknown', ['es-ES']), 'es');
  assert.equal(resolveLanguage(null, ['ru-RU']), 'ru');
  assert.equal(resolveLanguage(null, ['fi-FI']), 'ru');
});

test('Adapter errors can be translated without rerunning a failed import', () => {
  let error;
  try { adaptJson('[{"numero_registro":"001"}]'); } catch (caught) { error = caught; }
  assert.ok(error instanceof LocalizedError);
  assert.equal(error.key, 'missingField');
  assert.deepEqual(error.params, { record: 1, field: 'denominacion' });
  assert.equal(translate('en', error.key, error.params), 'Record 1: missing field denominacion.');
  assert.equal(translate('es', error.key, error.params), 'Registro 1: falta el campo denominacion.');
  assert.equal(translate('ru', error.key, error.params), 'Запись 1: отсутствует поле denominacion.');
});

test('Every declared UI label and application error has a translation', async () => {
  const html = await readFile(new URL('../mvp/index.html', import.meta.url), 'utf8');
  const keys = [...html.matchAll(/data-i18n(?:-placeholder)?="(\w+)"/g)].map(match => match[1]);
  for (const file of ['app.js', 'schema.js', 'adapters/shared.js', 'adapters/csv.js', 'adapters/json.js', 'adapters/xml.js']) {
    const code = await readFile(new URL(`../mvp/${file}`, import.meta.url), 'utf8');
    keys.push(...[...code.matchAll(/\b(?:new LocalizedError|status|t)\('([a-zA-Z]+)'/g)].map(match => match[1]));
  }
  for (const key of keys) for (const language of LANGUAGES) assert.ok(messages[language][key], `${language}.${key}`);
});
