import {readFileSync, writeFileSync} from 'node:fs'

let source = process.argv[2].toUpperCase(); //CAT, CV o CAN
let informe;
let entidades;
let res = [];
function aTsv(entidades) {
    const columnas = [
        'cod_entidad', 'nombre', 'ambito', 'direccion', 'codigo_postal',
        'longitud', 'latitud', 'descripcion', 'contacto', 'url',
        'en_localidad.codigo', 'en_localidad.nombre',
        'en_localidad.en_provincia.codigo', 'en_localidad.en_provincia.nombre',
    ];
    const celda = v => String(v ?? '');
    const filas = entidades.map(e => {
        const l = e.en_localidad;
        const p = l.en_provincia;
        return [
            e.cod_entidad, e.nombre, e.ambito, e.direccion, e.codigo_postal,
            e.longitud, e.latitud, e.descripcion, e.contacto, e.url,
            l.codigo, l.nombre, p.codigo, p.nombre,
        ].map(celda).join('\t');
    });
    return [columnas.join('\t'), ...filas].join('\n');
}

switch (source)
{
    case "CAT":
        informe = JSON.parse(readFileSync("scripts/catalunya/Entitats_ONGD_pretty.informe.json",'utf-8'));
        res.push("Resumen:");
        res.push(JSON.stringify(informe.resumen, null,2));

        res.push("Registros Reparados:");
        res.push(JSON.stringify(informe.reparados, null,2));

        res.push("Registros Rechazados:");
        res.push(JSON.stringify(informe.rechazados, null,2));
        writeFileSync("entrega1/Informe_CAT.txt",res.join('\n\n'),'utf-8');

        entidades = JSON.parse(readFileSync("scripts/catalunya/Entitats_ONGD_pretty.json",'utf-8'));
        writeFileSync('entrega1/Datos_CAT.txt', aTsv(entidades), 'utf-8');
        break;
    case "CV":
        //entidadesrt = "scripts/valenciana/salida/entidades_CV.json";
        informe = JSON.parse(readFileSync("scripts/valenciana/salida/entidades_CV.informe.json",'utf-8'));
        res.push("Resumen:");
        res.push(JSON.stringify(informe.resumen, null,2));

        res.push("Registros Reparados:");
        res.push(JSON.stringify(informe.reparados, null,2));

        res.push("Registros Rechazados:");
        res.push(JSON.stringify(informe.rechazados, null,2));
        writeFileSync("entrega1/Informe_CV.txt",res.join('\n\n'));

        entidades = JSON.parse(readFileSync("scripts/valenciana/salida/entidades_CV.json",'utf-8'));
        writeFileSync('entrega1/Datos_CV.txt', aTsv(entidades), 'utf-8');
        break;
    case "CAN":
        console.log("Canarias no implementado: lo entrega otra persona");
        //informe = JSON.parse(readFileSync(informert,'utf-8'));

        break;
    default:
        console.log("Fuente no válida");
        break;
}



