/** Locale draft strings for Prompt 17/18 render + share/download (human polish still XB-004). */

const keys = {
  renderStale: 'wizard.render.stale',
  renderRequestFinal: 'wizard.render.requestFinal',
  renderFinalReady: 'wizard.render.finalReady',
  renderEntitlementRequired: 'wizard.render.entitlementRequired',
  renderMeta: 'wizard.render.meta',
  shareCreateScreening: 'wizard.share.createScreening',
  shareScreeningCreated: 'wizard.share.screeningCreated',
  shareRevoke: 'wizard.share.revoke',
  shareRevoked: 'wizard.share.revoked',
  shareListEmpty: 'wizard.share.listEmpty',
  screeningTitle: 'screening.title',
  screeningBody: 'screening.body',
  screeningInvalid: 'screening.invalid',
} as const;

function pack(values: Record<keyof typeof keys, string>): Record<(typeof keys)[keyof typeof keys], string> {
  const out = {} as Record<(typeof keys)[keyof typeof keys], string>;
  for (const key of Object.keys(keys) as Array<keyof typeof keys>) {
    out[keys[key]] = values[key];
  }
  return out;
}

export const deliveryNl = pack({
  renderStale: 'De film is gewijzigd — maak een bijgewerkte ceremonie-kopie',
  renderRequestFinal: 'Maak de ceremonie-film',
  renderFinalReady: 'De ceremonie-film is klaar om te downloaden of privé te delen',
  renderEntitlementRequired: 'Memorial Pack is nodig voor de ceremonie-film en privévelink',
  renderMeta: 'Lengte {length} · {resolution} · {aspect} · {status}',
  shareCreateScreening: 'Privé-kijklink maken',
  shareScreeningCreated: 'Kopieer deze privé-kijklink één keer. Hij wordt niet als platte tekst bewaard.',
  shareRevoke: 'Link intrekken',
  shareRevoked: 'Kijklink ingetrokken',
  shareListEmpty: 'Nog geen deel-links',
  screeningTitle: 'Privé-vertoning',
  screeningBody: 'Een rustige weergave van de ceremonie-film. Downloaden is hier niet beschikbaar.',
  screeningInvalid: 'Deze kijklink is ongeldig of verlopen.',
});

export const deliveryDe = pack({
  renderStale: 'Der Film hat sich geändert — erstellen Sie eine aktualisierte Zeremonie-Kopie',
  renderRequestFinal: 'Den Zeremoniefilm erstellen',
  renderFinalReady: 'Der Zeremoniefilm ist bereit zum Download oder privaten Teilen',
  renderEntitlementRequired: 'Memorial Pack ist für den Zeremoniefilm und den privaten Link nötig',
  renderMeta: 'Länge {length} · {resolution} · {aspect} · {status}',
  shareCreateScreening: 'Privaten Vorführlink erstellen',
  shareScreeningCreated: 'Kopieren Sie diesen privaten Vorführlink einmal. Er wird nicht als Klartext gespeichert.',
  shareRevoke: 'Link widerrufen',
  shareRevoked: 'Vorführlink widerrufen',
  shareListEmpty: 'Noch keine Freigabelinks',
  screeningTitle: 'Private Vorführung',
  screeningBody: 'Eine ruhige Wiedergabe des Zeremoniefilms. Download ist hier nicht verfügbar.',
  screeningInvalid: 'Dieser Vorführlink ist ungültig oder abgelaufen.',
});

export const deliveryFr = pack({
  renderStale: 'Le film a changé — créez une copie de cérémonie à jour',
  renderRequestFinal: 'Créer le film de cérémonie',
  renderFinalReady: 'Le film de cérémonie est prêt à télécharger ou partager en privé',
  renderEntitlementRequired: 'Memorial Pack est requis pour le film de cérémonie et le lien privé',
  renderMeta: 'Durée {length} · {resolution} · {aspect} · {status}',
  shareCreateScreening: 'Créer un lien de visionnage privé',
  shareScreeningCreated: 'Copiez ce lien de visionnage privé une fois. Il n’est pas conservé en clair.',
  shareRevoke: 'Révoquer le lien',
  shareRevoked: 'Lien de visionnage révoqué',
  shareListEmpty: 'Aucun lien de partage pour le moment',
  screeningTitle: 'Projection privée',
  screeningBody: 'Une lecture calme du film de cérémonie. Le téléchargement n’est pas disponible ici.',
  screeningInvalid: 'Ce lien de visionnage est invalide ou expiré.',
});

export const deliveryEs = pack({
  renderStale: 'La película cambió — cree una copia actualizada para la ceremonia',
  renderRequestFinal: 'Crear la película de ceremonia',
  renderFinalReady: 'La película de ceremonia está lista para descargar o compartir en privado',
  renderEntitlementRequired: 'Se necesita Memorial Pack para la película de ceremonia y el enlace privado',
  renderMeta: 'Duración {length} · {resolution} · {aspect} · {status}',
  shareCreateScreening: 'Crear enlace de visionado privado',
  shareScreeningCreated: 'Copie este enlace de visionado privado una vez. No se guarda en texto plano.',
  shareRevoke: 'Revocar enlace',
  shareRevoked: 'Enlace de visionado revocado',
  shareListEmpty: 'Aún no hay enlaces para compartir',
  screeningTitle: 'Proyección privada',
  screeningBody: 'Una reproducción tranquila de la película de ceremonia. La descarga no está disponible aquí.',
  screeningInvalid: 'Este enlace de visionado no es válido o ha caducado.',
});

export const deliveryPt = pack({
  renderStale: 'O filme mudou — crie uma cópia atualizada para a cerimónia',
  renderRequestFinal: 'Criar o filme da cerimónia',
  renderFinalReady: 'O filme da cerimónia está pronto para transferir ou partilhar em privado',
  renderEntitlementRequired: 'É preciso Memorial Pack para o filme da cerimónia e o link privado',
  renderMeta: 'Duração {length} · {resolution} · {aspect} · {status}',
  shareCreateScreening: 'Criar ligação de visionamento privado',
  shareScreeningCreated: 'Copie esta ligação de visionamento privado uma vez. Não é guardada em texto simples.',
  shareRevoke: 'Revogar ligação',
  shareRevoked: 'Ligação de visionamento revogada',
  shareListEmpty: 'Ainda sem ligações de partilha',
  screeningTitle: 'Projeção privada',
  screeningBody: 'Uma reprodução calma do filme da cerimónia. A transferência não está disponível aqui.',
  screeningInvalid: 'Esta ligação de visionamento é inválida ou expirou.',
});

export const deliveryIt = pack({
  renderStale: 'Il film è cambiato — create una copia aggiornata per la cerimonia',
  renderRequestFinal: 'Crea il film della cerimonia',
  renderFinalReady: 'Il film della cerimonia è pronto da scaricare o condividere in privato',
  renderEntitlementRequired: 'Serve Memorial Pack per il film della cerimonia e il link privato',
  renderMeta: 'Durata {length} · {resolution} · {aspect} · {status}',
  shareCreateScreening: 'Crea link di visione privata',
  shareScreeningCreated: 'Copiate questo link di visione privata una volta. Non viene salvato in chiaro.',
  shareRevoke: 'Revoca link',
  shareRevoked: 'Link di visione revocato',
  shareListEmpty: 'Ancora nessun link di condivisione',
  screeningTitle: 'Proiezione privata',
  screeningBody: 'Una riproduzione calma del film della cerimonia. Il download non è disponibile qui.',
  screeningInvalid: 'Questo link di visione non è valido o è scaduto.',
});

export const deliveryPl = pack({
  renderStale: 'Film się zmienił — utwórz zaktualizowaną kopię na ceremonię',
  renderRequestFinal: 'Utwórz film ceremonialny',
  renderFinalReady: 'Film ceremonialny jest gotowy do pobrania lub prywatnego udostępnienia',
  renderEntitlementRequired: 'Memorial Pack jest potrzebny do filmu ceremonialnego i prywatnego linku',
  renderMeta: 'Długość {length} · {resolution} · {aspect} · {status}',
  shareCreateScreening: 'Utwórz prywatny link do oglądania',
  shareScreeningCreated: 'Skopiuj ten prywatny link do oglądania raz. Nie jest przechowywany jako zwykły tekst.',
  shareRevoke: 'Unieważnij link',
  shareRevoked: 'Link do oglądania unieważniony',
  shareListEmpty: 'Brak jeszcze linków udostępniania',
  screeningTitle: 'Prywatny pokaz',
  screeningBody: 'Spokojne odtwarzanie filmu ceremonialnego. Pobieranie nie jest tu dostępne.',
  screeningInvalid: 'Ten link do oglądania jest nieprawidłowy lub wygasł.',
});
