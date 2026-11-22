# API de carga del almacén

```bash
npm install          # instala también fast-xml-parser (extractor de Catalunya)
cp .env.example .env # rellenar SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY
npm run api          # http://localhost:3000/carga
```

Sin `.env` usa un almacén **en memoria** (válido para probar; se pierde al parar). Con Supabase, ejecute antes `db/schema.sql` en el SQL Editor.
Sin autenticación: solo escucha en 127.0.0.1. La clave `service_role` nunca llega al navegador.

## Endpoints

| Método y ruta | Descripción |
|---|---|
| `GET /api/fuentes` | Fuentes (`CAT`, `CV`, `CAN`), si están disponibles y su archivo por defecto en `data/`. |
| `GET /api/almacen/estado` | Fuentes cargadas y totales. |
| `POST /api/carga` | Cuerpo `{"fuentes":[{"fuente":"CV","contenido":"…opcional…"}]}`. Sin `contenido` usa el archivo de `data/`. |
| `DELETE /api/almacen` | Vacía todo y libera el bloqueo. Exige la cabecera `X-Confirmar: borrar`. |

Respuesta de carga: por fuente `estado` = `cargada`, `ya_cargada`, `no_disponible`, `error_datos`, `error_almacen` o `desconocida`, más `resumen` e `informe` (rechazados, duplicados, reparados, avisos).

## Garantías

- **Doble carga**: se comprueba antes de extraer y la base de datos lo impone con una clave primaria en `carga_fuente` (`FUENTE_YA_CARGADA`). Es atómico: si algo falla no queda nada a medias ni la fuente bloqueada.
- **Regla de datos**: se repara solo si el resultado queda válido; si no, se conserva el original y se informa.
- Antes de subir se valida cada entidad contra el esquema (prefijo de fuente, enum Ámbito, coordenadas, localidad y provincia).
- **Canarias**: usa `data/datos-abiertos-csv-segundo-trimestre26.json`. `_U` y valores en blanco se tratan como ausentes; las filas sin nombre o código de localidad se rechazan y se informan. Por cada `numero_registro` se conserva la primera fila y las repeticiones se detallan en duplicados. Las áreas sin equivalencia aprobada quedan en `ambito = null` con aviso.
