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
  'creator.music.songMomentsLabel',
  'creator.account.signInHint',
  'creator.ceremony.videoMissing',
  'creator.ceremony.offlineHint',
  'creator.memories.emptyBody',
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
  'creator.music.songMomentsLabel': 'Song moments',
  'creator.account.signInHint': 'Sign in to keep your tributes together and come back to them on any device.',
  'creator.ceremony.videoMissing': 'The film file was not found. Keep the .mp4 in the same folder as this page.',
  'creator.ceremony.offlineHint': 'One operator. Guests see the display above. No internet required.',
  'creator.memories.emptyBody': 'Use the button above to add the first photo or video. Nothing is shown to anyone else.',
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
  'creator.music.songMomentsLabel': 'Muziekmomenten',
  'creator.account.signInHint': 'Meld je aan om je eerbetonen bij elkaar te houden en er op elk apparaat op terug te komen.',
  'creator.ceremony.videoMissing': 'Het filmbestand is niet gevonden. Bewaar de .mp4 in dezelfde map als deze pagina.',
  'creator.ceremony.offlineHint': 'Eén bediener. Gasten zien het scherm hierboven. Geen internet nodig.',
  'creator.memories.emptyBody': 'Gebruik de knop hierboven om de eerste foto of video toe te voegen. Er wordt niets met anderen gedeeld.',
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
  'creator.music.songMomentsLabel': 'Musikmomente',
  'creator.account.signInHint': 'Melden Sie sich an, um Ihre Gedenkseiten zusammenzuhalten und auf jedem Gerät wieder aufzurufen.',
  'creator.ceremony.videoMissing': 'Die Filmdatei wurde nicht gefunden. Die .mp4 muss im selben Ordner wie diese Seite liegen.',
  'creator.ceremony.offlineHint': 'Eine Person bedient. Gäste sehen die Anzeige oben. Kein Internet nötig.',
  'creator.memories.emptyBody': 'Fügen Sie mit der Schaltfläche oben das erste Foto oder Video hinzu. Niemand sonst sieht etwas davon.',
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
  'creator.music.songMomentsLabel': 'Moments musicaux',
  'creator.account.signInHint': 'Connectez-vous pour garder vos hommages ensemble et les retrouver sur n’importe quel appareil.',
  'creator.ceremony.videoMissing': 'Le fichier du film est introuvable. Gardez le .mp4 dans le même dossier que cette page.',
  'creator.ceremony.offlineHint': 'Un seul opérateur. Les invités voient l’écran ci-dessus. Aucune connexion internet requise.',
  'creator.memories.emptyBody': 'Utilisez le bouton ci-dessus pour ajouter la première photo ou vidéo. Rien n’est montré à d’autres personnes.',
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
  'creator.music.songMomentsLabel': 'Momentos musicales',
  'creator.account.signInHint': 'Inicie sesión para conservar sus homenajes juntos y volver a ellos desde cualquier dispositivo.',
  'creator.ceremony.videoMissing': 'No se encuentra el archivo de la película. Mantenga el .mp4 en la misma carpeta que esta página.',
  'creator.ceremony.offlineHint': 'Un solo operador. Los invitados ven la pantalla de arriba. No necesita internet.',
  'creator.memories.emptyBody': 'Use el botón de arriba para añadir la primera foto o vídeo. No se muestra nada a nadie más.',
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
  'creator.music.songMomentsLabel': 'Momentos musicais',
  'creator.account.signInHint': 'Inicie sessão para manter as suas homenagens juntas e voltar a elas em qualquer dispositivo.',
  'creator.ceremony.videoMissing': 'O ficheiro do filme não foi encontrado. Mantenha o .mp4 na mesma pasta que esta página.',
  'creator.ceremony.offlineHint': 'Um só operador. Os convidados veem o ecrã acima. Não precisa de internet.',
  'creator.memories.emptyBody': 'Use o botão acima para adicionar a primeira foto ou vídeo. Nada é mostrado a mais ninguém.',
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
  'creator.music.songMomentsLabel': 'Momenti musicali',
  'creator.account.signInHint': 'Acceda per tenere insieme i suoi omaggi e ritrovarli su qualsiasi dispositivo.',
  'creator.ceremony.videoMissing': 'File del film non trovato. Tenga il .mp4 nella stessa cartella di questa pagina.',
  'creator.ceremony.offlineHint': 'Un solo operatore. Gli ospiti vedono lo schermo sopra. Non serve internet.',
  'creator.memories.emptyBody': 'Usi il pulsante qui sopra per aggiungere la prima foto o il primo video. Nulla viene mostrato ad altri.',
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
  'creator.music.songMomentsLabel': 'Momenty muzyczne',
  'creator.account.signInHint': 'Zaloguj się, aby mieć wszystkie hołdy w jednym miejscu i wracać do nich na każdym urządzeniu.',
  'creator.ceremony.videoMissing': 'Nie znaleziono pliku filmu. Plik .mp4 musi być w tym samym folderze co ta strona.',
  'creator.ceremony.offlineHint': 'Jeden operator. Goście widzą ekran powyżej. Internet nie jest potrzebny.',
  'creator.memories.emptyBody': 'Użyj przycisku powyżej, aby dodać pierwsze zdjęcie lub film. Nikt inny niczego nie zobaczy.',
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
