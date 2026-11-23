// Lógica de carga: extraer -> validar -> subir al almacén. Independiente del servidor HTTP.
import { fuentePorId, leerArchivoPorDefecto } from './fuentes.mjs';
import { problemasDeEntidad } from './validar.mjs';
import { ErrorAlmacen } from './almacen-memoria.mjs';
import { aTsv, textoInforme } from '../scripts/exportar-entrega.mjs';

// Estados de cada fuente en la respuesta:
//   cargada | ya_cargada | no_disponible | error_datos | error_almacen | desconocida
async function cargarUna(almacen, peticion, dirDatos, yaCargadas) {
  const fuente = fuentePorId(peticion.fuente);
  if (!fuente) return { fuente: peticion.fuente, estado: 'desconocida', mensaje: `Fuente desconocida: "${peticion.fuente}".` };
  const base = { fuente: fuente.id, nombre: fuente.nombre };
  if (typeof fuente.extraer !== 'function') return { ...base, estado: 'no_disponible', mensaje: fuente.motivoNoDisponible };

  // Bloqueo de doble carga: se comprueba antes de trabajar y la base de datos lo garantiza otra vez al insertar.
  if (yaCargadas.has(fuente.id)) {
    return { ...base, estado: 'ya_cargada', mensaje: `${fuente.nombre} ya está cargada. Borre el almacén de datos para volver a cargarla.` };
  }

  let texto;
  try {
    texto = typeof peticion.contenido === 'string' && peticion.contenido !== ''
      ? peticion.contenido.replace(/^﻿/, '')
      : leerArchivoPorDefecto(fuente, dirDatos);
  } catch (e) {
    return { ...base, estado: 'error_datos', mensaje: e.message };
  }

  let resultado;
  try { resultado = await fuente.extraer(texto); }
  catch (e) { return { ...base, estado: 'error_datos', mensaje: `El archivo no se pudo interpretar: ${e.message}` }; }

  // Defensa en profundidad: ninguna entidad que incumpla el esquema llega al almacén.
  const { informe } = resultado;
  const validas = [];
  for (const e of resultado.entidades) {
    const problemas = problemasDeEntidad(e, fuente.id);
    if (problemas.length) informe.rechazados.push({ fila: null, id: e?.cod_entidad ?? null, campo: null, motivo: `Incumple el esquema: ${problemas.join(' ')}` });
    else validas.push(e);
  }
  informe.resumen.rechazados = informe.rechazados.length;
  informe.resumen.cargados = validas.length;

  if (validas.length === 0) {
    return { ...base, estado: 'error_datos', mensaje: 'No hay ninguna entidad válida que cargar. No se ha modificado el almacén.', resumen: informe.resumen, informe };
  }
  const entrega = {
    datosTxt: aTsv(validas),
    informeTxt: textoInforme(informe, fuente.id === 'CAN'),
  };
  try {
    const subida = await almacen.cargar(fuente.id, validas);
    yaCargadas.add(fuente.id);
    return { ...base, estado: 'cargada', mensaje: `${validas.length} entidades cargadas.`, resumen: informe.resumen, subida, informe, entrega };
  } catch (e) {
    if (e instanceof ErrorAlmacen && e.codigo === 'FUENTE_YA_CARGADA') {
      yaCargadas.add(fuente.id);
      return { ...base, estado: 'ya_cargada', mensaje: e.message };
    }
    return { ...base, estado: 'error_almacen', mensaje: e.message, resumen: informe.resumen, informe };
  }
}

/**
 * @param almacen  objeto con estado()/cargar()/borrar()
 * @param peticion {fuentes: [{fuente: 'CAT'|'CV'|'CAN', contenido?: string}]}
 */
export async function cargarFuentes(almacen, peticion, dirDatos) {
  const lista = peticion?.fuentes;
  if (!Array.isArray(lista) || lista.length === 0) throw new ErrorPeticion('Indique al menos una fuente en "fuentes".');
  if (new Set(lista.map(f => f?.fuente)).size !== lista.length) throw new ErrorPeticion('Hay fuentes repetidas en la petición.');
  const estado = await almacen.estado();
  const yaCargadas = new Set(estado.fuentes.map(f => f.fuente));
  const resultados = [];
  for (const item of lista) {
    if (!item || typeof item.fuente !== 'string') throw new ErrorPeticion('Cada elemento de "fuentes" necesita el campo "fuente".');
    resultados.push(await cargarUna(almacen, item, dirDatos, yaCargadas));
  }
  return { resultados, estado: await almacen.estado() };
}

export class ErrorPeticion extends Error {}
