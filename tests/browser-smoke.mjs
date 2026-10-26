// Optional integration test: start npm.cmd start before running this script.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const browser = process.env.BROWSER_PATH || [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
].find(existsSync);
if (!browser) throw new Error('Set BROWSER_PATH to a Chrome/Edge executable.');
const base = `http://localhost:${process.env.PORT || 3000}`;
assert.equal((await fetch(base)).status, 200);
assert.equal((await fetch(`${base}/data/global_schema.py`)).status, 404);
assert.equal((await fetch(`${base}/mvp/%2e%2e%2fREADME.md`)).status, 404);

const profile = path.resolve('.browser-test', `profile-${Date.now()}`);
mkdirSync(profile, { recursive: true });
const debugPort = 19227;
const child = spawn(browser, ['--headless=new', '--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore', windowsHide: true });
let socket;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn, message) {
  const deadline = Date.now() + 12000;
  while (Date.now() < deadline) {
    const result = await fn();
    if (result) return result;
    await delay(100);
  }
  throw new Error(`Timeout: ${message}`);
}
try {
  const pages = await until(async () => {
    try { const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`); const list = await response.json(); return list.length ? list : null; }
    catch { return null; }
  }, 'browser start');
  socket = new WebSocket(pages.find(page => page.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  let id = 0;
  const requests = new Map(), exceptions = [];
  socket.addEventListener('message', event => {
    const data = JSON.parse(event.data);
    if (data.method === 'Runtime.exceptionThrown') exceptions.push(data.params.exceptionDetails);
    const pending = requests.get(data.id);
    if (pending) { requests.delete(data.id); clearTimeout(pending.timer); data.error ? pending.reject(new Error(JSON.stringify(data.error))) : pending.resolve(data.result); }
  });
  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const current = ++id;
      const timer = setTimeout(() => { requests.delete(current); reject(new Error(`CDP timeout: ${method}`)); }, 12000);
      requests.set(current, { resolve, reject, timer }); socket.send(JSON.stringify({ id: current, method, params }));
    });
  }
  async function evaluate(expression) {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  }
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: base });
  await until(() => evaluate("document.getElementById('results-count')?.textContent.length > 0"), 'app ready');
  await evaluate("document.getElementById('load-example').click()");
  await until(() => evaluate("!document.getElementById('import').disabled"), 'CSV preview');
  assert.equal(await evaluate("JSON.parse(document.getElementById('output-preview').textContent).length"), 5);
  await evaluate("document.getElementById('import').click()");
  assert.equal(await evaluate("document.getElementById('total').textContent"), '5');
  await evaluate("document.getElementById('load-all').click()");
  await until(() => evaluate("document.getElementById('total').textContent === '15' && !document.getElementById('load-all').disabled"), 'three adapters');
  await evaluate("document.getElementById('load-all').click()");
  await until(() => evaluate("!document.getElementById('load-all').disabled"), 'reimport');
  assert.equal(await evaluate("document.getElementById('total').textContent"), '15');
  const originalPreview = await evaluate("document.getElementById('output-preview').textContent");
  const originalCatalog = await evaluate("localStorage.getItem('ongd-mvp-catalog-v1')");
  const expected = {
    es: { heading: 'Tres formatos. Un esquema.', search: 'Nombre, código o categoría…', category: 'Personas mayores', status: 'Tres ejemplos', title: 'ONGD · Importación de datos' },
    en: { heading: 'Three formats. One schema.', search: 'Name, code or category…', category: 'Older people', status: 'Three examples', title: 'ONGD · Data import' },
    ru: { heading: 'Три формата. Одна схема.', search: 'Название, код или категория…', category: 'Пожилые люди', status: 'Три примера', title: 'ONGD · Импорт данных' },
  };
  for (const [language, translation] of Object.entries(expected)) {
    await evaluate(`document.getElementById('language').value=${JSON.stringify(language)}; document.getElementById('language').dispatchEvent(new Event('change'))`);
    assert.equal(await evaluate('document.documentElement.lang'), language);
    assert.equal(await evaluate('document.title'), translation.title);
    assert.equal(await evaluate("document.querySelector('h1').textContent"), translation.heading);
    assert.equal(await evaluate("document.getElementById('search').placeholder"), translation.search);
    assert.equal(await evaluate("document.querySelector('.category-label').textContent"), translation.category);
    assert.ok((await evaluate("document.getElementById('status').textContent")).startsWith(translation.status));
    assert.equal(await evaluate("document.getElementById('output-preview').textContent"), originalPreview);
    assert.equal(await evaluate("localStorage.getItem('ongd-mvp-catalog-v1')"), originalCatalog);
    const labelsCorrect = await evaluate(`(async () => {
      const {translate} = await import('/mvp/i18n.js');
      return [...document.querySelectorAll('[data-i18n]')].every(element => element.textContent === translate(document.documentElement.lang, element.dataset.i18n));
    })()`);
    assert.ok(labelsCorrect, `${language} static labels`);
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    assert.ok(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'), `${language} mobile overflow`);
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
  }
  await evaluate("document.getElementById('search').value='mayores'; document.getElementById('search').dispatchEvent(new Event('input')); document.getElementById('category').value='MAYORES'; document.getElementById('category').dispatchEvent(new Event('change'))");
  await evaluate("document.getElementById('language').value='es'; document.getElementById('language').dispatchEvent(new Event('change'))");
  assert.equal(await evaluate("document.getElementById('search').value"), 'mayores');
  assert.equal(await evaluate("document.getElementById('category').value"), 'MAYORES');
  assert.equal(await evaluate("document.getElementById('records').children.length"), 2);
  await evaluate("document.getElementById('search').value=''; document.getElementById('category').value=''; document.getElementById('search').dispatchEvent(new Event('input'))");
  await evaluate(`(() => {
    const input = document.getElementById('file');
    const transfer = new DataTransfer(); transfer.items.add(new File(['{broken'], 'broken.json', {type:'application/json'}));
    input.files = transfer.files; input.dispatchEvent(new Event('change'));
  })()`);
  await until(() => evaluate("document.getElementById('status').classList.contains('error')"), 'localized file error');
  for (const [language, fragment] of [['en', 'invalid syntax'], ['ru', 'неверный синтаксис'], ['es', 'sintaxis no válida']]) {
    await evaluate(`document.getElementById('language').value=${JSON.stringify(language)}; document.getElementById('language').dispatchEvent(new Event('change'))`);
    assert.ok((await evaluate("document.getElementById('status').textContent")).includes(fragment));
    assert.equal(await evaluate("document.getElementById('total').textContent"), '15');
  }
  const xmlResult = await evaluate(`(async () => {
    const {adaptXml} = await import('/mvp/adapters/xml.js');
    const result = adaptXml(await (await fetch('/data/mvp_data/entidades.xml')).text());
    let rejected = 0;
    for (const input of ['<broken>', '<wrong/>', '<!DOCTYPE x><registre_ongd/>', '<registre_ongd><entitat><n_mero_registre>1</n_mero_registre></entitat></registre_ongd>']) {
      try { adaptXml(input); } catch { rejected++; }
    }
    return {count:result.entities.length, fields:Object.keys(result.source[0]), first:result.entities[0], rejected};
  })()`);
  assert.equal(xmlResult.count, 5); assert.equal(xmlResult.fields.length, 3);
  assert.equal(xmlResult.first.cod_entidad, 'CAT:001'); assert.equal(xmlResult.first.ambito, 'EDUCACION_Y_FORMACION'); assert.equal(xmlResult.rejected, 4);
  await evaluate("document.getElementById('search').value='Atlantico'; document.getElementById('search').dispatchEvent(new Event('input'))");
  assert.equal(await evaluate("document.getElementById('records').children.length"), 1);
  assert.match(await evaluate("document.getElementById('records').textContent"), /Atlántico/);
  await evaluate("document.getElementById('search').value=''; document.getElementById('search').dispatchEvent(new Event('input')); document.getElementById('category').value='MAYORES'; document.getElementById('category').dispatchEvent(new Event('change'))");
  assert.equal(await evaluate("document.getElementById('records').children.length"), 2);
  await evaluate("document.getElementById('category').value=''; document.getElementById('category').dispatchEvent(new Event('change'))");
  const documentNode = await send('DOM.getDocument');
  const input = await send('DOM.querySelector', { nodeId: documentNode.root.nodeId, selector: '#file' });
  await send('DOM.setFileInputFiles', { nodeId: input.nodeId, files: [path.resolve('data/mvp_data/entidades.xml')] });
  await until(() => evaluate("document.getElementById('filename').textContent === 'entidades.xml'"), 'XML file upload');
  await evaluate("document.getElementById('import').click()");
  assert.equal(await evaluate("document.getElementById('total').textContent"), '15');
  await send('Page.reload');
  await until(() => evaluate("document.getElementById('total')?.textContent === '15'"), 'persisted catalog');
  assert.equal(await evaluate('document.documentElement.lang'), 'es');
  assert.equal(await evaluate("document.getElementById('language').value"), 'es');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  assert.ok(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'), 'mobile overflow');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
  await evaluate("document.getElementById('load-all').click()");
  await until(() => evaluate("!document.getElementById('load-all').disabled"), 'final preview');
  const screenshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  writeFileSync('.browser-test/mvp.png', Buffer.from(screenshot.data, 'base64'));
  assert.equal(exceptions.length, 0, JSON.stringify(exceptions));
  await evaluate("document.getElementById('clear').click()");
  assert.equal(await evaluate("document.getElementById('total').textContent"), '0');
  console.log('PASS: CSV/XML/JSON, 15 records, reimport, real XML upload, search, filters, ES/EN/RU labels and errors, language persistence, preserved preview and data, mobile layout, clear, no browser exceptions.');
  await send('Browser.close');
} finally { socket?.close(); child.kill(); }
