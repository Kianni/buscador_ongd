// Normalización de teléfonos, correos y URLs, común a todos los extractores.
//
// Regla del proyecto: reparar SOLO si el resultado queda válido; si no, conservar el original e informar.
// Cada función devuelve { estado, valor, original }:
//   vacio      -> el origen no trae dato                      (valor = null)
//   marcador   -> valor de relleno de la fuente (p. ej. 0)    (valor = null)
//   valido     -> ya era válido                               (valor = texto normalizado)
//   reparado   -> era inválido y la reparación queda válida   (valor = texto reparado)
//   conservado -> no se pudo reparar: se guarda el original   (valor = original sin tocar, solo espacios)
// Cuando un campo trae varios valores se devuelven separados por «, ».

export const SEPARADOR = ', ';
const colapsar = texto => String(texto ?? '').replace(/\s+/g, ' ').trim();

export const EMAIL_VALIDO = /^[A-Za-z0-9._%+'-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;
export const TELEFONO_VALIDO = /^([6-9]\d{8}|012)$/;
const MARCADOR_EMAIL = 'zero@gva.es';
const MARCADOR_TELEFONO = '0';

// Dominios oficiales verificados a mano. Sirven para dos reparaciones que no se pueden deducir del texto solo:
//  - correo sin «@» (el punto ocupa su lugar): recepcion.muchamiel.grupocasaverde.com -> recepcion.muchamiel@grupocasaverde.com
//  - dominio cortado en el origen: comiteantisidavalenc -> comiteantisidavalencia.org
// Para corregir un caso nuevo y verificado, basta añadir aquí su dominio.
export const DOMINIOS_CONOCIDOS = ['grupocasaverde.com', 'comiteantisidavalencia.org'];

/** Devuelve el dominio conocido que completa `dom` (idéntico, o `dom` es su comienzo y solo hay un candidato), o null. */
function completarConocido(dom) {
  const bajo = dom.toLowerCase();
  if (DOMINIOS_CONOCIDOS.includes(bajo)) return bajo;
  if (bajo.length < 8) return null;
  const candidatos = DOMINIOS_CONOCIDOS.filter(k => k.startsWith(bajo));
  return candidatos.length === 1 ? candidatos[0] : null;
}

// En la fuente CAT el autocorrector convirtió «c.» en «Carrer» dentro de correos y webs (xteCarrercat = xtec.cat).
const CARRER = /Carrer/g;

// Terminaciones de dominio a las que se les perdió el punto (gmailcom -> gmail.com). Primero las de 3+ letras,
// que son menos ambiguas que es/eu/fr. Con «edu» basta un nombre de 2 letras (ubedu -> ub.edu).
const TLD_LARGOS = ['info', 'coop', 'com', 'org', 'net', 'edu', 'gob', 'cat', 'ong', 'earth', 'store'];
const TLD_CORTOS = ['es', 'eu', 'fr'];
const minimo = tld => (tld === 'edu' ? 2 : 3);
// Dominios compuestos a los que se les perdieron los puntos: fundacionimagoorgco -> fundacionimago.org.co
const COMPUESTOS = [['orgco', '.org.co'], ['comco', '.com.co'], ['orgar', '.org.ar'], ['orgmx', '.org.mx'], ['commx', '.com.mx'], ['orgbr', '.org.br']];

function pegarSufijo(dominio) {
  const bajo = dominio.toLowerCase();
  if (bajo.includes('.')) return null;
  if (/^(gmail|hotmail|yahoo|outlook)(coom|comm)$/.test(bajo)) return `${bajo.slice(0, -4)}.com`;
  if (/^(gmail|hotmail|outlook)$/.test(bajo)) return `${dominio}.com`;
  for (const [pegado, punto] of COMPUESTOS) {
    if (bajo.endsWith(pegado) && bajo.length - pegado.length >= 3) return `${dominio.slice(0, dominio.length - pegado.length)}${punto}`;
  }
  for (const tld of [...TLD_LARGOS, ...TLD_CORTOS]) {
    if (bajo.length - tld.length >= minimo(tld) && bajo.endsWith(tld)) return `${dominio.slice(0, dominio.length - tld.length)}.${tld}`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Correos
// ---------------------------------------------------------------------------

function repararCorreo(token) {
  const limpio = token.replace(/[.,;:·]+$/, '');
  if (EMAIL_VALIDO.test(limpio)) return limpio.toLowerCase();
  const partes = limpio.split('@');
  if (partes.length !== 2) return null;
  let dom = partes[1].replace(/'/g, '');
  if (/\.e$/i.test(dom)) dom += 's';               // «.e» es un «.es» cortado
  dom = completarConocido(dom) ?? dom;
  const directo = `${partes[0]}@${dom}`;
  if (EMAIL_VALIDO.test(directo)) return directo.toLowerCase();
  const dominio = pegarSufijo(dom);
  const candidato = dominio ? `${partes[0]}@${dominio}` : null;
  return candidato && EMAIL_VALIDO.test(candidato) ? candidato.toLowerCase() : null;
}

// Varios correos pegados sin separador: «a@yahooesb@yahooes». El trozo entre dos «@» es dominio + nombre del
// siguiente correo; se corta justo detrás de una terminación de dominio conocida (se prueban primero org/com/cat…).
function separarPegados(token) {
  const trozos = token.split('@');
  if (trozos.length < 3) return null;
  const salida = [];
  let local = trozos[0];
  for (let i = 1; i < trozos.length; i++) {
    const medio = trozos[i];
    if (i === trozos.length - 1) { salida.push(`${local}@${medio}`); break; }
    let cortado = null;
    for (const tld of [...TLD_LARGOS, ...TLD_CORTOS]) {
      const pos = medio.toLowerCase().indexOf(tld);
      if (pos >= minimo(tld) && pos + tld.length < medio.length - 1) { cortado = [medio.slice(0, pos + tld.length), medio.slice(pos + tld.length)]; break; }
    }
    if (!cortado) return null;
    salida.push(`${local}@${cortado[0]}`);
    local = cortado[1];
  }
  return salida;
}

export function procesarEmails(bruto) {
  const original = String(bruto ?? '');
  let texto = colapsar(original);
  if (texto === '') return { estado: 'vacio', valor: null, original };
  if (texto.toLowerCase() === MARCADOR_EMAIL) return { estado: 'marcador', valor: null, original };

  // Anotaciones y errores de transcripción conocidos.
  texto = texto.replace(CARRER, 'c.').replace(/\s*\([^)]*\)/g, '');
  if (!texto.includes('@')) texto = texto.replace(/arroba/i, '@');
  // Tildes y diéresis no son válidas en el correo: se quitan (Ü→U, Ó→O). La «·» de «col·lectiu» no se toca.
  texto = texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').normalize('NFC');
  // «col·lectiu» -> «collectiu»: el punto volado no es válido en un correo
  texto = texto.replace(/·/g, '');
  // Sin «@» y con un punto donde iría: «recepcion.muchamiel.grupocasaverde.com» (solo si el dominio es uno conocido)
  if (!texto.includes('@') && !/\s/.test(texto)) {
    const puntos = [...texto.matchAll(/\./g)].map(m => m.index);
    for (const i of puntos) {
      const dominio = texto.slice(i + 1).toLowerCase();
      if (i > 0 && DOMINIOS_CONOCIDOS.includes(dominio)) { texto = `${texto.slice(0, i)}@${dominio}`; break; }
    }
  }
  // Sin «@» y pegado al proveedor: «sakadawaorggmailcom» -> «sakadawaorg@gmailcom» (luego se repara el dominio)
  if (!texto.includes('@') && !/\s/.test(texto)) {
    const pegado = /^([a-z0-9._%+-]{3,}?)(gmail|hotmail|yahoo|outlook)(com|es|coom|comm)$/i.exec(texto);
    if (pegado) texto = `${pegado[1]}@${pegado[2]}${pegado[3]}`;
  }
  // «hotmail,com» -> «hotmail.com»
  texto = texto.replace(/(@[\w-]+(?:\.[\w-]+)*),(com|es|org|net|cat|eu|info)(?=\s|$)/gi, '$1.$2');
  // Sin «@» y con un único «2» (Shift+2 mal pulsado): «direccion2dominio.org»
  if (!texto.includes('@') && !/\s/.test(texto) && (texto.match(/2/g) ?? []).length === 1) {
    const alt = texto.replace('2', '@');
    if (EMAIL_VALIDO.test(alt)) texto = alt;
  }

  const tokens = texto.split(/[\s;,/]+/).filter(Boolean);
  const unir = lista => [...new Set(lista)].join(SEPARADOR);
  const cambiado = texto !== colapsar(original);
  const resultado = (estado, valor) => ({ estado: cambiado && estado === 'valido' ? 'reparado' : estado, valor, original });

  if (tokens.every(t => EMAIL_VALIDO.test(t))) {
    return resultado(tokens.length > 1 ? 'reparado' : 'valido', unir(tokens.map(t => t.toLowerCase())));
  }
  if (tokens.length > 1) {
    const unido = tokens.join('');
    if (EMAIL_VALIDO.test(unido)) return { estado: 'reparado', valor: unido.toLowerCase(), original };
  }
  // Cada token: reparar tal cual o, si trae varios «@», separar los correos pegados y reparar cada uno.
  const reparados = [];
  for (const t of tokens) {
    const simple = (t.match(/@/g) ?? []).length <= 1 ? repararCorreo(t) : null;
    if (simple) { reparados.push(simple); continue; }
    const partes = separarPegados(t);
    const cada = partes?.map(repararCorreo);
    if (!cada || !cada.every(Boolean)) { reparados.length = 0; break; }
    reparados.push(...cada);
  }
  if (reparados.length) return { estado: 'reparado', valor: unir(reparados), original };
  return { estado: 'conservado', valor: colapsar(original), original };
}

// ---------------------------------------------------------------------------
// Teléfonos
// ---------------------------------------------------------------------------

const NUMERO = /^(?:\+34|0034|34)?(\d{9}|012)$/;

function expandir(texto) {
  return texto
    // Extensiones: «932065910 Ext187», «931820731Ext15», «932065910(187)» -> 932065910#187
    .replace(/(\d{9})\s*\(?\s*(?:ext\.?\s*)?(\d{1,5})\s*\)(?!\d)/gi, '$1#$2')
    .replace(/(\d{9})\s*ext\.?\s*(\d{1,5})(?!\d)/gi, '$1#$2')
    // Número alternativo abreviado: «915327478/9» = 915327478 y 915327479; «935114416/17» = …416 y …417
    .replace(/(\d{9})\s*\/\s*(\d{1,2})(?!\d)/g, (_, base, sufijo) => `${base} ${base.slice(0, 9 - sufijo.length)}${sufijo}`);
}

export function procesarTelefonos(bruto) {
  const original = String(bruto ?? '');
  const texto = colapsar(original);
  if (texto === '') return { estado: 'vacio', valor: null, original };
  if (texto === MARCADOR_TELEFONO) return { estado: 'marcador', valor: null, original };

  const trozos = expandir(texto).split(/\s*[;,]\s*|\s+-\s+/).filter(Boolean);
  const numeros = [];
  for (const trozo of trozos) {
    const grupos = trozo.trim().split(/\s+/);
    // Varios números separados por espacios: todos los grupos deben ser un número completo.
    if (grupos.length > 1 && grupos.every(g => /^(?:\+34|0034|34)?\d{9}(#\d+)?$/.test(g))) numeros.push(...grupos);
    else if (grupos.length > 1 && grupos.every(g => /^\+?\d{8,}(#\d+)?$/.test(g))) numeros.push(...grupos);   // números sueltos, alguno incompleto
    else numeros.push(trozo);
  }
  const limpios = numeros.map(n => {
    const [base, ext] = n.replace(/[\s.-]/g, '').split('#');
    const m = NUMERO.exec(base);
    return m && TELEFONO_VALIDO.test(m[1]) ? (ext ? `${m[1]} ext. ${ext}` : m[1]) : null;
  });
  if (limpios.length && limpios.every(Boolean)) {
    const valor = [...new Set(limpios)].join(SEPARADOR);
    return { estado: valor === texto ? 'valido' : 'reparado', valor, original };
  }
  // Varios números y alguno incompleto (8 dígitos…): se conservan los válidos y el original queda en el informe.
  const validos = limpios.filter(Boolean);
  const descartados = numeros.filter((_, i) => !limpios[i]);
  if (numeros.length > 1 && validos.length && descartados.every(n => /^[\d\s.+-]+$/.test(n))) {
    return { estado: 'reparado', valor: [...new Set(validos)].join(SEPARADOR), original, descartados };
  }
  return { estado: 'conservado', valor: texto, original };
}

// ---------------------------------------------------------------------------
// URLs
// ---------------------------------------------------------------------------

export const URL_VALIDA = /^https?:\/\/(?:[a-z0-9-]+\.)+[a-z]{2,}(?::\d+)?(?:[/?#]\S*)?$/i;
const REDES = { instagram: 'instagram.com', twitter: 'x.com', x: 'x.com', facebook: 'facebook.com', tiktok: 'tiktok.com' };

function repararUrl(textoOriginal) {
  let texto = textoOriginal.replace(CARRER, 'c.').replace(/[·.,;:]+$/, '');

  // «@usuario (Instagram)» -> perfil de la red social
  const red = /^(?:https?:\/\/)?@([\w.]+)\s*\((instagram|twitter|facebook|tiktok)\)\/?$/i.exec(texto);
  if (red) return `https://www.${REDES[red[2].toLowerCase()]}/${red[1]}`;
  if (/\s/.test(texto)) return null;

  // Protocolos repetidos o mal escritos: http://https://, htpp://
  const protocolos = /^(?:[a-z]{3,5}:\/\/)+/i.exec(texto);
  let protocolo = 'http://';
  if (protocolos) {
    if (/https/i.test(protocolos[0])) protocolo = 'https://';
    texto = texto.slice(protocolos[0].length);
  }
  // «@org» en lugar de «.org» al final del dominio
  texto = texto.replace(/^([^/?#@]+)@(com|org|net|cat|es|eu|info|ong)(?=[/?#]|$)/i, '$1.$2');
  texto = texto.replace(/^xcom(?=[/?#]|$)/i, 'x.com').replace(/^xcom\//i, 'x.com/');

  const m = /^([^/?#:\s]+)(.*)$/.exec(texto);
  if (!m) return null;
  let host = m[1].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (/^www[a-z0-9]/.test(host)) host = host.replace(/^www/, 'www.');
  const sinWww = host.replace(/^www\./, '');
  if (!sinWww.includes('.')) {
    const pegado = pegarSufijo(sinWww);
    if (!pegado) return null;
    host = host.startsWith('www.') ? `www.${pegado}` : pegado;
  }
  const candidato = `${protocolo}${host}${m[2]}`;
  return URL_VALIDA.test(candidato) ? candidato : null;
}

export function procesarUrl(bruto) {
  const original = String(bruto ?? '');
  const texto = colapsar(original);
  if (texto === '') return { estado: 'vacio', valor: null, original };
  const sospechosa = /Carrer|^https?:\/\/www[a-z0-9]|xn--/.test(texto) || !/^https?:\/\/[^/?#]*\./i.test(texto.replace(/^(https?:\/\/)www\./i, '$1'));
  if (URL_VALIDA.test(texto) && !sospechosa) return { estado: 'valido', valor: texto, original };
  const reparada = repararUrl(texto);
  return reparada && URL_VALIDA.test(reparada) ? { estado: reparada === texto ? 'valido' : 'reparado', valor: reparada, original } : { estado: 'conservado', valor: texto, original };
}
