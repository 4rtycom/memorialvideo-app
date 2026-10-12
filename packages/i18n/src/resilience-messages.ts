/** Locale draft strings for Prompt 26/29 network + recovery (human polish still XB-004). */

const keys = {
  offline: 'network.offline',
  offlineSafe: 'network.offlineSafe',
  budgetRender: 'usage.budget.render',
  budgetEnhancement: 'usage.budget.enhancement',
  budgetUpload: 'usage.budget.upload',
  budgetBusy: 'usage.budget.busy',
  inviteExpired: 'recovery.inviteExpired',
  inviteRevoked: 'recovery.inviteRevoked',
  unauthorized: 'recovery.unauthorized',
  renderFailed: 'recovery.renderFailed',
  workSafe: 'recovery.workSafe',
} as const;

function pack(values: Record<keyof typeof keys, string>): Record<(typeof keys)[keyof typeof keys], string> {
  const out = {} as Record<(typeof keys)[keyof typeof keys], string>;
  for (const key of Object.keys(keys) as Array<keyof typeof keys>) {
    out[keys[key]] = values[key];
  }
  return out;
}

export const resilienceNl = pack({
  offline: 'U bent offline. Uploads en renders wachten tot de verbinding terug is.',
  offlineSafe: 'Uw concept op dit apparaat blijft bewaard.',
  budgetRender: 'Er zijn vandaag genoeg ceremonie-renders aangevraagd. Probeer het morgen opnieuw.',
  budgetEnhancement: 'Er zijn vandaag genoeg verbeteringen aangevraagd. Probeer het later opnieuw.',
  budgetUpload: 'De uploadlimiet voor vandaag is bereikt.',
  budgetBusy: 'Er lopen al genoeg taken. Wacht even tot één klaar is.',
  inviteExpired: 'Deze uitnodiging is verlopen.',
  inviteRevoked: 'Deze uitnodiging is ingetrokken.',
  unauthorized: 'U heeft geen toegang tot deze herdenking.',
  renderFailed: 'De ceremonie-film kon nu niet worden gemaakt. Uw ontwerp is veilig.',
  workSafe: 'Uw werk is bewaard. U kunt veilig opnieuw proberen.',
});

export const resilienceDe = pack({
  offline: 'Sie sind offline. Uploads und Renders warten, bis die Verbindung zurückkehrt.',
  offlineSafe: 'Ihr Entwurf auf diesem Gerät bleibt erhalten.',
  budgetRender: 'Für heute sind genug Zeremonie-Renders angefordert. Bitte morgen erneut versuchen.',
  budgetEnhancement: 'Für heute sind genug Verbesserungen angefordert. Bitte später erneut versuchen.',
  budgetUpload: 'Das Upload-Limit für heute ist erreicht.',
  budgetBusy: 'Es laufen bereits genug Aufgaben. Bitte warten Sie kurz.',
  inviteExpired: 'Diese Einladung ist abgelaufen.',
  inviteRevoked: 'Diese Einladung wurde widerrufen.',
  unauthorized: 'Sie haben keinen Zugang zu diesem Gedenken.',
  renderFailed: 'Der Zeremoniefilm konnte jetzt nicht erstellt werden. Ihr Entwurf ist sicher.',
  workSafe: 'Ihre Arbeit ist gespeichert. Sie können ruhig erneut versuchen.',
});

export const resilienceFr = pack({
  offline: 'Vous êtes hors ligne. Les envois et rendus attendront le retour de la connexion.',
  offlineSafe: 'Votre brouillon sur cet appareil est conservé.',
  budgetRender: 'Assez de rendus de cérémonie ont été demandés aujourd’hui. Réessayez demain.',
  budgetEnhancement: 'Assez d’améliorations ont été demandées aujourd’hui. Réessayez plus tard.',
  budgetUpload: 'La limite d’envoi du jour est atteinte.',
  budgetBusy: 'Assez de tâches sont déjà en cours. Patientez un moment.',
  inviteExpired: 'Cette invitation a expiré.',
  inviteRevoked: 'Cette invitation a été révoquée.',
  unauthorized: 'Vous n’avez pas accès à cet hommage.',
  renderFailed: 'Le film de cérémonie n’a pas pu être créé maintenant. Votre projet est en sécurité.',
  workSafe: 'Votre travail est enregistré. Vous pouvez réessayer sereinement.',
});

export const resilienceEs = pack({
  offline: 'Está sin conexión. Las subidas y renders esperarán a que vuelva la red.',
  offlineSafe: 'Su borrador en este dispositivo se conserva.',
  budgetRender: 'Ya se pidieron suficientes renders de ceremonia hoy. Inténtelo mañana.',
  budgetEnhancement: 'Ya se pidieron suficientes mejoras hoy. Inténtelo más tarde.',
  budgetUpload: 'Se alcanzó el límite de subidas de hoy.',
  budgetBusy: 'Ya hay suficientes tareas en curso. Espere un momento.',
  inviteExpired: 'Esta invitación ha caducado.',
  inviteRevoked: 'Esta invitación fue revocada.',
  unauthorized: 'No tiene acceso a este homenaje.',
  renderFailed: 'La película de ceremonia no pudo crearse ahora. Su diseño está a salvo.',
  workSafe: 'Su trabajo está guardado. Puede volver a intentarlo con calma.',
});

export const resiliencePt = pack({
  offline: 'Está offline. Os envios e renders esperam pelo regresso da ligação.',
  offlineSafe: 'O seu rascunho neste dispositivo mantém-se.',
  budgetRender: 'Já foram pedidos renders de cerimónia suficientes hoje. Tente amanhã.',
  budgetEnhancement: 'Já foram pedidas melhorias suficientes hoje. Tente mais tarde.',
  budgetUpload: 'O limite de envios de hoje foi atingido.',
  budgetBusy: 'Já há tarefas suficientes em curso. Aguarde um momento.',
  inviteExpired: 'Este convite expirou.',
  inviteRevoked: 'Este convite foi revogado.',
  unauthorized: 'Não tem acesso a esta homenagem.',
  renderFailed: 'O filme da cerimónia não pôde ser criado agora. O seu projeto está seguro.',
  workSafe: 'O seu trabalho está guardado. Pode tentar novamente com calma.',
});

export const resilienceIt = pack({
  offline: 'Sei offline. Caricamenti e render attendono il ritorno della connessione.',
  offlineSafe: 'La bozza su questo dispositivo resta salvata.',
  budgetRender: 'Oggi sono stati richiesti abbastanza render della cerimonia. Riprova domani.',
  budgetEnhancement: 'Oggi sono stati richiesti abbastanza miglioramenti. Riprova più tardi.',
  budgetUpload: 'Il limite di caricamenti di oggi è raggiunto.',
  budgetBusy: 'Ci sono già abbastanza attività in corso. Attendi un momento.',
  inviteExpired: 'Questo invito è scaduto.',
  inviteRevoked: 'Questo invito è stato revocato.',
  unauthorized: 'Non hai accesso a questo ricordo.',
  renderFailed: 'Il film della cerimonia non può essere creato ora. Il progetto è al sicuro.',
  workSafe: 'Il tuo lavoro è salvato. Puoi riprovare con calma.',
});

export const resiliencePl = pack({
  offline: 'Jesteś offline. Przesyłanie i renderowanie poczekają na połączenie.',
  offlineSafe: 'Szkic na tym urządzeniu pozostaje zapisany.',
  budgetRender: 'Dziś zlecono już wystarczająco renderów ceremonialnych. Spróbuj jutro.',
  budgetEnhancement: 'Dziś zlecono już wystarczająco poprawek. Spróbuj później.',
  budgetUpload: 'Osiągnięto dzisiejszy limit przesyłania.',
  budgetBusy: 'Trwa już wystarczająco dużo zadań. Poczekaj chwilę.',
  inviteExpired: 'To zaproszenie wygasło.',
  inviteRevoked: 'To zaproszenie zostało unieważnione.',
  unauthorized: 'Nie masz dostępu do tego wspomnienia.',
  renderFailed: 'Filmu ceremonialnego nie udało się teraz utworzyć. Twój projekt jest bezpieczny.',
  workSafe: 'Twoja praca jest zapisana. Możesz spokojnie spróbować ponownie.',
});
