/** Account delete/export recovery copy (Prompt 02/29). Native polish still XB-004. */

const keys = {
  export: 'account.export',
  exportWorking: 'account.exportWorking',
  exportFailed: 'account.exportFailed',
  exportDone: 'account.exportDone',
  delete: 'account.delete',
  deleteConfirmHint: 'account.deleteConfirmHint',
  deleteConfirmLabel: 'account.deleteConfirmLabel',
  deleteWorking: 'account.deleteWorking',
  deleteFailed: 'account.deleteFailed',
  deleteDone: 'account.deleteDone',
  deleteCancel: 'account.deleteCancel',
  workSafe: 'account.workSafe',
  deleteAccount: 'account.deleteAccount',
  deleteAccountHint: 'account.deleteAccountHint',
  deleteAccountConfirmLabel: 'account.deleteAccountConfirmLabel',
  deleteAccountWorking: 'account.deleteAccountWorking',
  deleteAccountFailed: 'account.deleteAccountFailed',
} as const;

function pack(values: Record<keyof typeof keys, string>): Record<(typeof keys)[keyof typeof keys], string> {
  const out = {} as Record<(typeof keys)[keyof typeof keys], string>;
  for (const key of Object.keys(keys) as Array<keyof typeof keys>) {
    out[keys[key]] = values[key];
  }
  return out;
}

export const accountEnExtras = pack({
  export: 'Export metadata',
  exportWorking: 'Preparing your export.',
  exportFailed: 'The export could not be prepared just now. Your tribute is still safe.',
  exportDone: 'Export downloaded.',
  delete: 'Delete tribute',
  deleteConfirmHint: 'This permanently removes this tribute and its private media from MemorialVideo.',
  deleteConfirmLabel: 'Type DELETE_TRIBUTE to confirm',
  deleteWorking: 'Deleting this tribute.',
  deleteFailed: 'We could not delete this tribute just now. Your data is still safe.',
  deleteDone: 'This tribute has been deleted.',
  deleteCancel: 'Keep tribute',
  workSafe: 'Your other tributes and account stay available.',
  deleteAccount: 'Delete account',
  deleteAccountHint:
    'This permanently removes every tribute you own and closes this account. Sign-out alone does not delete data.',
  deleteAccountConfirmLabel: 'Type DELETE_ACCOUNT to confirm',
  deleteAccountWorking: 'Deleting your account and tributes.',
  deleteAccountFailed: 'We could not delete the account just now. Your data is still safe.',
});

export const accountNl = pack({
  export: 'Metadata exporteren',
  exportWorking: 'Export wordt voorbereid.',
  exportFailed: 'De export lukte nu niet. Uw tribute is nog veilig.',
  exportDone: 'Export gedownload.',
  delete: 'Tribute verwijderen',
  deleteConfirmHint: 'Dit verwijdert deze tribute en de privémedia blijvend uit MemorialVideo.',
  deleteConfirmLabel: 'Typ DELETE_TRIBUTE om te bevestigen',
  deleteWorking: 'Tribute wordt verwijderd.',
  deleteFailed: 'Verwijderen lukte nu niet. Uw gegevens zijn nog veilig.',
  deleteDone: 'Deze tribute is verwijderd.',
  deleteCancel: 'Tribute behouden',
  workSafe: 'Uw andere tributes en account blijven beschikbaar.',
  deleteAccount: 'Account verwijderen',
  deleteAccountHint:
    'Dit verwijdert blijvend al uw tributes en sluit dit account. Afmelden alleen verwijdert geen gegevens.',
  deleteAccountConfirmLabel: 'Typ DELETE_ACCOUNT om te bevestigen',
  deleteAccountWorking: 'Account en tributes worden verwijderd.',
  deleteAccountFailed: 'Account verwijderen lukte nu niet. Uw gegevens zijn nog veilig.',
});

export const accountDe = pack({
  export: 'Metadaten exportieren',
  exportWorking: 'Export wird vorbereitet.',
  exportFailed: 'Der Export konnte gerade nicht erstellt werden. Ihr Tribute ist weiterhin sicher.',
  exportDone: 'Export heruntergeladen.',
  delete: 'Tribute löschen',
  deleteConfirmHint: 'Dadurch werden dieses Tribute und seine privaten Medien dauerhaft aus MemorialVideo entfernt.',
  deleteConfirmLabel: 'DELETE_TRIBUTE zur Bestätigung eingeben',
  deleteWorking: 'Tribute wird gelöscht.',
  deleteFailed: 'Löschen war gerade nicht möglich. Ihre Daten sind weiterhin sicher.',
  deleteDone: 'Dieses Tribute wurde gelöscht.',
  deleteCancel: 'Tribute behalten',
  workSafe: 'Ihre anderen Tributes und Ihr Konto bleiben verfügbar.',
  deleteAccount: 'Konto löschen',
  deleteAccountHint:
    'Dadurch werden alle Ihre Tributes dauerhaft entfernt und dieses Konto geschlossen. Abmelden allein löscht keine Daten.',
  deleteAccountConfirmLabel: 'DELETE_ACCOUNT zur Bestätigung eingeben',
  deleteAccountWorking: 'Konto und Tributes werden gelöscht.',
  deleteAccountFailed: 'Das Konto konnte gerade nicht gelöscht werden. Ihre Daten sind weiterhin sicher.',
});

export const accountFr = pack({
  export: 'Exporter les métadonnées',
  exportWorking: 'Préparation de l’export.',
  exportFailed: 'L’export n’a pas pu être préparé. Votre hommage est toujours en sécurité.',
  exportDone: 'Export téléchargé.',
  delete: 'Supprimer l’hommage',
  deleteConfirmHint: 'Cela supprime définitivement cet hommage et ses médias privés de MemorialVideo.',
  deleteConfirmLabel: 'Tapez DELETE_TRIBUTE pour confirmer',
  deleteWorking: 'Suppression de l’hommage.',
  deleteFailed: 'La suppression a échoué pour le moment. Vos données restent en sécurité.',
  deleteDone: 'Cet hommage a été supprimé.',
  deleteCancel: 'Conserver l’hommage',
  workSafe: 'Vos autres hommages et votre compte restent disponibles.',
  deleteAccount: 'Supprimer le compte',
  deleteAccountHint:
    'Cela supprime définitivement tous vos hommages et ferme ce compte. Se déconnecter ne supprime pas les données.',
  deleteAccountConfirmLabel: 'Tapez DELETE_ACCOUNT pour confirmer',
  deleteAccountWorking: 'Suppression du compte et des hommages.',
  deleteAccountFailed: 'Impossible de supprimer le compte pour le moment. Vos données restent en sécurité.',
});

export const accountEs = pack({
  export: 'Exportar metadatos',
  exportWorking: 'Preparando la exportación.',
  exportFailed: 'No se pudo preparar la exportación. Su tributo sigue seguro.',
  exportDone: 'Exportación descargada.',
  delete: 'Eliminar tributo',
  deleteConfirmHint: 'Esto elimina permanentemente este tributo y sus medios privados de MemorialVideo.',
  deleteConfirmLabel: 'Escriba DELETE_TRIBUTE para confirmar',
  deleteWorking: 'Eliminando este tributo.',
  deleteFailed: 'No se pudo eliminar ahora. Sus datos siguen seguros.',
  deleteDone: 'Este tributo se ha eliminado.',
  deleteCancel: 'Conservar tributo',
  workSafe: 'Sus otros tributos y su cuenta siguen disponibles.',
  deleteAccount: 'Eliminar cuenta',
  deleteAccountHint:
    'Esto elimina permanentemente todos sus tributos y cierra esta cuenta. Cerrar sesión no borra los datos.',
  deleteAccountConfirmLabel: 'Escriba DELETE_ACCOUNT para confirmar',
  deleteAccountWorking: 'Eliminando su cuenta y tributos.',
  deleteAccountFailed: 'No se pudo eliminar la cuenta ahora. Sus datos siguen seguros.',
});

export const accountPt = pack({
  export: 'Exportar metadados',
  exportWorking: 'A preparar a exportação.',
  exportFailed: 'A exportação não pôde ser preparada. O seu tributo continua seguro.',
  exportDone: 'Exportação transferida.',
  delete: 'Eliminar tributo',
  deleteConfirmHint: 'Isto remove permanentemente este tributo e os media privados do MemorialVideo.',
  deleteConfirmLabel: 'Escreva DELETE_TRIBUTE para confirmar',
  deleteWorking: 'A eliminar este tributo.',
  deleteFailed: 'Não foi possível eliminar agora. Os seus dados continuam seguros.',
  deleteDone: 'Este tributo foi eliminado.',
  deleteCancel: 'Manter tributo',
  workSafe: 'Os seus outros tributos e a conta continuam disponíveis.',
  deleteAccount: 'Eliminar conta',
  deleteAccountHint:
    'Isto remove permanentemente todos os seus tributos e encerra esta conta. Terminar sessão não apaga dados.',
  deleteAccountConfirmLabel: 'Escreva DELETE_ACCOUNT para confirmar',
  deleteAccountWorking: 'A eliminar a conta e os tributos.',
  deleteAccountFailed: 'Não foi possível eliminar a conta agora. Os seus dados continuam seguros.',
});

export const accountIt = pack({
  export: 'Esporta metadati',
  exportWorking: 'Preparazione dell’esportazione.',
  exportFailed: 'L’esportazione non è riuscita. Il tributo è ancora al sicuro.',
  exportDone: 'Esportazione scaricata.',
  delete: 'Elimina tributo',
  deleteConfirmHint: 'Questo rimuove in modo permanente questo tributo e i suoi media privati da MemorialVideo.',
  deleteConfirmLabel: 'Digita DELETE_TRIBUTE per confermare',
  deleteWorking: 'Eliminazione del tributo.',
  deleteFailed: 'Eliminazione non riuscita ora. I tuoi dati sono ancora al sicuro.',
  deleteDone: 'Questo tributo è stato eliminato.',
  deleteCancel: 'Mantieni il tributo',
  workSafe: 'Gli altri tributi e l’account restano disponibili.',
  deleteAccount: 'Elimina account',
  deleteAccountHint:
    'Questo rimuove in modo permanente tutti i tuoi tributi e chiude l’account. Uscire non cancella i dati.',
  deleteAccountConfirmLabel: 'Digita DELETE_ACCOUNT per confermare',
  deleteAccountWorking: 'Eliminazione dell’account e dei tributi.',
  deleteAccountFailed: 'Eliminazione account non riuscita ora. I tuoi dati sono ancora al sicuro.',
});

export const accountPl = pack({
  export: 'Eksportuj metadane',
  exportWorking: 'Przygotowywanie eksportu.',
  exportFailed: 'Nie udało się przygotować eksportu. Twój hołd jest nadal bezpieczny.',
  exportDone: 'Eksport pobrany.',
  delete: 'Usuń hołd',
  deleteConfirmHint: 'To trwale usuwa ten hołd i prywatne media z MemorialVideo.',
  deleteConfirmLabel: 'Wpisz DELETE_TRIBUTE, aby potwierdzić',
  deleteWorking: 'Usuwanie hołdu.',
  deleteFailed: 'Nie udało się teraz usunąć. Twoje dane są nadal bezpieczne.',
  deleteDone: 'Ten hołd został usunięty.',
  deleteCancel: 'Zachowaj hołd',
  workSafe: 'Inne hołdy i konto pozostają dostępne.',
  deleteAccount: 'Usuń konto',
  deleteAccountHint:
    'To trwale usuwa wszystkie Twoje hołdy i zamyka to konto. Wylogowanie samo w sobie nie usuwa danych.',
  deleteAccountConfirmLabel: 'Wpisz DELETE_ACCOUNT, aby potwierdzić',
  deleteAccountWorking: 'Usuwanie konta i hołdów.',
  deleteAccountFailed: 'Nie udało się teraz usunąć konta. Twoje dane są nadal bezpieczne.',
});
