// Normalización de teléfonos, correos y URLs, común a todos los extractores.
//
// Regla del proyecto: reparar SOLO si el resultado queda válido; si no, conservar el original e informar.
// Cada función devuelve { estado, valor, original }:
//   vacio      -> el origen no trae dato                      (valor = null)
//   marcador   -> valor de relleno de la fuente (p. ej. 0)    (valor = null)
//   valido     -> ya era válido                               (valor = texto normalizado)
//   reparado   -> era inválido y la reparación queda válida   (valor = texto reparado)
//   conservado -> no se pudo reparar: se guarda el original   (valor = original sin tocar, solo espacios)

const colapsar = texto => String(texto ?? '').replace(/\s+/g, ' ').trim();

export const EMAIL_VALIDO = /^[A-Za-z0-9._%+'-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;
export const TELEFONO_VALIDO = /^([6-9]\d{8}|012)$/;
const MARCADOR_EMAIL = 'zero@gva.es';
const MARCADOR_TELEFONO = '0';

// Sufijos que se pueden separar con un punto cuando se perdió (gmailcom -> gmail.com).
// Se evitan sufijos de dos letras muy comunes dentro de palabras (de, it, pt, fr).
const SUFIJOS = ['info', 'coop', 'com', 'org', 'net', 'edu', 'gob', 'cat', 'eu', 'es'];

function pegarSufijo(dominio) {
  const bajo = dominio.toLowerCase();
  if (bajo.includes('.')) return null;
  for (const sufijo of SUFIJOS) {
    if (bajo.length - sufijo.length >= 3 && bajo.endsWith(sufijo)) {
      return `${dominio.slice(0, dominio.length - sufijo.length)}.${sufijo}`;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Correos
// ---------------------------------------------------------------------------

// Corrupción conocida de la fuente CAT: la palabra «Carrer» sustituyó a un fragmento del dominio
// (xteCarrercat, edpaCarrercat). No hay forma fiable de recuperarlo: no se repara.
const CORRUPTO = /Carrer/;

function repararCorreo(token) {
  if (CORRUPTO.test(token)) return null;
  const limpio = token.replace(/[.,;:]+$/, '');
  if (EMAIL_VALIDO.test(limpio)) return limpio.toLowerCase();
  const partes = limpio.split('@');
  if (partes.length !== 2) return null;
  const dominio = pegarSufijo(partes[1]);
  const candidato = dominio ? `${partes[0]}@${dominio}` : null;
  return candidato && EMAIL_VALIDO.test(candidato) ? candidato.toLowerCase() : null;
}

export function procesarEmails(bruto) {
  const original = String(bruto ?? '');
  const texto = colapsar(original);
  if (texto === '') return { estado: 'vacio', valor: null, original };
  if (texto.toLowerCase() === MARCADOR_EMAIL) return { estado: 'marcador', valor: null, original };
  const tokens = texto.split(/[\s;,/]+/).filter(Boolean);
  const unir = lista => [...new Set(lista)].join(' | ');

  if (tokens.every(t => EMAIL_VALIDO.test(t))) {
    const valores = tokens.map(t => t.toLowerCase());
    return { estado: tokens.length > 1 ? 'reparado' : 'valido', valor: unir(valores), original };
  }
  if (tokens.length > 1) {
    const unido = tokens.join('');
    if (EMAIL_VALIDO.test(unido)) return { estado: 'reparado', valor: unido.toLowerCase(), original };
  }
  const reparados = tokens.map(repararCorreo);
  if (reparados.every(Boolean)) return { estado: 'reparado', valor: unir(reparados), original };
  return { estado: 'conservado', valor: texto, original };
}

// ---------------------------------------------------------------------------
// Teléfonos
// ---------------------------------------------------------------------------

function numerosDe(texto) {
  // Varios números en un campo: separados por ; / , " - " o por espacios entre grupos de 9 dígitos.
  const salida = [];
  for (const parte of texto.split(/\s*[;/,]\s*|\s+-\s+/).filter(Boolean)) {
    const grupos = parte.trim().split(/\s+/);
    if (grupos.length > 1 && grupos.every(g => /^\d{9}$/.test(g))) salida.push(...grupos);
    else salida.push(parte);
  }
  return salida.map(n => {
    let limpio = n.replace(/[\s.-]/g, '').replace(/^(\+34|0034|\(34\))/, '');
    if (/^34[6-9]\d{8}$/.test(limpio)) limpio = limpio.slice(2);
    return limpio;
  });
}

export function procesarTelefonos(bruto) {
  const original = String(bruto ?? '');
  const texto = colapsar(original);
  if (texto === '') return { estado: 'vacio', valor: null, original };
  if (texto === MARCADOR_TELEFONO) return { estado: 'marcador', valor: null, original };
  const numeros = numerosDe(texto);
  if (numeros.length && numeros.every(n => TELEFONO_VALIDO.test(n))) {
    const valor = [...new Set(numeros)].join(' | ');
    return { estado: valor === texto ? 'valido' : 'reparado', valor, original };
  }
  return { estado: 'conservado', valor: texto, original };
}

// ---------------------------------------------------------------------------
// URLs
// ---------------------------------------------------------------------------

export const URL_VALIDA = /^https?:\/\/(?:[a-z0-9-]+\.)+[a-z]{2,}(?::\d+)?(?:[/?#]\S*)?$/i;

function repararUrl(texto) {
  if (CORRUPTO.test(texto)) return null;
  let url = texto.replace(/^(?:https?:\/\/)+/i, m => m.slice(m.toLowerCase().lastIndexOf('http')));
  if (!/^https?:\/\//i.test(url)) url = `http://${url}`;
  const m = /^(https?:\/\/)([^/?#:\s]+)(.*)$/i.exec(url);
  if (!m) return null;
  let host = m[2].toLowerCase();
  const conPunto = pegarSufijo(host.replace(/^www(?=[a-z0-9])/, 'www.'));
  if (!host.includes('.') || /^www[a-z0-9]/.test(host)) {
    host = host.replace(/^www(?=[a-z0-9])/, 'www.');
    const resto = host.replace(/^www\./, '');
    const pegado = pegarSufijo(resto);
    if (pegado) host = host.startsWith('www.') ? `www.${pegado}` : pegado;
    else if (conPunto) host = conPunto;
  }
  const candidato = `${m[1].toLowerCase()}${host}${m[3]}`;
  // Tras quitar «www.» debe quedar un dominio con punto (www.aslong no es válido).
  return URL_VALIDA.test(candidato) && host.replace(/^www\./, '').includes('.') ? candidato : null;
}

export function procesarUrl(bruto) {
  const original = String(bruto ?? '');
  const texto = colapsar(original);
  if (texto === '') return { estado: 'vacio', valor: null, original };
  if (URL_VALIDA.test(texto) && /^https?:\/\/(www\.)?[^/?#]*\./i.test(texto.replace(/^(https?:\/\/)www\./i, '$1')) && !/xn--/i.test(texto)) return { estado: 'valido', valor: texto, original };
  const reparada = /\s/.test(texto) ? null : repararUrl(texto);
  return reparada ? { estado: 'reparado', valor: reparada, original } : { estado: 'conservado', valor: texto, original };
}
