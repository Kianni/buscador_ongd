// Restaura los espacios de nombres que vienen pegados en el origen (CAT: «FundacióServeiGironídePedagogiaSocial»).
// Solo se separa por fronteras seguras; un tramo todo en minúsculas («promociósocioculturali…») no se puede separar sin adivinar.
const MINUSCULA = 'a-zà-ÿ·\'’';
const MAYUSCULA = 'A-ZÀ-Ý';
const MINUSCULA_SIN_APOSTROFO = 'a-zà-ÿ·';   // tras un apóstrofo («l'Església») no se inserta espacio
import { CORRECCIONES, aplicarErratas } from './contacto.mjs';
const PARTICULAS_LARGAS = CORRECCIONES.particulas_largas;   // pegadas al final de una palabra y seguidas de una mayúscula

const CONECTORES = CORRECCIONES.conectores;

/** Trocea una racha de conectores («perla» -> ['per','la']); null si no se puede cubrir entera. */
/** «Del'Església» -> «de l'Església»; «Ramblad'Egara» -> «Rambla d'Egara». */
function apostrofos(t) {
  return t.replace(/(^|\s)([Dd])el'(?=[A-ZÀ-Ý])/g, (_, pre, d) => (pre === '' ? `${d}e l'` : `${pre}de l'`))
          .replace(/([a-zà-ÿ]{4,})d'(?=[A-ZÀ-Ý])/g, "$1 d'");
}

function trocearConectores(racha) {
  if (!racha) return [];
  for (const c of CONECTORES) {
    if (racha.startsWith(c)) { const resto = trocearConectores(racha.slice(c.length)); if (resto) return [c, ...resto]; }
  }
  return null;
}

/**
 * Palabra con minúsculas largas seguidas de ≥2 conectores («Associacióperla», «Asociaciónparala») o de «para/per/sense/amb/del/dels» sueltos.
 * Un solo conector corto («de», «la»…) pegado a una palabra se deja salvo la regla específica de «de» (palabras largas).
 */
function separarConectores(texto) {
  return texto.replace(new RegExp(`[${MAYUSCULA}][${MINUSCULA_SIN_APOSTROFO}]{5,}`, 'g'), palabra => {
    for (let k = 8; k < palabra.length; k++) {                       // base de al menos 8 letras: evita partir «Ciutadella»
      const partes = trocearConectores(palabra.slice(k));
      if (partes && (partes.length >= 2 || PARTICULAS_LARGAS.concat('per').includes(partes[0]))) return `${palabra.slice(0, k)} ${partes.join(' ')}`;
    }
    return palabra;
  });
}

export function separarNombre(texto) {
  const original = String(texto ?? '');
  if (!original || /\s/.test(original)) return original;     // si ya trae espacios no se toca
  let t = original
    .replace(new RegExp(`([${MINUSCULA_SIN_APOSTROFO}])([${MAYUSCULA}])`, 'g'), '$1 $2')   // FundacióServei -> Fundació Servei
    .replace(/([,;:])(?=[^\s\d])/g, '$1 ')                                    // AMAZAN:Promoció -> AMAZAN: Promoció
    .replace(/(\p{L})\(/gu, '$1 (')                                           // Sud(Ong -> Sud (Ong
    .replace(/\)(?=\p{L})/gu, ') ');
  t = t.replace(new RegExp(`([${MINUSCULA}]{3,}?)(${PARTICULAS_LARGAS.join('|')})(?= [${MAYUSCULA}])`, 'g'), '$1 $2');
  t = apostrofos(separarConectores(t));
  // «de» pegado: solo en palabras largas (Amigosde, Alianzade) para no partir Verde, Grande…
  t = t.replace(new RegExp(`\\b([${MAYUSCULA}][${MINUSCULA}]{5,})de(?= [${MAYUSCULA}])`, 'g'), '$1 de');
  return aplicarErratas(t.replace(/\s{2,}/g, ' ').trim(), 'nombre');
}

/**
 * Normaliza una dirección pegada («CarrerCentre10àtic» -> «Carrer Centre, 10 àtic»):
 * espacio antes de cada mayúscula (el tipo de vía queda separado del nombre), coma antes del número de la vía,
 * y espacio entre el número y la planta/puerta («84baixos» -> «84 baixos»; «1a», «7e» se mantienen).
 * Solo actúa sobre direcciones pegadas (sin espacios); si ya traen espacios no se tocan.
 */
export function normalizarDireccion(texto) {
  const original = String(texto ?? '');
  if (!original || /\s/.test(original)) return original;
  let t = original
    .replace(new RegExp(`([${MINUSCULA_SIN_APOSTROFO}])([${MAYUSCULA}])`, 'g'), '$1 $2')
    .replace(/([,;:])(?=[^\s])/g, '$1 ')
    .replace(/(\p{L})\(/gu, '$1 (')
    .replace(/\)(?=\p{L})/gu, ') ');
  t = apostrofos(t);
  // «de» e «i» pegados a la palabra anterior: Travesserade Gràcia, Costai Cuxart
  t = t.replace(new RegExp(`([${MINUSCULA}]{3,}?)(${PARTICULAS_LARGAS.join('|')})(?= [${MAYUSCULA}])`, 'g'), '$1 $2')
       .replace(new RegExp(`\\b([${MAYUSCULA}][${MINUSCULA}]{3,})de(?= [${MAYUSCULA}])`, 'g'), '$1 de')
       .replace(new RegExp(`\\b([${MAYUSCULA}][${MINUSCULA}]{3,}[aeo])i(?= [${MAYUSCULA}])`, 'g'), '$1 i');
  // Número de la vía: coma delante del primero que sigue a una letra; después, espacios.
  const cifra = /\d/.exec(t);
  if (cifra && cifra.index > 0 && /\p{L}/u.test(t[cifra.index - 1])) t = `${t.slice(0, cifra.index)}, ${t.slice(cifra.index)}`;
  t = t.replace(/(\p{L})(\d)/gu, '$1 $2');                  // planta/puerta pegada a letras: baixos1 -> baixos 1
  t = t.replace(/(\d)(\p{L}{3,})/gu, '$1 $2');            // 84baixos -> 84 baixos; 1a / 7e se mantienen
  return aplicarErratas(t.replace(/\s{2,}/g, ' ').trim(), 'direccion');
}
