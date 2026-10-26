export const LANGUAGES = ['es', 'en', 'ru'];
export const LANGUAGE_STORAGE_KEY = 'ongd-mvp-language';

export const messages = {
  en: {
    title: 'ONGD · Data import', description: 'Local MVP: transform CSV, XML and JSON into a shared organization schema.',
    language: 'Language', localMvp: 'Local MVP', eyebrow: 'UNIFIED ORGANIZATION DIRECTORY',
    heading: 'Three formats. One schema.', intro: 'Upload a file, review the transformation and add records to the directory.',
    loadAll: 'Load 3 examples', sourceTitle: 'Data source', format: 'Format and adapter',
    formatCsv: 'CSV · Valencian Community', formatXml: 'XML · Catalonia', formatJson: 'JSON · Canary Islands',
    dropTitle: 'Choose or drop a file', dropHint: 'CSV, XML or JSON · UTF-8 · up to 2 MB',
    loadExample: 'Open {format} example', noFile: 'No file selected', mapping: 'FIELD MAPPING',
    sampleNote: 'Sample data: 5 records and 3 fields per file. The XML field ambit was added for this demo.',
    previewTitle: 'Review transformation', schemaNote: 'Global schema subset:', sourceFields: 'Source fields',
    commonFormat: 'Common format', entityMvp: 'Entity MVP', sourceEmpty: 'Choose a file or open an example.',
    outputEmpty: 'Transformed records will appear here.', prefixNote: 'Codes receive a source prefix: CV, CAT or CA.',
    import: 'Add to directory', ready: 'Ready to upload. All data stays in this browser.', directory: 'Shared directory',
    export: 'Download JSON', clear: 'Clear', search: 'Search', searchPlaceholder: 'Name, code or category…',
    category: 'Activity area', allCategories: 'All activity areas', codeColumn: 'Code · cod_entidad',
    nameColumn: 'Organization · nombre', categoryColumn: 'Activity area · ambito',
    footer: 'Stored in localStorage · Supabase is not connected yet · Full schema: data/global_schema.py',
    recordCount: 'Records: {count}', resultsCount: 'Showing {shown} of {total} records',
    noResults: 'No records match your search.', emptyDirectory: 'The directory is empty. Load an example and add records.',
    unspecified: 'Not specified', previewReady: '{count} records validated. Click “Add to directory” to save the result.',
    importDone: 'Import complete: {added} added, {updated} updated. Total records: {total}.',
    examplesDone: 'Three examples transformed and saved: {count} records. Reimporting updates existing codes.',
    cleared: 'Directory cleared. Source files are unchanged.', saveFailed: 'Could not save the directory in this browser. Check localStorage availability and free space.',
    storedInvalid: 'The saved directory is unavailable or damaged. Import files again to save a new directory.',
    unexpectedError: 'The operation failed. Please try again.', invalidFileType: 'Only CSV, XML and JSON files are supported.',
    fileTooLarge: 'This MVP supports files up to 2 MB.', fileEncoding: 'The file must use UTF-8 encoding.',
    oneFileOnly: 'Drop one file at a time.', exampleHttp: 'Could not load the {format} example: HTTP {status}.',
    exampleNetwork: 'Could not load the example. Check that the local server is running.',
    requiredField: 'Record {record}: field {field} is required.', invalidAmbito: 'Record {record}: invalid ambito value.',
    emptyFile: 'The file contains no records.', duplicateCode: 'Code {code} appears more than once in this file.',
    expectedList: 'Expected a list of records.', expectedObject: 'Record {record}: expected an object.',
    missingField: 'Record {record}: missing field {field}.', invalidId: 'Record {record}: {field} must be a nonempty string.',
    invalidName: 'Record {record}: {field} must be a string.', invalidCategoryType: 'Record {record}: category must be a string or null.',
    unknownCategory: 'Record {record}: unknown category “{category}”.', csvQuote: 'CSV: unexpected quote.',
    csvDelimiter: 'CSV: expected a delimiter after the closing quote.', csvUnclosed: 'CSV: unclosed quotes.',
    csvHeader: 'CSV must contain a header and at least one record.', csvUniqueHeaders: 'CSV: headers must be nonempty and unique.',
    csvColumns: 'CSV: record {record} has an incorrect number of fields.', jsonSyntax: 'JSON: invalid syntax. Expected an array of objects.',
    xmlDeclarations: 'XML: DTD and entity declarations are not supported.', xmlSyntax: 'XML: invalid document structure.',
    xmlRoot: 'XML: expected the registre_ongd root element.', xmlEntry: 'XML: expected entitat elements.',
    xmlDuplicateField: 'XML: duplicate field {field}.', xmlTextOnly: 'XML: fields must contain text only.',
  },
  es: {
    title: 'ONGD · Importación de datos', description: 'MVP local: transforma CSV, XML y JSON en un esquema común de entidades.',
    language: 'Idioma', localMvp: 'MVP local', eyebrow: 'DIRECTORIO UNIFICADO DE ENTIDADES',
    heading: 'Tres formatos. Un esquema.', intro: 'Carga un archivo, revisa la transformación y añade los registros al directorio.',
    loadAll: 'Cargar los 3 ejemplos', sourceTitle: 'Origen de datos', format: 'Formato y adaptador',
    formatCsv: 'CSV · Comunidad Valenciana', formatXml: 'XML · Cataluña', formatJson: 'JSON · Canarias',
    dropTitle: 'Selecciona o arrastra un archivo', dropHint: 'CSV, XML o JSON · UTF-8 · hasta 2 MB',
    loadExample: 'Abrir ejemplo {format}', noFile: 'Ningún archivo seleccionado', mapping: 'CORRESPONDENCIA DE CAMPOS',
    sampleNote: 'Datos de ejemplo: 5 registros y 3 campos por archivo. El campo XML ambit se ha añadido para esta demostración.',
    previewTitle: 'Revisar transformación', schemaNote: 'Subconjunto del esquema global:', sourceFields: 'Campos de origen',
    commonFormat: 'Formato común', entityMvp: 'Entidad MVP', sourceEmpty: 'Selecciona un archivo o abre un ejemplo.',
    outputEmpty: 'Aquí aparecerán los registros transformados.', prefixNote: 'Los códigos reciben un prefijo de origen: CV, CAT o CA.',
    import: 'Añadir al directorio', ready: 'Listo para cargar. Todos los datos permanecen en este navegador.', directory: 'Directorio común',
    export: 'Descargar JSON', clear: 'Vaciar', search: 'Buscar', searchPlaceholder: 'Nombre, código o categoría…',
    category: 'Ámbito', allCategories: 'Todos los ámbitos', codeColumn: 'Código · cod_entidad',
    nameColumn: 'Entidad · nombre', categoryColumn: 'Ámbito · ambito',
    footer: 'Almacenamiento en localStorage · Supabase aún no está conectado · Esquema completo: data/global_schema.py',
    recordCount: 'Registros: {count}', resultsCount: 'Mostrando {shown} de {total} registros',
    noResults: 'No hay registros que coincidan con la búsqueda.', emptyDirectory: 'El directorio está vacío. Carga un ejemplo y añade registros.',
    unspecified: 'Sin especificar', previewReady: '{count} registros validados. Pulsa «Añadir al directorio» para guardar el resultado.',
    importDone: 'Importación completada: {added} añadidos, {updated} actualizados. Total: {total} registros.',
    examplesDone: 'Tres ejemplos transformados y guardados: {count} registros. La reimportación actualiza los códigos existentes.',
    cleared: 'Directorio vacío. Los archivos de origen no se han modificado.', saveFailed: 'No se pudo guardar el directorio en el navegador. Comprueba localStorage y el espacio disponible.',
    storedInvalid: 'El directorio guardado no está disponible o está dañado. Importa los archivos de nuevo para guardar uno nuevo.',
    unexpectedError: 'La operación ha fallado. Inténtalo de nuevo.', invalidFileType: 'Solo se admiten archivos CSV, XML y JSON.',
    fileTooLarge: 'Este MVP admite archivos de hasta 2 MB.', fileEncoding: 'El archivo debe utilizar la codificación UTF-8.',
    oneFileOnly: 'Arrastra un solo archivo a la vez.', exampleHttp: 'No se pudo cargar el ejemplo {format}: HTTP {status}.',
    exampleNetwork: 'No se pudo cargar el ejemplo. Comprueba que el servidor local esté en marcha.',
    requiredField: 'Registro {record}: el campo {field} es obligatorio.', invalidAmbito: 'Registro {record}: valor de ambito no válido.',
    emptyFile: 'El archivo no contiene registros.', duplicateCode: 'El código {code} se repite en el archivo.',
    expectedList: 'Se esperaba una lista de registros.', expectedObject: 'Registro {record}: se esperaba un objeto.',
    missingField: 'Registro {record}: falta el campo {field}.', invalidId: 'Registro {record}: {field} debe ser una cadena no vacía.',
    invalidName: 'Registro {record}: {field} debe ser una cadena.', invalidCategoryType: 'Registro {record}: la categoría debe ser una cadena o null.',
    unknownCategory: 'Registro {record}: categoría desconocida «{category}».', csvQuote: 'CSV: comilla inesperada.',
    csvDelimiter: 'CSV: se esperaba un separador después de la comilla de cierre.', csvUnclosed: 'CSV: comillas sin cerrar.',
    csvHeader: 'El CSV debe contener una cabecera y al menos un registro.', csvUniqueHeaders: 'CSV: las cabeceras deben ser únicas y no estar vacías.',
    csvColumns: 'CSV: el registro {record} tiene un número incorrecto de campos.', jsonSyntax: 'JSON: sintaxis no válida. Se esperaba un array de objetos.',
    xmlDeclarations: 'XML: no se admiten declaraciones DTD ni de entidades.', xmlSyntax: 'XML: estructura del documento no válida.',
    xmlRoot: 'XML: se esperaba el elemento raíz registre_ongd.', xmlEntry: 'XML: se esperaban elementos entitat.',
    xmlDuplicateField: 'XML: el campo {field} está repetido.', xmlTextOnly: 'XML: los campos solo deben contener texto.',
  },
  ru: {
    title: 'ONGD · Импорт данных', description: 'Локальный MVP: преобразование CSV, XML и JSON в общую схему организаций.',
    language: 'Язык', localMvp: 'Локальный MVP', eyebrow: 'ЕДИНЫЙ КАТАЛОГ ОРГАНИЗАЦИЙ',
    heading: 'Три формата. Одна схема.', intro: 'Загрузите файл, проверьте преобразование и добавьте записи в каталог.',
    loadAll: 'Загрузить 3 примера', sourceTitle: 'Источник данных', format: 'Формат и адаптер',
    formatCsv: 'CSV · Валенсия', formatXml: 'XML · Каталония', formatJson: 'JSON · Канарские острова',
    dropTitle: 'Выберите или перетащите файл', dropHint: 'CSV, XML или JSON · UTF-8 · до 2 МБ',
    loadExample: 'Открыть пример {format}', noFile: 'Файл ещё не выбран', mapping: 'СОПОСТАВЛЕНИЕ ПОЛЕЙ',
    sampleNote: 'Учебные данные: в каждом файле 5 записей и 3 поля. В XML поле ambit добавлено для демонстрации.',
    previewTitle: 'Проверка преобразования', schemaNote: 'Подмножество глобальной схемы:', sourceFields: 'Исходные поля',
    commonFormat: 'Общий формат', entityMvp: 'Сущность MVP', sourceEmpty: 'Выберите файл или откройте пример.',
    outputEmpty: 'Здесь появятся преобразованные записи.', prefixNote: 'Коды получают префикс источника: CV, CAT или CA.',
    import: 'Добавить в каталог', ready: 'Готово к загрузке. Все данные остаются в этом браузере.', directory: 'Общий каталог',
    export: 'Скачать JSON', clear: 'Очистить', search: 'Поиск', searchPlaceholder: 'Название, код или категория…',
    category: 'Направление', allCategories: 'Все направления', codeColumn: 'Код · cod_entidad',
    nameColumn: 'Организация · nombre', categoryColumn: 'Направление · ambito',
    footer: 'Хранение в localStorage · Supabase пока не подключён · Полная схема: data/global_schema.py',
    recordCount: 'Записей: {count}', resultsCount: 'Показано {shown} из {total} записей',
    noResults: 'По вашему запросу ничего не найдено.', emptyDirectory: 'Каталог пока пуст. Загрузите пример и добавьте записи.',
    unspecified: 'Не указано', previewReady: 'Проверено {count} записей. Нажмите «Добавить в каталог», чтобы сохранить результат.',
    importDone: 'Импорт завершён: добавлено {added}, обновлено {updated}. Всего {total} записей.',
    examplesDone: 'Три примера преобразованы и сохранены: {count} записей. Повторный импорт обновляет существующие коды.',
    cleared: 'Каталог очищен. Исходные файлы сохранены.', saveFailed: 'Не удалось сохранить каталог в браузере. Проверьте доступность localStorage и свободное место.',
    storedInvalid: 'Сохранённый каталог недоступен или повреждён. Загрузите файлы повторно, чтобы сохранить новый каталог.',
    unexpectedError: 'Не удалось выполнить операцию. Попробуйте ещё раз.', invalidFileType: 'Поддерживаются только файлы CSV, XML и JSON.',
    fileTooLarge: 'Для MVP размер файла ограничен 2 МБ.', fileEncoding: 'Файл должен быть в кодировке UTF-8.',
    oneFileOnly: 'Перетащите один файл за раз.', exampleHttp: 'Не удалось загрузить пример {format}: HTTP {status}.',
    exampleNetwork: 'Не удалось загрузить пример. Проверьте, что локальный сервер запущен.',
    requiredField: 'Запись {record}: поле {field} обязательно.', invalidAmbito: 'Запись {record}: недопустимое значение ambito.',
    emptyFile: 'Файл не содержит записей.', duplicateCode: 'Повторяется код {code} внутри файла.',
    expectedList: 'Ожидается список записей.', expectedObject: 'Запись {record}: ожидается объект.',
    missingField: 'Запись {record}: отсутствует поле {field}.', invalidId: 'Запись {record}: {field} должен быть непустой строкой.',
    invalidName: 'Запись {record}: {field} должен быть строкой.', invalidCategoryType: 'Запись {record}: категория должна быть строкой или null.',
    unknownCategory: 'Запись {record}: неизвестная категория «{category}».', csvQuote: 'CSV: неожиданная кавычка.',
    csvDelimiter: 'CSV: после закрывающей кавычки ожидается разделитель.', csvUnclosed: 'CSV: не закрыты кавычки.',
    csvHeader: 'CSV должен содержать заголовок и хотя бы одну запись.', csvUniqueHeaders: 'CSV: заголовки должны быть непустыми и уникальными.',
    csvColumns: 'CSV: запись {record} содержит неверное число полей.', jsonSyntax: 'JSON: неверный синтаксис. Ожидается массив объектов.',
    xmlDeclarations: 'XML: DTD и объявления сущностей не поддерживаются.', xmlSyntax: 'XML: неверная структура документа.',
    xmlRoot: 'XML: ожидается корневой элемент registre_ongd.', xmlEntry: 'XML: ожидаются элементы entitat.',
    xmlDuplicateField: 'XML: повторяется поле {field}.', xmlTextOnly: 'XML: поля должны содержать только текст.',
  },
};

export const categoryLabels = {
  en: ['Older people', 'Disability', 'Mental health', 'Children and youth', 'Women', 'Migration', 'Social inclusion', 'Education and training', 'Employment and job placement', 'Health and social care', 'Volunteering and community participation', 'Culture and community development'],
  es: ['Personas mayores', 'Discapacidad', 'Salud mental', 'Infancia y juventud', 'Mujer', 'Migración', 'Inclusión social', 'Educación y formación', 'Empleo e inserción laboral', 'Salud y atención sociosanitaria', 'Voluntariado y participación comunitaria', 'Cultura y desarrollo comunitario'],
  ru: ['Пожилые люди', 'Инвалидность', 'Психическое здоровье', 'Дети и молодёжь', 'Женщины', 'Миграция', 'Социальная интеграция', 'Образование', 'Трудоустройство', 'Здоровье', 'Волонтёрство', 'Культура и сообщество'],
};

export function translate(language, key, params = {}) {
  const template = messages[language]?.[key] ?? messages.en[key] ?? messages.en.unexpectedError;
  return template.replace(/\{(\w+)\}/g, (_, name) => String(params[name] ?? `{${name}}`));
}

export function resolveLanguage(saved, preferred = []) {
  if (LANGUAGES.includes(saved)) return saved;
  for (const candidate of preferred) {
    const language = candidate.toLowerCase().split('-')[0];
    if (LANGUAGES.includes(language)) return language;
  }
  return 'ru';
}

// Keep error identifiers and parameters so an existing error can be translated again.
export class LocalizedError extends Error {
  constructor(key, params = {}) {
    super(translate('en', key, params));
    this.name = 'LocalizedError';
    this.key = key;
    this.params = params;
  }
}
