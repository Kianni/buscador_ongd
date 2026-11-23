# Extractor de Canarias

Convierte `data/datos-abiertos-csv-segundo-trimestre26.json` al formato de entidad usado por la API.

```bash
node scripts/canarias/extractor.mjs
node scripts/exportar-entrega.mjs CAN
```

El extractor genera `scripts/canarias/salida/entidades_CAN.json` y
`entidades_CAN.informe.json`. No llama a servicios externos.

## Reglas de datos

- `numero_registro` es la clave (`CAN:<numero_registro>`). Si se repite, se conserva la primera fila y cada repetición se informa como duplicado idéntico o conflicto; las áreas distintas quedan descritas en el informe.
- Se mapean `Discapacidad`, `Exclusión Social`, `Tercera Edad`, `Menores Y Juventud`, `Mujer` y `Voluntariado`. `Varios`, `Drogodependencia` y `Centros Ocupacionales` quedan con `ambito: null` y aviso hasta que se apruebe una equivalencia.
- `_U` y campos en blanco se tratan como ausentes. Nunca se copian como valores de teléfono, URL o dirección.
- Los nombres de municipio y provincia son obligatorios. Si faltan, se rechaza la fila y se informa; no se inventa una localidad. La provincia canaria puede recuperarse del prefijo municipal `35` o `38`.
- La fuente no trae código postal, coordenadas ni correo electrónico: se dejan a `null` y se cuentan en `sin_dato_en_origen`. Direcciones fuera del archipiélago no necesitan isla.
- Los valores originales de área y subárea se conservan en `descripcion`; la URL o el teléfono que no se puedan validar se conservan con aviso.

El informe incluye rechazos, duplicados, reparaciones, avisos, marcadores y campos ausentes. `entrega1/Informe_CAN.txt` añade las incidencias y contadores de ausencia para facilitar la revisión.
