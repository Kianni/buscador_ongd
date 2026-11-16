// Almacén en Supabase. Llama a las funciones SQL de db/schema.sql (cargar_fuente, borrar_almacen, estado_almacen)
// por PostgREST con la clave service_role, que solo vive en el servidor (nunca en el navegador).
import { ErrorAlmacen } from './almacen-memoria.mjs';

export class AlmacenSupabase {
  constructor({ url, clave, fetchFn = fetch }) {
    this.tipo = 'supabase'; this.url = url; this.clave = clave; this.fetchFn = fetchFn;
  }

  async rpc(nombre, cuerpo = {}) {
    let respuesta;
    try {
      respuesta = await this.fetchFn(`${this.url}/rest/v1/rpc/${nombre}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: this.clave, Authorization: `Bearer ${this.clave}` },
        body: JSON.stringify(cuerpo),
      });
    } catch (e) {
      throw new ErrorAlmacen('SIN_CONEXION', `No se pudo conectar con Supabase: ${e.message}`);
    }
    const texto = await respuesta.text();
    let datos = null;
    try { datos = texto ? JSON.parse(texto) : null; } catch { /* respuesta no JSON */ }
    if (!respuesta.ok) {
      const mensaje = datos?.message ?? texto.slice(0, 200);
      if (mensaje === 'FUENTE_YA_CARGADA') throw new ErrorAlmacen('FUENTE_YA_CARGADA', 'La fuente ya está cargada. Borre el almacén antes de volver a cargarla.');
      if (respuesta.status === 404 || datos?.code === 'PGRST202') throw new ErrorAlmacen('ESQUEMA_NO_INSTALADO', 'Faltan las funciones SQL en Supabase: ejecute db/schema.sql en el SQL Editor.');
      if (respuesta.status === 401 || respuesta.status === 403) throw new ErrorAlmacen('CLAVE_NO_VALIDA', 'Supabase rechazó la clave: compruebe SUPABASE_SERVICE_ROLE_KEY.');
      throw new ErrorAlmacen('ERROR_ALMACEN', `Supabase respondió ${respuesta.status}: ${mensaje}`);
    }
    return datos;
  }

  async estado() { return { almacen: this.tipo, ...(await this.rpc('estado_almacen')) }; }
  async cargar(fuente, entidades) { return this.rpc('cargar_fuente', { p_fuente: fuente, p_entidades: entidades }); }
  async borrar() { return this.rpc('borrar_almacen'); }
}
