from dataclasses import dataclass
from enum import Enum


class Ambito(str, Enum):
    MAYORES = "MAYORES"
    DISCAPACIDAD = "DISCAPACIDAD"
    SALUD_MENTAL = "SALUD_MENTAL"
    INFANCIA_Y_JUVENTUD = "INFANCIA_Y_JUVENTUD"
    MUJER = "MUJER"
    MIGRACION = "MIGRACION"
    INCLUSION_SOCIAL = "INCLUSION_SOCIAL"
    EDUCACION_Y_FORMACION = "EDUCACION_Y_FORMACION"
    EMPLEO_E_INSERCION_LABORAL = "EMPLEO_E_INSERCION_LABORAL"
    SALUD_Y_ATENCION_SOCIOSANITARIA = "SALUD_Y_ATENCION_SOCIOSANITARIA"
    VOLUNTARIADO_Y_PARTICIPACION_COMUNITARIA = (
        "VOLUNTARIADO_Y_PARTICIPACION_COMUNITARIA"
    )
    CULTURA_Y_DESARROLLO_COMUNITARIO = (
        "CULTURA_Y_DESARROLLO_COMUNITARIO"
    )


@dataclass
class Provincia:
    codigo: str
    nombre: str


@dataclass
class Localidad:
    codigo: str
    nombre: str
    en_provincia: Provincia


@dataclass
class Entidad:
    cod_entidad: str
    nombre: str
    ambito: Ambito | None
    direccion: str
    codigo_postal: str | None
    longitud: float | None
    latitud: float | None
    descripcion: str | None
    contacto: str | None
    url: str | None
    en_localidad: Localidad