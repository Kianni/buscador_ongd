// Configuración de la API de carga. Lee .env (si existe) sin dependencias; las variables de entorno mandan.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const RAIZ = fileURLToPath(new URL('../', import.meta.url));

function leerEnv(ruta) {
  const salida = {};
  if (!fs.existsSync(ruta)) return salida;
  for (const linea of fs.readFileSync(ruta, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(linea);
    if (m && !linea.trim().startsWith('#')) salida[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return salida;
}

export function cargarConfig(env = process.env) {
  const fichero = leerEnv(path.join(RAIZ, '.env'));
  const valor = nombre => (env[nombre] ?? fichero[nombre] ?? '').trim();
  return {
    puerto: Number(valor('PORT') || 3000),
    supabaseUrl: valor('SUPABASE_URL').replace(/\/+$/, ''),
    supabaseClave: valor('SUPABASE_SERVICE_ROLE_KEY'),
    dirDatos: path.resolve(RAIZ, valor('DATA_DIR') || 'data'),
    maxBytes: 10 * 1024 * 1024,
  };
}
