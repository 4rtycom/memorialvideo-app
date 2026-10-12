/** Prompt 29 recovery UI copy for auth / collect / review (human polish still XB-004). */

const keys = {
  linkFailed: 'auth.linkFailed',
  callbackFailed: 'auth.callbackFailed',
  collectLoadFailed: 'collect.loadFailed',
  reviewLoading: 'review.loading',
  reviewFailed: 'review.failed',
  reviewCommentFailed: 'review.commentFailed',
  loadingTribute: 'wizard.loadingTribute',
  deliveryDeleteFailed: 'wizard.delivery.deleteFailed',
  tributeLoadFailed: 'wizard.tribute.loadFailed',
} as const;

function pack(values: Record<keyof typeof keys, string>): Record<(typeof keys)[keyof typeof keys], string> {
  const out = {} as Record<(typeof keys)[keyof typeof keys], string>;
  for (const key of Object.keys(keys) as Array<keyof typeof keys>) {
    out[keys[key]] = values[key];
  }
  return out;
}

export const recoveryUiNl = pack({
  linkFailed: 'We konden zojuist geen aanmeldlink sturen.',
  callbackFailed: 'Deze aanmeldlink is niet meer geldig.',
  collectLoadFailed: 'Collectielinks laden lukte nu niet.',
  reviewLoading: 'De beoordelingslink wordt geopend…',
  reviewFailed: 'Deze beoordelingslink openen lukte nu niet.',
  reviewCommentFailed: 'De notitie kon zojuist niet worden verzonden. De voorvertoning blijft staan.',
  loadingTribute: 'Uw tribute wordt geopend…',
  deliveryDeleteFailed: 'Dit memorial verwijderen lukte nu niet. Uw gegevens zijn nog veilig.',
  tributeLoadFailed: 'Dit eerbetoon laden lukte nu niet.',
});

export const recoveryUiDe = pack({
  linkFailed: 'Wir konnten gerade keinen Anmeldelink senden.',
  callbackFailed: 'Dieser Anmeldelink ist nicht mehr gültig.',
  collectLoadFailed: 'Sammellinks konnten gerade nicht geladen werden.',
  reviewLoading: 'Prüflink wird geöffnet…',
  reviewFailed: 'Dieser Prüflink konnte gerade nicht geöffnet werden.',
  reviewCommentFailed: 'Die Notiz konnte gerade nicht gesendet werden. Die Vorschau bleibt erhalten.',
  loadingTribute: 'Ihr Tribute wird geöffnet…',
  deliveryDeleteFailed: 'Dieses Memorial konnte gerade nicht gelöscht werden. Ihre Daten sind weiterhin sicher.',
  tributeLoadFailed: 'Dieses Andenken konnte gerade nicht geladen werden.',
});

export const recoveryUiFr = pack({
  linkFailed: 'Nous n’avons pas pu envoyer de lien de connexion.',
  callbackFailed: 'Ce lien de connexion n’est plus valide.',
  collectLoadFailed: 'Impossible de charger les liens de collecte.',
  reviewLoading: 'Ouverture du lien de relecture…',
  reviewFailed: 'Impossible d’ouvrir ce lien de relecture.',
  reviewCommentFailed: 'La note n’a pas pu être envoyée. L’aperçu est toujours là.',
  loadingTribute: 'Ouverture de votre hommage…',
  deliveryDeleteFailed: 'Impossible de supprimer cet hommage pour le moment. Vos données restent en sécurité.',
  tributeLoadFailed: 'Impossible de charger cet hommage pour le moment.',
});

export const recoveryUiEs = pack({
  linkFailed: 'No pudimos enviar un enlace de acceso ahora.',
  callbackFailed: 'Este enlace de acceso ya no es válido.',
  collectLoadFailed: 'No pudimos cargar los enlaces de recogida.',
  reviewLoading: 'Abriendo el enlace de revisión…',
  reviewFailed: 'No pudimos abrir este enlace de revisión.',
  reviewCommentFailed: 'No se pudo enviar la nota. La vista previa sigue aquí.',
  loadingTribute: 'Abriendo su tributo…',
  deliveryDeleteFailed: 'No se pudo eliminar este memorial ahora. Sus datos siguen seguros.',
  tributeLoadFailed: 'No se pudo cargar este tributo ahora.',
});

export const recoveryUiPt = pack({
  linkFailed: 'Não foi possível enviar um link de início de sessão.',
  callbackFailed: 'Este link de início de sessão já não é válido.',
  collectLoadFailed: 'Não foi possível carregar os links de recolha.',
  reviewLoading: 'A abrir o link de revisão…',
  reviewFailed: 'Não foi possível abrir este link de revisão.',
  reviewCommentFailed: 'A nota não pôde ser enviada. A pré-visualização continua aqui.',
  loadingTribute: 'A abrir o seu tributo…',
  deliveryDeleteFailed: 'Não foi possível eliminar este memorial agora. Os seus dados continuam seguros.',
  tributeLoadFailed: 'Não foi possível carregar este tributo agora.',
});

export const recoveryUiIt = pack({
  linkFailed: 'Non è stato possibile inviare un link di accesso.',
  callbackFailed: 'Questo link di accesso non è più valido.',
  collectLoadFailed: 'Non è stato possibile caricare i link di raccolta.',
  reviewLoading: 'Apertura del link di revisione…',
  reviewFailed: 'Non è stato possibile aprire questo link di revisione.',
  reviewCommentFailed: 'La nota non è stata inviata. L’anteprima resta qui.',
  loadingTribute: 'Apertura del tuo tributo…',
  deliveryDeleteFailed: 'Eliminazione del memorial non riuscita ora. I tuoi dati sono ancora al sicuro.',
  tributeLoadFailed: 'Non è stato possibile caricare questo tributo ora.',
});

export const recoveryUiPl = pack({
  linkFailed: 'Nie udało się teraz wysłać linku logowania.',
  callbackFailed: 'Ten link logowania jest już nieważny.',
  collectLoadFailed: 'Nie udało się wczytać linków zbierania.',
  reviewLoading: 'Otwieranie linku przeglądu…',
  reviewFailed: 'Nie udało się otworzyć tego linku przeglądu.',
  reviewCommentFailed: 'Nie udało się wysłać notatki. Podgląd nadal jest dostępny.',
  loadingTribute: 'Otwieranie Twojego hołdu…',
  deliveryDeleteFailed: 'Nie udało się teraz usunąć tego memorialu. Twoje dane są nadal bezpieczne.',
  tributeLoadFailed: 'Nie udało się teraz wczytać tego hołdu.',
});
