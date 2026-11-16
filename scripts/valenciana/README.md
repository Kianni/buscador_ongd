# Extractor de la Comunitat Valenciana (CV)

Convierte el CSV de centros de la Comunitat Valenciana al JSON con el **formato común** del esquema global
(diagrama Entidad → Localidad → Provincia). Sin dependencias: solo Node.js 22 o posterior.

## Uso

Desde consola:

```bash
node extractor.mjs entrada.csv [salida.json]
```

Genera `salida.json` (entidades) y `salida.informe.json` (informe de la carga). Sin segundo argumento usa el nombre del CSV.

Desde código (la API de carga debe usar esto, no la consola):

```js
import { extraerCV } from './extractor.mjs';
const { entidades, informe } = extraerCV(textoCsv);   // lanza Error si el CSV no tiene las columnas obligatorias
```

## Formato de salida

```json
{
  "cod_entidad": "CV:1491", "nombre": "…", "ambito": "INCLUSION_SOCIAL", "direccion": "…",
  "codigo_postal": null, "longitud": -0.389809, "latitud": 39.462275,
  "descripcion": "VIVIENDAS TUTELADAS", "contacto": "963496977, correo@dominio.es", "url": null,
  "en_localidad": { "codigo": "46250", "nombre": "València",
                    "en_provincia": { "codigo": "46", "nombre": "València/Valencia" } }
}
```

El mapping completo está en `Mappings_CV_ComunitatValenciana.docx`.

## Informe

| Sección | Contenido |
|---|---|
| `resumen` | Leídos, cargados, rechazados, duplicados, con reparaciones y con avisos |
| `rechazados` | Registros que no se cargan (falta nombre, código de municipio inválido, municipio incoherente con su código…) |
| `duplicados` | `id` repetido; se conserva la primera aparición (`idéntico` o `conflicto`) |
| `reparados` | Valor original, valor reparado y motivo |
| `avisos` | El registro se carga, pero un campo se deja en `null` o un valor no válido que no se puede reparar se conserva tal cual |
| `marcadores_sin_dato` | Valores de relleno de la fuente (`zero@gva.es`, teléfono `0`) tratados como vacío |
| `sin_dato_en_origen` | Campos que esta fuente nunca trae (`codigo_postal`, `url`) |

## Reglas principales

- **Clave:** `cod_entidad = "CV:" + id` (el `id` es único; `ni_centro` se repite en 13 casos).
- **Provincia:** se deduce de los 2 primeros dígitos del código de municipio (03, 12 o 46); si el texto de la fuente no coincide, manda el código.
- **Municipio:** `municipios_cv.csv` (333 municipios, derivada del propio CSV completo, donde código y nombre son 1 a 1). Si el nombre no corresponde al código, el registro se rechaza.
- **Coordenadas:** UTM 30N (EPSG:25830) → WGS84. Coma decimal se corrige; si x/y faltan se recuperan del campo `WKT`; marcadores como `9999999` quedan en `null`.
- **Ámbito:** desde `sector`. Un sector desconocido deja `ambito: null` con aviso.
- **Contacto:** teléfonos y correos válidos unidos con `, ` (coma y espacio).

## Pruebas

Desde la raíz del repositorio: `node --test tests/valenciana.test.mjs`.

## Dominios conocidos (correcciones futuras)

`lib/correcciones.json` (clave `dominios_conocidos`) guarda dominios oficiales verificados a mano. Con ellos se reparan dos errores que el texto solo no permite deducir:

| Error | Ejemplo | Resultado |
|---|---|---|
| Un punto ocupa el lugar de la `@` | `RECEPCION.MUCHAMIEL.GRUPOCASAVERDE.COM` (id 797) | `recepcion.muchamiel@grupocasaverde.com` |
| Dominio cortado en el origen (el texto es el comienzo de un único dominio conocido, mínimo 8 letras) | `VIVIENDASUPERVISADA@COMITEANTISIDAVALENC` (id 884) | `viviendasupervisada@comiteantisidavalencia.org` |

Para corregir un caso nuevo, verifica el dominio oficial, añádelo a esa lista y añade un ejemplo en `ejemplos`; `npm test` comprueba que se repara. La regla se aplica a todas las fuentes. Los dominios que no estén en la lista siguen como aviso con el original conservado.

## Posibles duplicados (mismo nombre y localidad, otro id)

Nunca se borran ni se fusionan. El informe compara el resto de campos (dirección, CP, contacto, descripción, ámbito, URL, coordenadas) y lo indica:

| Evidencia | Significado | Qué hacer |
|---|---|---|
| `identica` | Idénticos salvo el id: probable fila repetida del volcado (p. ej. ids 1680–1706 repiten 1654–1666) | Revisar y borrar una a mano |
| `una_incompleta` | Iguales, pero una tiene campos vacíos | Quedarse con la más completa |
| `distintos` | Se distinguen en descripción/ámbito/otros: recursos distintos del mismo centro | Conservar ambos |

## Erratas conocidas (corrección global)

`lib/correcciones.json` (clave `erratas`) guarda una lista de patrones que se corrigen en correos y webs de cualquier fuente. Hoy:

| Errata | Corrección | Ejemplo |
|---|---|---|
| `AJUMTAMENT` | `ajuntament` | `AJUMTAMENT@VALLDE LAGUAR.ES` → `ajuntament@valldelaguar.es` (ids 3, 14, 15). Ámbito: correo y url |
| `Esglèsia` | `Església` | `PlaçaDel'Esglèsia` → `Plaça de l'Església`. Ámbito: nombre y direccion |

Para un caso nuevo y verificado, se añade una entrada y un ejemplo en el mismo archivo (`npm test` comprueba que funciona). Cada cambio queda en «Datos reparados» con el valor antes y después.

## Cómo automatizar una corrección nueva

1. Abre `lib/correcciones.json`.
2. Añade la errata (`buscar` → `por`) o el dominio oficial verificado.
3. Añade en `ejemplos` el dato original (`entrada`) y el resultado esperado (`salida`).
4. Ejecuta `npm test`: si el ejemplo no se repara como indicas, falla.
5. Vuelve a cargar los datos: la corrección se aplica en todas las fuentes y cada cambio queda en «Datos reparados».

## Reglas globales de texto (nombres y direcciones pegados)

Definidas en `lib/correcciones.json` (`conectores`, `particulas_largas`, `reglas_de_texto`) y aplicadas por `lib/nombres.mjs`:

- Cada mayúscula tras una minúscula abre una palabra nueva.
- Direcciones: coma antes del número de la vía y espacio entre número y planta/puerta (`84baixos` → `84 baixos`; `1a`, `7e` se mantienen).
- Apóstrofos: `Del'Església` → `de l'Església`; `Ramblad'Egara` → `Rambla d'Egara`.
- Conectores pegados (`para`, `per`, `sense`, `amb`, `del`, `dels`, `de`, `la`…): solo se parten con una base de 8 o más letras, para no romper `Ciutadella`.

Cada regla nueva lleva un ejemplo en `ejemplos` (`tipo`: correo, url, nombre o direccion); `npm test` los comprueba todos.
