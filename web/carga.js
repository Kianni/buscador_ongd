// Formulario de carga. Todo el texto que viene de los datos se inserta con textContent (nunca innerHTML).
const $ = id => document.getElementById(id);
const el = (etiqueta, props = {}, ...hijos) => {
  const nodo = Object.assign(document.createElement(etiqueta), props);
  for (const h of hijos.flat()) if (h !== null && h !== undefined) nodo.append(h);
  return nodo;
};

const estado = { fuentes: [], almacen: null, archivos: new Map(), ocupado: false };
const MAX_BYTES = 10 * 1024 * 1024;
const TIPOS = { formato: 'Formato', faltante: 'Faltante', rango: 'Fuera de rango', duplicado: 'Duplicado', semantico: 'Semántico' };
const ETIQUETAS = { cargada: 'Cargada', ya_cargada: 'Ya cargada', no_disponible: 'No disponible', error_datos: 'Error en los datos', error_almacen: 'Error del almacén', desconocida: 'Desconocida' };

async function api(metodo, ruta, cuerpo, cabeceras = {}) {
  const r = await fetch(ruta, { method: metodo, headers: { ...(cuerpo ? { 'Content-Type': 'application/json' } : {}), ...cabeceras }, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
  const datos = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(datos.mensaje ?? `Error ${r.status}`);
  return datos;
}

const cargadas = () => new Set((estado.almacen?.fuentes ?? []).map(f => f.fuente));
const seleccionables = () => estado.fuentes.filter(f => f.disponible && !cargadas().has(f.id));
const marcadas = () => [...document.querySelectorAll('input[name="fuente"]:checked')].map(i => i.value);

function pintarAlmacen() {
  const t = estado.almacen?.totales;
  const nodo = $('almacen');
  const memoria = estado.almacen?.almacen === 'memoria';
  nodo.className = `almacen${memoria ? ' aviso' : ''}`;
  nodo.textContent = `Almacén: ${memoria ? 'en memoria (sin Supabase configurado; se pierde al parar el servidor)' : 'Supabase'} · ` +
    (t ? `${t.entidades} entidades, ${t.localidades} localidades, ${t.provincias} provincias` : 'sin datos');
}

function pintarFuentes() {
  const ya = cargadas();
  const contenedor = $('lista-fuentes');
  const seleccion = new Set(marcadas());
  contenedor.replaceChildren();
  for (const f of estado.fuentes) {
    const usable = f.disponible && !ya.has(f.id);
    const casilla = el('input', { type: 'checkbox', name: 'fuente', value: f.id, disabled: !usable, checked: usable && seleccion.has(f.id) });
    const notas = [];
    if (ya.has(f.id)) notas.push(el('span', { className: 'etiqueta-estado cargada', textContent: 'cargada' }));
    if (!f.disponible) notas.push(el('span', { className: 'etiqueta-estado', textContent: 'no disponible', title: f.motivo ?? '' }));
    contenedor.append(el('div', {},
      el('label', { className: `opcion${usable ? '' : ' desactivada'}` }, casilla, f.nombre, ...notas),
      usable ? filaArchivo(f) : null));
  }
  actualizarBotones();
}

function filaArchivo(f) {
  const entrada = el('input', { type: 'file', accept: f.formato === 'XML' ? '.xml' : f.formato === 'CSV' ? '.csv' : '.json', ariaLabel: `Archivo de ${f.nombre} (opcional)` });
  const limpiar = el('button', { type: 'button', className: 'limpiar', textContent: 'usar el de la carpeta data', hidden: !estado.archivos.has(f.id) });
  entrada.addEventListener('change', () => {
    const archivo = entrada.files[0];
    if (archivo) estado.archivos.set(f.id, archivo); else estado.archivos.delete(f.id);
    limpiar.hidden = !archivo;
    if (archivo) document.querySelector(`input[name="fuente"][value="${f.id}"]`).checked = true;
    actualizarBotones();
  });
  limpiar.addEventListener('click', () => { entrada.value = ''; estado.archivos.delete(f.id); limpiar.hidden = true; });
  const propio = estado.archivos.get(f.id);
  return el('div', { className: 'archivo' },
    el('span', { textContent: propio ? `Archivo: ${propio.name}` : (f.hayArchivoPorDefecto ? `Por defecto: data/${f.archivoPorDefecto}` : 'No hay archivo por defecto; elija uno:') }),
    entrada, limpiar);
}

function actualizarBotones() {
  const n = marcadas().length;
  $('cargar').disabled = n === 0 || estado.ocupado;
  $('borrar').disabled = estado.ocupado;
  const posibles = seleccionables().length;
  $('todas').disabled = posibles === 0;
  $('todas').checked = posibles > 0 && n === posibles;
}

async function refrescar() {
  [estado.fuentes, estado.almacen] = await Promise.all([api('GET', '/api/fuentes'), api('GET', '/api/almacen/estado')]);
  pintarAlmacen(); pintarFuentes();
}

// ---------------------------------------------------------------- resultados

function tabla(columnas, filas, limite = 100) {
  const cuerpo = filas.slice(0, limite).map(f => el('tr', {}, columnas.map(([clave]) => el('td', { textContent: clave === 'categoria' ? (TIPOS[f.categoria] ?? '') : (f[clave] ?? '') }))));
  return el('table', {}, el('thead', {}, el('tr', {}, columnas.map(([, titulo]) => el('th', { textContent: titulo })))), el('tbody', {}, cuerpo),
    filas.length > limite ? el('caption', { className: 'nota', textContent: `Se muestran ${limite} de ${filas.length}. El informe completo se puede descargar.` }) : null);
}

function seccion(titulo, filas, columnas) {
  if (!filas?.length) return null;
  return el('details', {}, el('summary', { textContent: `${titulo} (${filas.length})` }), tabla(columnas, filas));
}

function descargarInforme(r) {
  const blob = new Blob([JSON.stringify(r.informe, null, 2)], { type: 'application/json' });
  const a = el('a', { href: URL.createObjectURL(blob), download: `informe_${r.fuente}.json` });
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function tarjeta(r) {
  const nodo = el('article', { className: 'fuente' },
    el('h3', {}, r.nombre ?? r.fuente, el('span', { className: `estado ${r.estado}`, textContent: ETIQUETAS[r.estado] ?? r.estado })),
    el('p', { className: 'mensaje', textContent: r.mensaje ?? '' }));
  const s = r.resumen;
  if (s) {
    nodo.append(el('p', { className: 'cifras' },
      [['Leídas', s.leidos], ['Cargadas', s.cargados], ['Rechazadas', s.rechazados], ['Duplicadas', s.duplicados], ['Con reparaciones', s.con_reparaciones], ['Con avisos', s.con_avisos]]
        .map(([n, v]) => el('span', {}, `${n}: `, el('b', { textContent: String(v) })))));
    const pc = s.por_categoria;
    if (pc) {
      const filas = Object.entries(TIPOS).map(([k, n]) => ({ tipo: n, ...pc[k] }));
      nodo.append(el('details', {}, el('summary', { textContent: 'Resumen por tipo de error' }),
        tabla([['tipo', 'Tipo de error'], ['rechazados', 'Rechazados'], ['duplicados', 'Duplicados'], ['reparados', 'Reparados'], ['avisos', 'Avisos']], filas)));
    }
    const i = r.informe;
    nodo.append(...[
      seccion('Registros rechazados', i.rechazados, [['fila', 'Fila'], ['id', 'Id'], ['categoria', 'Tipo de error'], ['campo', 'Campo'], ['motivo', 'Motivo']]),
      seccion('Duplicados', i.duplicados, [['fila', 'Fila'], ['id', 'Id'], ['tipo', 'Tipo'], ['accion', 'Acción']]),
      seccion('Datos reparados', i.reparados, [['fila', 'Fila'], ['id', 'Id'], ['categoria', 'Tipo de error'], ['campo', 'Campo'], ['antes', 'Antes'], ['despues', 'Después'], ['motivo', 'Motivo']]),
      seccion('Avisos (se conserva el original)', i.avisos, [['fila', 'Fila'], ['id', 'Id'], ['categoria', 'Tipo de error'], ['campo', 'Campo'], ['mensaje', 'Aviso']])].filter(Boolean));
    nodo.append(el('button', { type: 'button', className: 'descargar', textContent: 'Descargar informe completo (JSON)', onclick: () => descargarInforme(r) }));
  }
  return nodo;
}

function mostrar(...nodos) { $('resultados').replaceChildren(...nodos); }
const mostrarMensaje = (texto, clase = 'vacio') => mostrar(el('p', { className: clase, textContent: texto }));

// ---------------------------------------------------------------- acciones

async function cargar(evento) {
  evento.preventDefault();
  const ids = marcadas();
  if (!ids.length) return;
  estado.ocupado = true; actualizarBotones();
  mostrarMensaje('Cargando…');
  try {
    const fuentes = [];
    for (const id of ids) {
      const archivo = estado.archivos.get(id);
      if (archivo && archivo.size > MAX_BYTES) throw new Error(`"${archivo.name}" supera los 10 MB.`);
      fuentes.push({ fuente: id, ...(archivo ? { contenido: await archivo.text() } : {}) });
    }
    const { resultados, estado: nuevo } = await api('POST', '/api/carga', { fuentes });
    estado.almacen = nuevo;
    estado.archivos.clear();
    mostrar(...resultados.map(tarjeta));
  } catch (e) {
    mostrarMensaje(`No se pudo completar la carga: ${e.message}`, 'mensaje');
  } finally {
    estado.ocupado = false;
    await refrescar().catch(() => {});
  }
}

function cancelar() {
  estado.archivos.clear();
  $('confirmar').hidden = true;
  mostrar(); pintarFuentes();
}

async function borrar() {
  $('confirmar').hidden = true;
  estado.ocupado = true; actualizarBotones();
  try {
    const { borrado } = await api('DELETE', '/api/almacen', undefined, { 'X-Confirmar': 'borrar' });
    mostrarMensaje(`Almacén borrado: ${borrado.entidades} entidades, ${borrado.localidades} localidades y ${borrado.provincias} provincias. Ya puede cargar de nuevo cualquier fuente.`, 'mensaje');
  } catch (e) {
    mostrarMensaje(`No se pudo borrar: ${e.message}`, 'mensaje');
  } finally {
    estado.ocupado = false;
    await refrescar().catch(() => {});
  }
}

$('formulario').addEventListener('submit', cargar);
$('formulario').addEventListener('change', evento => {
  if (evento.target.id === 'todas') for (const f of seleccionables()) document.querySelector(`input[name="fuente"][value="${f.id}"]`).checked = evento.target.checked;
  if (evento.target.name === 'fuente' || evento.target.id === 'todas') actualizarBotones();
});
$('cancelar').addEventListener('click', cancelar);
$('borrar').addEventListener('click', () => { $('confirmar').hidden = false; $('confirmar-no').focus(); });
$('confirmar-no').addEventListener('click', () => { $('confirmar').hidden = true; $('borrar').focus(); });
$('confirmar-si').addEventListener('click', borrar);

mostrar();
$('resultados').append(el('p', { className: 'vacio', textContent: 'Aún no se ha cargado nada en esta sesión.' }));
refrescar().catch(e => mostrarMensaje(`No se pudo conectar con la API: ${e.message}`, 'mensaje'));
