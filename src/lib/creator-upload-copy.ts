import type { LaunchLanguage } from '@memorialvideo/contracts';

/** Multi-file upload queue strings. Draft translations until native review (XB-004). */
export const UPLOAD_QUEUE_KEYS = [
  'creator.memories.retry',
  'creator.memories.fileProgress',
  'creator.memories.fileFailed',
  'creator.memories.fileDone',
  'creator.memories.filesDone',
] as const;

export type UploadQueueKey = (typeof UPLOAD_QUEUE_KEYS)[number];
type UploadQueueCatalog = Record<UploadQueueKey, string>;

export const uploadQueueEnglish: UploadQueueCatalog = {
  'creator.memories.retry': 'Try again',
  'creator.memories.fileProgress': 'Uploading {current} of {total}: {name}',
  'creator.memories.fileFailed': '{name} could not be uploaded.',
  'creator.memories.fileDone': '{name} added.',
  'creator.memories.filesDone': '{count} files added.',
};

const nl: UploadQueueCatalog = {
  'creator.memories.retry': 'Opnieuw proberen',
  'creator.memories.fileProgress': 'Uploaden {current} van {total}: {name}',
  'creator.memories.fileFailed': '{name} kon niet worden geüpload.',
  'creator.memories.fileDone': '{name} is toegevoegd.',
  'creator.memories.filesDone': '{count} bestanden toegevoegd.',
};

const de: UploadQueueCatalog = {
  'creator.memories.retry': 'Erneut versuchen',
  'creator.memories.fileProgress': 'Hochladen {current} von {total}: {name}',
  'creator.memories.fileFailed': '{name} konnte nicht hochgeladen werden.',
  'creator.memories.fileDone': '{name} wurde hinzugefügt.',
  'creator.memories.filesDone': '{count} Dateien hinzugefügt.',
};

const fr: UploadQueueCatalog = {
  'creator.memories.retry': 'Réessayer',
  'creator.memories.fileProgress': 'Envoi {current} sur {total} : {name}',
  'creator.memories.fileFailed': '{name} n’a pas pu être envoyé.',
  'creator.memories.fileDone': '{name} a été ajouté.',
  'creator.memories.filesDone': '{count} fichiers ajoutés.',
};

const es: UploadQueueCatalog = {
  'creator.memories.retry': 'Reintentar',
  'creator.memories.fileProgress': 'Subiendo {current} de {total}: {name}',
  'creator.memories.fileFailed': 'No se pudo subir {name}.',
  'creator.memories.fileDone': '{name} se añadió.',
  'creator.memories.filesDone': '{count} archivos añadidos.',
};

const pt: UploadQueueCatalog = {
  'creator.memories.retry': 'Tentar de novo',
  'creator.memories.fileProgress': 'A enviar {current} de {total}: {name}',
  'creator.memories.fileFailed': 'Não foi possível enviar {name}.',
  'creator.memories.fileDone': '{name} foi adicionado.',
  'creator.memories.filesDone': '{count} ficheiros adicionados.',
};

const it: UploadQueueCatalog = {
  'creator.memories.retry': 'Riprova',
  'creator.memories.fileProgress': 'Caricamento {current} di {total}: {name}',
  'creator.memories.fileFailed': 'Impossibile caricare {name}.',
  'creator.memories.fileDone': '{name} è stato aggiunto.',
  'creator.memories.filesDone': '{count} file aggiunti.',
};

const pl: UploadQueueCatalog = {
  'creator.memories.retry': 'Spróbuj ponownie',
  'creator.memories.fileProgress': 'Przesyłanie {current} z {total}: {name}',
  'creator.memories.fileFailed': 'Nie udało się przesłać pliku {name}.',
  'creator.memories.fileDone': 'Dodano plik {name}.',
  'creator.memories.filesDone': 'Dodano pliki: {count}.',
};

export const uploadQueueDrafts: Record<Exclude<LaunchLanguage, 'en'>, UploadQueueCatalog> = {
  nl,
  de,
  fr,
  es,
  pt,
  it,
  pl,
};
