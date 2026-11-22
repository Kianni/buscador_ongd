// Registro de fuentes. Para añadir una (p. ej. Canarias) basta con una entrada más con su `extraer`.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { extraerCV } from '../scripts/valenciana/extractor.mjs';
import { extraerCAN } from '../scripts/canarias/extractor.mjs';

const require = createRequire(import.meta.url);

export const FUENTES = [
  {
    id: 'CAT', nombre: 'Catalunya', formato: 'XML', extension: '.xml',
    archivoPorDefecto: 'Entitats_ONGD_pretty.xml',
    extraer: async texto => require('../scripts/catalunya/extractor.js').extraerCAT(texto),
  },
  {
    id: 'CV', nombre: 'Comunitat Valenciana', formato: 'CSV', extension: '.csv',
    archivoPorDefecto: 'entidades_CV.csv',
    extraer: async texto => extraerCV(texto),
  },
  {
    id: 'CAN', nombre: 'Canarias', formato: 'JSON', extension: '.json',
    archivoPorDefecto: 'datos-abiertos-csv-segundo-trimestre26.json',
    extraer: texto => extraerCAN(texto),
  },
];

export const fuentePorId = id => FUENTES.find(f => f.id === id);

export function describirFuentes(dirDatos) {
  return FUENTES.map(f => ({
    id: f.id, nombre: f.nombre, formato: f.formato,
    disponible: typeof f.extraer === 'function',
    motivo: f.motivoNoDisponible ?? null,
    archivoPorDefecto: f.archivoPorDefecto,
    hayArchivoPorDefecto: fs.existsSync(path.join(dirDatos, f.archivoPorDefecto)),
  }));
}

export function leerArchivoPorDefecto(fuente, dirDatos) {
  const ruta = path.join(dirDatos, fuente.archivoPorDefecto);
  if (!fs.existsSync(ruta)) throw new Error(`No se encuentra el archivo de datos "${fuente.archivoPorDefecto}" en la carpeta de datos.`);
  return fs.readFileSync(ruta, 'utf8').replace(/^﻿/, '');
}
