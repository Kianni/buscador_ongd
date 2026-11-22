# Buscador de ONGD — carga de datos al almacén

Integra tres fuentes abiertas (Canarias JSON, Cataluña XML, Comunitat Valenciana CSV) en un formato común
(`Entidad → Localidad → Provincia`, ver `db/schema.sql`) y las carga en Supabase.
Requiere Node.js 22 o posterior.

## Arranque

Cada persona arranca la aplicación **en su propio ordenador**; no hay un servidor compartido.

```bash
cp .env.example .env      # y rellena SUPABASE_URL y la clave service_role (nunca se sube al repositorio)
npm install
npm start                 # http://127.0.0.1:3000/carga
```

El puerto por defecto es 3000. Si está ocupado, cada uno elige otro:

| Terminal | Comando |
|---|---|
| Bash / WSL / macOS | `PORT=3001 npm start` |
| PowerShell | `$env:PORT = 3001; npm.cmd start` |

Sin `.env` la app usa un almacén en memoria (sirve para probar, se pierde al parar).
Botones: «Cargar» (cada fuente solo una vez; una segunda carga se rechaza) y «Borrar almacén de datos»
(vacía la base de datos y permite volver a cargar).

## Dónde están las reglas

| Qué | Dónde |
|---|---|
| Reparación de teléfonos, correos y URLs (común a todas las fuentes) | `lib/contacto.mjs` |
| Informe de errores por categoría y posibles duplicados | `lib/informe.mjs` |
| Correcciones conocidas (erratas, dominios) y sus ejemplos | `lib/correcciones.json` |
| Espacios de nombres pegados (Cataluña) | `lib/nombres.mjs` |
| Extractor Cataluña + mapping | `scripts/catalunya/extractor.js` |
| Extractor Comunitat Valenciana + mapping | `scripts/valenciana/extractor.mjs`, `scripts/valenciana/README.md` |
| Extractor Canarias + mapping | `scripts/canarias/extractor.mjs`, `scripts/canarias/README.md` |
| Validación antes de guardar | `api/validar.mjs` |
| API (`/api/fuentes`, `/api/carga`, `/api/almacen`) | `api/server.mjs`, `api/README.md` |
| Esquema de la base de datos | `db/schema.sql` |

**Regla de reparación:** se repara solo si el resultado es válido; si no, se conserva el original y se avisa.
Cada registro se informa como rechazado, duplicado, reparado o con aviso, con categoría
(formato, faltante, rango, duplicado, semántico). Varios contactos en un campo se separan con `, `.

## Generar TXT de entrega

Después de regenerar las salidas de una fuente, exporta sus datos e informe con:

```bash
node scripts/exportar-entrega.mjs CAT
node scripts/exportar-entrega.mjs CV
node scripts/canarias/extractor.mjs
node scripts/exportar-entrega.mjs CAN
```

Los archivos se escriben en `entrega1/`. En Canarias, las áreas repetidas por número de registro se informan como duplicados y se conserva la primera fila.

## Pruebas

```bash
npm test
```

El MVP anterior (localStorage) sigue en `mvp/` y se arranca con `npm run start:mvp-antiguo`.
