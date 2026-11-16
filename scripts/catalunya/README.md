# Extractor de entidades de Catalunya

`extractor.js` convierte un archivo XML del registro de entidades ONGD de Catalunya al esquema JSON global del proyecto.

## Requisitos

- Node.js instalado.
- Dependencias instaladas en esta carpeta (`npm install`), incluida `fast-xml-parser`.
- El XML que se quiere convertir y `municipios_catalunya.csv` deben estar en esta misma carpeta.

## Uso

Desde la carpeta `scripts/catalunya`, ejecuta:

```bash
node extractor.js
```

El programa pedirá el nombre del archivo XML. Puedes escribirlo con o sin la extensión `.xml`, por ejemplo:

```text
Entitats_ONGD_pretty.xml
```

El resultado se guarda en la misma carpeta y conserva el nombre base, con extensión `.json`. Por ejemplo, `Entitats_ONGD_pretty.xml` genera `Entitats_ONGD_pretty.json`. Si ya existe un JSON con ese nombre, se reemplaza.

## Qué transforma

- Lee las entidades XML (`registre_ongd/entitat`) y las convierte a una lista de objetos JSON.
- Normaliza teléfonos, correos y direcciones web.
- Busca municipios y códigos oficiales en `municipios_catalunya.csv`.
- Si no encuentra el municipio, intenta deducir la provincia a partir del prefijo del código postal.
- Completa el esquema global con campos sin equivalencia en el origen como `null`.

El CSV debe incluir las columnas `municipi_xml`, `nombre_oficial`, `codigo_ine`, `provincia_codigo` y `provincia_nombre`.

## Archivos

- `extractor.js`: lógica de extracción y conversión.
- `municipios_catalunya.csv`: correspondencias de municipios y códigos oficiales.
- `*.xml`: fichero de entrada indicado al ejecutar el programa.
- `*.json`: resultado generado con el mismo nombre base del XML.

---

# Catalonia entity extractor

`extractor.js` converts an XML file from Catalonia's NGO registry into the project's global JSON schema.

## Requirements

- Node.js installed.
- Dependencies installed in this folder (`npm install`), including `fast-xml-parser`.
- The XML file to convert and `municipios_catalunya.csv` must be in this same folder.

## Usage

From the `scripts/catalunya` folder, run:

```bash
node extractor.js
```

The program will ask for the XML filename. You can enter it with or without the `.xml` extension, for example:

```text
Entitats_ONGD_pretty.xml
```

The output is saved in the same folder, using the same base name and a `.json` extension. For example, `Entitats_ONGD_pretty.xml` creates `Entitats_ONGD_pretty.json`. An existing JSON file with that name will be overwritten.

## What it converts

- Reads the XML entities (`registre_ongd/entitat`) and converts them into a list of JSON objects.
- Normalizes phone numbers, email addresses, and website URLs.
- Looks up municipalities and official codes in `municipios_catalunya.csv`.
- If a municipality is not found, attempts to determine the province from the postal code prefix.
- Fills fields with no equivalent in the source, such as `null`, to match the global schema.

The CSV must include the columns `municipi_xml`, `nombre_oficial`, `codigo_ine`, `provincia_codigo`, and `provincia_nombre`.

## Files

- `extractor.js`: extraction and conversion logic.
- `municipios_catalunya.csv`: municipality names and official code mappings.
- `*.xml`: input file selected when running the program.
- `*.json`: output generated with the same base name as the XML file.
