// Restaura los espacios de nombres que vienen pegados en el origen (CAT: «FundacióServeiGironídePedagogiaSocial»).
// Solo se separa por fronteras seguras; un tramo todo en minúsculas («promociósocioculturali…») no se puede separar sin adivinar.
const MINUSCULA = 'a-zà-ÿ·\'’';
const MAYUSCULA = 'A-ZÀ-Ý';
const PARTICULAS_LARGAS = ['sense', 'dels', 'del', 'para', 'amb'];   // pegadas al final de una palabra y seguidas de una mayúscula

export function separarNombre(texto) {
  const original = String(texto ?? '');
  if (!original || /\s/.test(original)) return original;     // si ya trae espacios no se toca
  let t = original
    .replace(new RegExp(`([${MINUSCULA}])([${MAYUSCULA}])`, 'g'), '$1 $2')   // FundacióServei -> Fundació Servei
    .replace(/([,;:])(?=[^\s\d])/g, '$1 ')                                    // AMAZAN:Promoció -> AMAZAN: Promoció
    .replace(/(\p{L})\(/gu, '$1 (')                                           // Sud(Ong -> Sud (Ong
    .replace(/\)(?=\p{L})/gu, ') ');
  t = t.replace(new RegExp(`([${MINUSCULA}]{3,}?)(${PARTICULAS_LARGAS.join('|')})(?= [${MAYUSCULA}])`, 'g'), '$1 $2');
  // «de» pegado: solo en palabras largas (Amigosde, Alianzade) para no partir Verde, Grande…
  t = t.replace(new RegExp(`\\b([${MAYUSCULA}][${MINUSCULA}]{5,})de(?= [${MAYUSCULA}])`, 'g'), '$1 de');
  return t.replace(/\s{2,}/g, ' ').trim();
}
