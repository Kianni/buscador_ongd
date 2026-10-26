# ONGD — MVP local de importación

Tres archivos de ejemplo → tres adaptadores → un directorio común con búsqueda y exportación a JSON.
Requiere Node.js 22 o posterior. No requiere servicios de pago, instalación de paquetes ni claves de acceso.

## Inicio en PowerShell

```powershell
npm.cmd start
```

Abre **http://localhost:3000**. Para detener el servidor, pulsa `Ctrl+C`.
Si el puerto está ocupado:

```powershell
$env:PORT = 3001
npm.cmd start
```

No abras el HTML con doble clic: los módulos del navegador y la carga de ejemplos necesitan un servidor HTTP.

## Cómo probar la aplicación

1. Selecciona «Español» en el selector de idioma y pulsa «Abrir ejemplo CSV»: a la izquierda aparecen los campos de origen y a la derecha, el resultado de la transformación.
2. Pulsa «Añadir al directorio». Repite el proceso con XML y JSON o pulsa «Cargar los 3 ejemplos».
3. El directorio tendrá 15 registros. Prueba la búsqueda, el filtro por ámbito y «Descargar JSON».
4. La reimportación actualiza los registros con el mismo código; no aumenta el número de registros.
5. También puedes seleccionar un archivo propio del mismo formato y con los mismos campos de origen.

El directorio se guarda **solo en el localStorage del navegador actual**. No se comparte con el equipo.

En la esquina superior derecha puedes elegir entre **español, inglés y ruso**.
Al abrir la aplicación por primera vez, se utiliza un idioma compatible del navegador; si ninguno es compatible, se utiliza el ruso.
El idioma seleccionado se guarda en localStorage y se mantiene al recargar la página.
Se traducen los textos de la interfaz, las categorías, las notificaciones y los errores. Los datos de las entidades y las claves del esquema conservan su contenido original.
Al cambiar de idioma se conservan la vista previa, la búsqueda y el filtro seleccionado.
Las traducciones están en `mvp/i18n.js`; los comentarios del código fuente están escritos en inglés.

Supabase aún no está conectado y no se realizan solicitudes a servicios externos.
El botón «Vaciar» borra el directorio del navegador y conserva los archivos de origen.
Cada archivo se valida por completo antes de añadir sus registros: si hay un error, no se importa ninguno de sus registros.
Los archivos deben utilizar UTF-8 y tener un tamaño máximo de 2 MB. Los datos de ejemplo son ficticios.

## Estructura y esquema

- `data/mvp_data/entidades.csv`, `.xml`, `.json`: 5 registros y 3 campos por archivo.
- `mvp/adapters/csv.js`, `xml.js`, `json.js`: un adaptador independiente para cada formato.
- `mvp/schema.js`: categorías de `data/global_schema.py` y validación del formato común.
- `mvp/i18n.js`: traducciones de la interfaz, categorías y errores.
- `mvp/app.js`: carga, vista previa, almacenamiento local, búsqueda y exportación.
- `scripts/serve.mjs`: servidor local de la interfaz y los ejemplos.

| Esquema común | CSV | XML | JSON |
|---|---|---|---|
| `cod_entidad` | `ni_centro` + prefijo `CV:` | `n_mero_registre` + `CAT:` | `numero_registro` + `CA:` |
| `nombre` | `nombre` | `nom_de_l_entitat` | `denominacion` |
| `ambito` | `sector` | `ambit` | `area_nombre` |

El campo XML `ambit` se ha añadido para este ejemplo; no existe en el archivo XML original de mayor tamaño.
El CSV utiliza la coma como separador y admite campos entre comillas, comillas escapadas y saltos de línea dentro de los campos.
Las categorías se normalizan a los valores del enum `Ambito`. Una categoría desconocida genera un error; una categoría vacía se convierte en `null`.
Los identificadores son cadenas de texto, por lo que se conservan los ceros iniciales.

El resultado contiene **un subconjunto de tres campos de `Entidad`**. El modelo completo de Python requiere campos adicionales.
El esquema global original y los archivos de origen de mayor tamaño se mantienen sin cambios.
Al conectar Supabase, los adaptadores pueden trasladarse a Edge Functions. Para procesar XML en el servidor,
será necesario un analizador XML compatible que sustituya al `DOMParser` del navegador.

## Pruebas

```powershell
npm.cmd test
```

Las pruebas de Node.js verifican CSV/JSON, el formato común, el manejo de errores y la cobertura de las traducciones.
El adaptador XML utiliza el `DOMParser` del navegador.

Si tienes Chrome o Edge instalado, puedes ejecutar las pruebas de navegador con el servidor en marcha:

```powershell
npm.cmd run test:browser
```

Estas pruebas verifican los tres formatos, la carga de XML, la reimportación, la búsqueda, los filtros,
los tres idiomas, la traducción de errores, la persistencia tras recargar y la visualización en pantallas móviles.
La captura de pantalla se guarda en `.browser-test/mvp.png`.
Si el navegador está instalado en otra ubicación, define la variable de entorno `BROWSER_PATH`.
