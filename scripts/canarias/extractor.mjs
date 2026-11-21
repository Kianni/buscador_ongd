import fs from 'fs';
import { pathToFileURL } from 'node:url';

// modify value for code_entidad
export const addCodeEntidad = item => "CAN:" + item.numero_registro;

// modify ambito
const ambito_dict = {
    "Tercera Edad": "MAYORES",
    "Discapacidad": "DISCAPACIDAD",
    "Menores Y Juventud": "INFANCIA_Y_JUVENTUD",
    "Mujer": "MUJER",
    "Exclusión Social": "INCLUSION_SOCIAL",
    "Voluntariado": "VOLUNTARIADO_Y_PARTICIPACION_COMUNITARIA",
    "Centros Ocupacionales": null,
    "Drogodependencia": "SALUD_Y_ATENCION_SOCIOSANITARIA",
    "Varios": null,
};

// Use source labels verbatim. null falls back to the parent area mapping.
const subambito_dict = {
    Varios: {
        "Asociaciones Culturales Deportivas SociO-Educativas SociO-Culturales": "CULTURA_Y_DESARROLLO_COMUNITARIO",
        "Asociaciones De Enfermos Ongs Relacionadas Con El Área SociO-Sanitaria Organizaciones Relacionadas Con Autoayuda Terapias Y Salud": "SALUD_Y_ATENCION_SOCIOSANITARIA",
        "Comedores Sociales Casas Hogar Comunidades Religiosas Talleres Sociales Desarrollo Social E Inserción Social Y Fomento Y Empleo": "INCLUSION_SOCIAL",
        "Otros": null,
        "Asociación De Igualdad Lgtbi": "INCLUSION_SOCIAL",
        "Asociaciones De Trabajadores Empresarios Sindicatos Colegios Profesionales Universidades": null,
        "Asocaciones Relacionadas Con Ciencia Tecnología Investigación E Innovación Medio Ambiente Ecología Patrimonio HistóricO-Cultural": null,
        "Migración": "MIGRACION",
        "Asociaciones De Vecinos Y Juveniles": "CULTURA_Y_DESARROLLO_COMUNITARIO",
    },
    Voluntariado: {
        "Servicios Sociales": "SALUD_Y_ATENCION_SOCIOSANITARIA",
        "Protección Del Medio Ambiente Y Defensa Del Medio Rural": null,
        "Cooperación Y Solidaridad Internacional": null,
        "Cualquier Otro Campo De Actuación En El Que Se Desarrollen Actividades De Voluntariado Que Se Puedan Englobar En Los Objetivos Que Contempla La Normativa De Voluntariado De Canarias": null,
        "Protección Civil": null,
        "Educación Ciencia Cultura Deportes Y Patrimonio HistóricO-Artístico": null,
        "Asuntos Sanitarios": null,
    },
};


export const mapIntoGlobal = (item) => {
    // Get the area from the main dictionary
    let ambito = null;
    let aviso = null;

    if (item.area_nombre === "Voluntariado") {
        ambito = ambito_dict[item.area_nombre];
        // report the subarea for Voluntariado
        const subarea = subambito_dict["Voluntariado"][item.subarea_nombre];
        aviso = subarea;
     
    } else if (item.area_nombre === "Varios") {    
        ambito = subambito_dict["Varios"][item.subarea_nombre] ?? null;
    } else {
        ambito = ambito_dict[item.area_nombre] ?? null;
    }
    return { ambito, aviso };
} 

export const groupByRegistration = (data) => {
    const rows = new Map();
    for (const item of data) {
        if (!rows.has(item.numero_registro)) rows.set(item.numero_registro, []);
        rows.get(item.numero_registro).push(item);
    }
    return rows;
}

export const chooseArea = (rows) => {
    return rows.find(item => mapIntoGlobal(item).ambito !== null);
}

export const mapRows = (data) => {
    const groupedData = groupByRegistration(data);

    const mappedData = [...groupedData.values()].map(areasGrouped => {
        const item = areasGrouped[0];
        const chosen = chooseArea(areasGrouped);

        return {
        cod_entidad: addCodeEntidad(item),
        nombre: item.denominacion,
        ambito: chosen ? mapIntoGlobal(chosen).ambito : null,
        direccion: item.direccion  ?? null,
        codigo_postal: item.codigo_postal ?? null,
        longitud: item.longitude ?? null,
        latitud: item.latitude ?? null,
        descripcion: item.descripcion ?? null,
        contacto: item.contacto ?? null,
        URL: item.URL ?? null,
        en_localidad: {
            codigo: item.codigo_localidad ?? null,
            nombre: item.localidad ?? null,
            en_provincia: {
                codigo: item.codigo_provincia ?? null,
                nombre: item.provincia ?? null
            }
        }
        };
    });
    return mappedData;
}


function main() {
    console.log('Extractor script running');
    const sample = new URL('../../data/entrega1/datos-abiertos-csv-segundo-trimestre26.json', import.meta.url);
    const fileContent = fs.readFileSync(process.argv[2] ?? sample, 'utf-8');
    const data = JSON.parse(fileContent);
    console.log(mapRows(data));
}

// Run the CLI only when Node launches this file directly.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main();
}
