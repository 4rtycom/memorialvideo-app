import type { LaunchLanguage } from '@memorialvideo/contracts';

/**
 * Checkout-unavailable, pack fallback name and delete-confirmation dialog strings.
 * Overrides the earlier developer-facing English for the two stripeUnavailable keys.
 * Draft translations until native review (XB-004).
 */
export const ACCOUNT_PACK_KEYS = [
  'creator.pack.stripeUnavailable',
  'creator.pack.stripeUnavailableBody',
  'creator.pack.fallbackName',
  'creator.account.deleteTitle',
  'creator.account.deleteBody',
  'creator.account.deleteTypeLabel',
  'creator.account.deleteCancel',
  'creator.account.deleteConfirm',
] as const;

export type AccountPackKey = (typeof ACCOUNT_PACK_KEYS)[number];
type AccountPackCatalog = Record<AccountPackKey, string>;

export const accountPackEnglish: AccountPackCatalog = {
  'creator.pack.stripeUnavailable': 'Buying a Memorial Pack is not available right now.',
  'creator.pack.stripeUnavailableBody': 'Nothing has been charged. Please come back later.',
  'creator.pack.fallbackName': 'Memorial Pack',
  'creator.account.deleteTitle': 'Delete this tribute?',
  'creator.account.deleteBody': '“{name}” and everything in it will be permanently deleted. This cannot be undone.',
  'creator.account.deleteTypeLabel': 'Type the name to confirm',
  'creator.account.deleteCancel': 'Cancel',
  'creator.account.deleteConfirm': 'Delete permanently',
};

const nl: AccountPackCatalog = {
  'creator.pack.stripeUnavailable': 'Een herdenkingspakket kopen is op dit moment niet mogelijk.',
  'creator.pack.stripeUnavailableBody': 'Er is niets afgeschreven. Kom later terug.',
  'creator.pack.fallbackName': 'Herdenkingspakket',
  'creator.account.deleteTitle': 'Dit eerbetoon verwijderen?',
  'creator.account.deleteBody': '“{name}” en alles erin wordt definitief verwijderd. Dit kan niet ongedaan worden gemaakt.',
  'creator.account.deleteTypeLabel': 'Typ de naam om te bevestigen',
  'creator.account.deleteCancel': 'Annuleren',
  'creator.account.deleteConfirm': 'Definitief verwijderen',
};

const de: AccountPackCatalog = {
  'creator.pack.stripeUnavailable': 'Der Kauf eines Gedenkpakets ist derzeit nicht möglich.',
  'creator.pack.stripeUnavailableBody': 'Es wurde nichts abgebucht. Bitte versuchen Sie es später erneut.',
  'creator.pack.fallbackName': 'Gedenkpaket',
  'creator.account.deleteTitle': 'Dieses Gedenken löschen?',
  'creator.account.deleteBody': '„{name}“ und alles darin wird endgültig gelöscht. Das kann nicht rückgängig gemacht werden.',
  'creator.account.deleteTypeLabel': 'Geben Sie zur Bestätigung den Namen ein',
  'creator.account.deleteCancel': 'Abbrechen',
  'creator.account.deleteConfirm': 'Endgültig löschen',
};

const fr: AccountPackCatalog = {
  'creator.pack.stripeUnavailable': 'L’achat d’un pack mémorial n’est pas possible pour le moment.',
  'creator.pack.stripeUnavailableBody': 'Rien n’a été débité. Veuillez réessayer plus tard.',
  'creator.pack.fallbackName': 'Pack mémorial',
  'creator.account.deleteTitle': 'Supprimer cet hommage ?',
  'creator.account.deleteBody': '« {name} » et tout son contenu seront définitivement supprimés. Cette action est irréversible.',
  'creator.account.deleteTypeLabel': 'Saisissez le nom pour confirmer',
  'creator.account.deleteCancel': 'Annuler',
  'creator.account.deleteConfirm': 'Supprimer définitivement',
};

const es: AccountPackCatalog = {
  'creator.pack.stripeUnavailable': 'La compra de un paquete conmemorativo no está disponible por ahora.',
  'creator.pack.stripeUnavailableBody': 'No se ha cobrado nada. Vuelva a intentarlo más tarde.',
  'creator.pack.fallbackName': 'Paquete conmemorativo',
  'creator.account.deleteTitle': '¿Eliminar este homenaje?',
  'creator.account.deleteBody': '«{name}» y todo su contenido se eliminarán definitivamente. Esta acción no se puede deshacer.',
  'creator.account.deleteTypeLabel': 'Escriba el nombre para confirmar',
  'creator.account.deleteCancel': 'Cancelar',
  'creator.account.deleteConfirm': 'Eliminar definitivamente',
};

const pt: AccountPackCatalog = {
  'creator.pack.stripeUnavailable': 'A compra de um pacote memorial não está disponível neste momento.',
  'creator.pack.stripeUnavailableBody': 'Não foi cobrado nada. Volte a tentar mais tarde.',
  'creator.pack.fallbackName': 'Pacote memorial',
  'creator.account.deleteTitle': 'Eliminar esta homenagem?',
  'creator.account.deleteBody': '“{name}” e tudo o que contém serão eliminados definitivamente. Esta ação não pode ser anulada.',
  'creator.account.deleteTypeLabel': 'Escreva o nome para confirmar',
  'creator.account.deleteCancel': 'Cancelar',
  'creator.account.deleteConfirm': 'Eliminar definitivamente',
};

const it: AccountPackCatalog = {
  'creator.pack.stripeUnavailable': 'L’acquisto di un pacchetto commemorativo non è disponibile al momento.',
  'creator.pack.stripeUnavailableBody': 'Non è stato addebitato nulla. Riprovi più tardi.',
  'creator.pack.fallbackName': 'Pacchetto commemorativo',
  'creator.account.deleteTitle': 'Eliminare questo omaggio?',
  'creator.account.deleteBody': '«{name}» e tutto il suo contenuto verranno eliminati definitivamente. L’azione non può essere annullata.',
  'creator.account.deleteTypeLabel': 'Scriva il nome per confermare',
  'creator.account.deleteCancel': 'Annulla',
  'creator.account.deleteConfirm': 'Elimina definitivamente',
};

const pl: AccountPackCatalog = {
  'creator.pack.stripeUnavailable': 'Zakup pakietu pamiątkowego jest teraz niedostępny.',
  'creator.pack.stripeUnavailableBody': 'Nic nie zostało pobrane. Wróć później.',
  'creator.pack.fallbackName': 'Pakiet pamiątkowy',
  'creator.account.deleteTitle': 'Usunąć ten hołd?',
  'creator.account.deleteBody': '„{name}” i cała jego zawartość zostaną trwale usunięte. Tej operacji nie można cofnąć.',
  'creator.account.deleteTypeLabel': 'Wpisz nazwę, aby potwierdzić',
  'creator.account.deleteCancel': 'Anuluj',
  'creator.account.deleteConfirm': 'Usuń trwale',
};

export const accountPackDrafts: Record<Exclude<LaunchLanguage, 'en'>, AccountPackCatalog> = {
  nl,
  de,
  fr,
  es,
  pt,
  it,
  pl,
};
