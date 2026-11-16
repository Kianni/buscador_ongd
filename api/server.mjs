// Servidor de la API de carga y del formulario. Sin dependencias: node api/server.mjs
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cargarConfig, RAIZ } from './config.mjs';
import { AlmacenMemoria, ErrorAlmacen } from './almacen-memoria.mjs';
import { AlmacenSupabase } from './almacen-supabase.mjs';
import { cargarFuentes, ErrorPeticion } from './carga.mjs';
import { describirFuentes } from './fuentes.mjs';

const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
const DIR_WEB = path.join(RAIZ, 'web');

export function crearAlmacen(config) {
  return config.supabaseUrl && config.supabaseClave
    ? new AlmacenSupabase({ url: config.supabaseUrl, clave: config.supabaseClave })
    : new AlmacenMemoria();
}

async function leerJson(req, maxBytes) {
  const trozos = [];
  let total = 0;
  for await (const t of req) {
    total += t.length;
    if (total > maxBytes) throw new ErrorPeticion(`La petición supera el máximo de ${Math.round(maxBytes / 1048576)} MB.`);
    trozos.push(t);
  }
  try { return JSON.parse(Buffer.concat(trozos).toString('utf8')); }
  catch { throw new ErrorPeticion('El cuerpo de la petición no es JSON válido.'); }
}

const ESTADO_HTTP = { FUENTE_YA_CARGADA: 409, SIN_CONEXION: 502, ESQUEMA_NO_INSTALADO: 500, CLAVE_NO_VALIDA: 500, ERROR_ALMACEN: 502 };

export function crearServidor(config, almacen = crearAlmacen(config)) {
  const enviar = (res, estado, cuerpo) => {
    res.writeHead(estado, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(JSON.stringify(cuerpo));
  };

  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      const ruta = url.pathname;

      if (ruta === '/api/fuentes' && req.method === 'GET') return enviar(res, 200, describirFuentes(config.dirDatos));
      if (ruta === '/api/almacen/estado' && req.method === 'GET') return enviar(res, 200, await almacen.estado());

      if (ruta === '/api/carga' && req.method === 'POST') {
        if (!/^application\/json/i.test(req.headers['content-type'] ?? '')) throw new ErrorPeticion('Content-Type debe ser application/json.');
        return enviar(res, 200, await cargarFuentes(almacen, await leerJson(req, config.maxBytes), config.dirDatos));
      }

      if (ruta === '/api/almacen' && req.method === 'DELETE') {
        // Cabecera obligatoria: evita borrados accidentales o lanzados desde otra página.
        if (req.headers['x-confirmar'] !== 'borrar') return enviar(res, 400, { error: 'CONFIRMACION_REQUERIDA', mensaje: 'Falta la cabecera X-Confirmar: borrar.' });
        return enviar(res, 200, { borrado: await almacen.borrar(), estado: await almacen.estado() });
      }

      if (ruta.startsWith('/api/')) return enviar(res, 404, { error: 'NO_ENCONTRADO', mensaje: 'Endpoint desconocido.' });

      // Estáticos: solo la carpeta web/.
      if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
      if (ruta === '/') { res.writeHead(302, { Location: '/carga' }); return res.end(); }
      const archivo = ruta === '/carga' ? 'carga.html' : ruta.startsWith('/web/') ? decodeURIComponent(ruta.slice(5)) : null;
      const destino = archivo && path.resolve(DIR_WEB, archivo);
      if (!destino || path.relative(DIR_WEB, destino).startsWith('..') || archivo.includes('\0')) { res.writeHead(404); return res.end('No encontrado'); }
      const cuerpo = await fs.readFile(destino);
      res.writeHead(200, { 'Content-Type': TIPOS[path.extname(destino)] ?? 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      res.end(req.method === 'HEAD' ? undefined : cuerpo);
    } catch (e) {
      if (e instanceof ErrorPeticion) return enviar(res, 400, { error: 'PETICION_NO_VALIDA', mensaje: e.message });
      if (e instanceof ErrorAlmacen) return enviar(res, ESTADO_HTTP[e.codigo] ?? 500, { error: e.codigo, mensaje: e.message });
      if (e.code === 'ENOENT' || e.code === 'EISDIR') { res.writeHead(404); return res.end('No encontrado'); }
      console.error(e);
      enviar(res, 500, { error: 'ERROR_INTERNO', mensaje: 'Error interno del servidor.' });
    }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const config = cargarConfig();
  const almacen = crearAlmacen(config);
  const servidor = crearServidor(config, almacen);
  servidor.on('error', e => { console.error(e.code === 'EADDRINUSE' ? `El puerto ${config.puerto} está ocupado. Use otro: PORT=3001 npm run api` : e.message); process.exitCode = 1; });
  servidor.listen(config.puerto, '127.0.0.1', () => {
    console.log(`Carga de ONGD: http://localhost:${config.puerto}/carga`);
    console.log(almacen.tipo === 'supabase' ? `Almacén: Supabase (${config.supabaseUrl})` : 'Almacén: EN MEMORIA (sin SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY en .env). Los datos se pierden al parar el servidor.');
  });
}
