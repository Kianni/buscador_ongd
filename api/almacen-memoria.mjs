// Almacén en memoria con la misma semántica que db/schema.sql. Sirve para demos y pruebas sin Supabase.
export class ErrorAlmacen extends Error {
  constructor(codigo, mensaje) { super(mensaje ?? codigo); this.codigo = codigo; }
}

export class AlmacenMemoria {
  constructor() { this.tipo = 'memoria'; this.vaciar(); }
  vaciar() { this.entidades = new Map(); this.localidades = new Map(); this.provincias = new Map(); this.fuentes = new Map(); }

  async estado() {
    return {
      almacen: this.tipo,
      fuentes: [...this.fuentes].map(([fuente, v]) => ({ fuente, ...v })).sort((a, b) => a.fuente.localeCompare(b.fuente)),
      totales: { entidades: this.entidades.size, localidades: this.localidades.size, provincias: this.provincias.size },
    };
  }

  async cargar(fuente, entidades) {
    if (this.fuentes.has(fuente)) throw new ErrorAlmacen('FUENTE_YA_CARGADA', `La fuente ${fuente} ya está cargada. Borre el almacén antes de volver a cargarla.`);
    // Todo o nada: se prepara en copias y solo se confirma al final.
    const provincias = new Map(this.provincias), localidades = new Map(this.localidades), ents = new Map(this.entidades);
    let conflictos = 0;
    for (const e of entidades) {
      const l = e.en_localidad, p = l.en_provincia;
      if (!provincias.has(p.codigo)) provincias.set(p.codigo, { codigo: p.codigo, nombre: p.nombre });
      const previa = localidades.get(l.codigo);
      if (!previa) localidades.set(l.codigo, { codigo: l.codigo, nombre: l.nombre, provincia: p.codigo });
      else if (previa.nombre !== l.nombre) conflictos++;
      ents.set(e.cod_entidad, { ...e, fuente });
    }
    this.provincias = provincias; this.localidades = localidades; this.entidades = ents;
    this.fuentes.set(fuente, { cargada_en: new Date().toISOString(), cargados: entidades.length });
    return { entidades: entidades.length, localidades: localidades.size, provincias: provincias.size, localidades_con_nombre_distinto: conflictos };
  }

  async borrar() {
    const antes = { entidades: this.entidades.size, localidades: this.localidades.size, provincias: this.provincias.size, fuentes: this.fuentes.size };
    this.vaciar();
    return antes;
  }
}
