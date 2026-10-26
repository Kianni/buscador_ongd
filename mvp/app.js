import { adaptCsv, csvConfig } from './adapters/csv.js';
import { adaptJson, jsonConfig } from './adapters/json.js';
import { adaptXml, xmlConfig } from './adapters/xml.js';
import { AMBITOS, normalize, validateBatch } from './schema.js';
import { LANGUAGES, LANGUAGE_STORAGE_KEY, categoryLabels, translate, resolveLanguage, LocalizedError } from './i18n.js';

const $ = id => document.getElementById(id);
const adapters = { csv: { run: adaptCsv, config: csvConfig }, json: { run: adaptJson, config: jsonConfig }, xml: { run: adaptXml, config: xmlConfig } };
const STORAGE_KEY = 'ongd-mvp-catalog-v1';
let savedLanguage;
try { savedLanguage = localStorage.getItem(LANGUAGE_STORAGE_KEY); } catch { /* Language switching also works without storage. */ }
let language = resolveLanguage(savedLanguage, navigator.languages ?? [navigator.language]);
let records = [], pending = null, previewFilename = '', busy = false, operation = 0;
let currentStatus = { key: 'ready', params: {}, error: false };
const t = (key, params = {}) => translate(language, key, params);
const categoryLabel = (ambito, locale = language) => categoryLabels[locale][AMBITOS.indexOf(ambito)] ?? translate(locale, 'unspecified');

function renderStatus() {
  $('status').textContent = t(currentStatus.key, currentStatus.params);
  $('status').classList.toggle('error', currentStatus.error);
}

function status(key, params = {}, error = false) {
  currentStatus = { key, params, error };
  renderStatus();
}

function showError(error) {
  status(error instanceof LocalizedError ? error.key : 'unexpectedError', error.params ?? {}, true);
}

function save(next) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); }
  catch { status('saveFailed', {}, true); return false; }
  records = next;
  render();
  return true;
}

function renderPreviewLabels() {
  $('preview-count').textContent = t('recordCount', { count: pending?.length ?? 0 });
  $('filename').textContent = previewFilename || t('noFile');
  if (!pending) {
    $('source-preview').textContent = t('sourceEmpty');
    $('output-preview').textContent = t('outputEmpty');
  }
}

function resetPreview() {
  pending = null;
  previewFilename = '';
  $('import').disabled = true;
  renderPreviewLabels();
}

function showMapping() {
  const format = $('format').value;
  $('load-example').textContent = t('loadExample', { format: format.toUpperCase() });
  $('mapping').replaceChildren();
  adapters[format].config.fields.forEach((source, index) => {
    const row = document.createElement('div'); row.className = 'mapping-row';
    for (const value of [source, '→', ['cod_entidad', 'nombre', 'ambito'][index]]) {
      const span = document.createElement('span'); span.textContent = value; row.append(span);
    }
    $('mapping').append(row);
  });
}

function preview(text, format, filename) {
  resetPreview();
  $('format').value = format;
  showMapping();
  const result = adapters[format].run(text);
  pending = result.entities;
  previewFilename = filename;
  $('source-preview').textContent = JSON.stringify(result.source, null, 2);
  $('output-preview').textContent = JSON.stringify(pending, null, 2);
  renderPreviewLabels();
  $('import').disabled = false;
  status('previewReady', { count: pending.length });
}

function merge(existing, incoming) {
  return [...new Map([...existing, ...incoming].map(row => [row.cod_entidad, row])).values()];
}

function render() {
  const query = normalize($('search').value);
  const category = $('category').value;
  const filtered = records.filter(row => (!category || row.ambito === category) &&
    normalize([row.cod_entidad, row.nombre, row.ambito, ...LANGUAGES.map(locale => categoryLabel(row.ambito, locale))].join(' ')).includes(query));
  $('records').replaceChildren();
  if (!filtered.length) {
    const tr = document.createElement('tr'), td = document.createElement('td');
    td.colSpan = 3; td.className = 'empty';
    td.textContent = t(records.length ? 'noResults' : 'emptyDirectory');
    tr.append(td); $('records').append(tr);
  }
  for (const row of filtered) {
    const tr = document.createElement('tr');
    for (const value of [row.cod_entidad, row.nombre]) {
      const td = document.createElement('td'); td.textContent = value; tr.append(td);
    }
    const td = document.createElement('td');
    const label = document.createElement('span'); label.className = 'category-label'; label.textContent = categoryLabel(row.ambito);
    const code = document.createElement('span'); code.className = 'category-code'; code.textContent = row.ambito ?? 'null';
    td.append(label, code); tr.append(td); $('records').append(tr);
  }
  $('total').textContent = records.length;
  $('results-count').textContent = t('resultsCount', { shown: filtered.length, total: records.length });
  $('export').disabled = $('clear').disabled = records.length === 0;
}

function renderLanguage() {
  document.documentElement.lang = language;
  document.title = t('title');
  document.querySelector('meta[name="description"]').content = t('description');
  $('language').value = language;
  for (const element of document.querySelectorAll('[data-i18n]')) element.textContent = t(element.dataset.i18n);
  for (const element of document.querySelectorAll('[data-i18n-placeholder]')) element.placeholder = t(element.dataset.i18nPlaceholder);
  const selectedCategory = $('category').value;
  $('category').replaceChildren();
  const all = document.createElement('option'); all.value = ''; all.textContent = t('allCategories'); $('category').append(all);
  for (const ambito of AMBITOS) {
    const option = document.createElement('option'); option.value = ambito; option.textContent = categoryLabel(ambito); $('category').append(option);
  }
  $('category').value = selectedCategory;
  showMapping(); renderPreviewLabels(); renderStatus(); render();
}

async function readFile(file) {
  if (!file || busy) return;
  const current = ++operation;
  resetPreview();
  try {
    const format = file.name.split('.').pop().toLowerCase();
    if (!Object.hasOwn(adapters, format)) throw new LocalizedError('invalidFileType');
    if (file.size > 2 * 1024 * 1024) throw new LocalizedError('fileTooLarge');
    const buffer = await file.arrayBuffer();
    let text;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(buffer); }
    catch { throw new LocalizedError('fileEncoding'); }
    if (current !== operation) return;
    preview(text, format, file.name);
  } catch (error) { if (current === operation) showError(error); }
}

async function example(format) {
  let response;
  try { response = await fetch(`/data/mvp_data/entidades.${format}`); }
  catch { throw new LocalizedError('exampleNetwork'); }
  if (!response.ok) throw new LocalizedError('exampleHttp', { format: format.toUpperCase(), status: response.status });
  return response.text();
}

async function loadExample() {
  const current = ++operation, format = $('format').value;
  resetPreview();
  try {
    const text = await example(format);
    if (current === operation) preview(text, format, `entidades.${format}`);
  } catch (error) { if (current === operation) showError(error); }
}

$('language').addEventListener('change', () => {
  language = $('language').value;
  try { localStorage.setItem(LANGUAGE_STORAGE_KEY, language); } catch { /* The selected language still applies to this session. */ }
  renderLanguage();
});
$('format').addEventListener('change', () => { operation++; resetPreview(); showMapping(); });
$('file').addEventListener('change', event => { readFile(event.target.files[0]); event.target.value = ''; });
$('load-example').addEventListener('click', loadExample);
$('dropzone').addEventListener('dragover', event => { event.preventDefault(); $('dropzone').classList.add('dragging'); });
$('dropzone').addEventListener('dragleave', () => $('dropzone').classList.remove('dragging'));
$('dropzone').addEventListener('drop', event => {
  event.preventDefault(); $('dropzone').classList.remove('dragging');
  if (event.dataTransfer.files.length !== 1) { status('oneFileOnly', {}, true); return; }
  readFile(event.dataTransfer.files[0]);
});
$('import').addEventListener('click', () => {
  if (!pending) return;
  const next = merge(records, pending), added = next.length - records.length;
  if (save(next)) status('importDone', { added, updated: pending.length - added, total: records.length });
});
$('load-all').addEventListener('click', async () => {
  if (busy) return;
  busy = true; operation++; resetPreview();
  const controls = ['load-all', 'load-example', 'format', 'file'];
  controls.forEach(id => { $(id).disabled = true; });
  try {
    const texts = await Promise.all(['csv', 'xml', 'json'].map(example));
    const batches = texts.map((text, index) => adapters[['csv', 'xml', 'json'][index]].run(text));
    const all = validateBatch(batches.flatMap(batch => batch.entities));
    preview(texts[0], 'csv', 'entidades.csv');
    if (save(merge(records, all))) status('examplesDone', { count: all.length });
  } catch (error) { showError(error); }
  finally { busy = false; controls.forEach(id => { $(id).disabled = false; }); }
});
$('search').addEventListener('input', render);
$('category').addEventListener('change', render);
$('clear').addEventListener('click', () => { if (save([])) status('cleared'); });
$('export').addEventListener('click', () => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(records, null, 2)], { type: 'application/json;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = 'entidades_global_mvp.json'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
try {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) throw new LocalizedError('expectedList');
    records = parsed.length ? validateBatch(parsed) : [];
  }
} catch { status('storedInvalid', {}, true); }
renderLanguage();
