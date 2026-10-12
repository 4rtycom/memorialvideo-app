import { LAUNCH_LANGUAGES, type LaunchLanguage } from '@memorialvideo/contracts';

export const EMAIL_TEMPLATES = [
  'magic_link',
  'render_ready',
  'payment_received',
  'deletion_started',
  'collection_reminder',
  'family_invitation',
  'contributor_invitation',
  'contribution_received',
  'film_ready',
  'processing_attention',
  'private_screening_invitation',
] as const;
export type EmailTemplate = (typeof EMAIL_TEMPLATES)[number];

export type EmailMessage = {
  template: EmailTemplate;
  locale: LaunchLanguage;
  subject: string;
  preview: string;
  body: string;
};

type LocaleCopy = { subject: string; preview: string; body: string };

function allLocales(en: LocaleCopy, rest: Omit<Record<LaunchLanguage, LocaleCopy>, 'en'>): Record<LaunchLanguage, LocaleCopy> {
  return { en, ...rest };
}

const COPY: Record<EmailTemplate, Record<LaunchLanguage, LocaleCopy>> = {
  magic_link: {
    en: {
      subject: 'Your MemorialVideo sign-in link',
      preview: 'A single-use link to continue your memorial.',
      body: 'Open this link on the same device if you can. It expires soon. We will never ask for a password in email.',
    },
    nl: { subject: 'Uw aanmeldlink', preview: 'Een eenmalige link.', body: 'Open de link. Hij verloopt snel.' },
    de: { subject: 'Ihr Anmeldelink', preview: 'Einmaliger Link.', body: 'Öffnen Sie den Link. Er läuft bald ab.' },
    fr: { subject: 'Votre lien de connexion', preview: 'Lien à usage unique.', body: 'Ouvrez le lien. Il expire bientôt.' },
    es: { subject: 'Su enlace de acceso', preview: 'Un solo uso.', body: 'Abra el enlace. Caduca pronto.' },
    pt: { subject: 'A sua ligação de acesso', preview: 'Uma só utilização.', body: 'Abra a ligação. Expira em breve.' },
    it: { subject: 'Il tuo link di accesso', preview: 'Uso singolo.', body: 'Apri il link. Scade a breve.' },
    pl: { subject: 'Twój link logowania', preview: 'Jednorazowy link.', body: 'Otwórz link. Wkrótce wygaśnie.' },
  },
  render_ready: {
    en: {
      subject: 'Your tribute video is ready',
      preview: 'A verified 1080p file is waiting in your memorial.',
      body: 'Sign in to download it. Play the file on the ceremony computer before guests arrive.',
    },
    nl: { subject: 'Uw video is klaar', preview: 'Een gecontroleerd 1080p-bestand.', body: 'Meld u aan om te downloaden.' },
    de: { subject: 'Ihr Video ist fertig', preview: 'Geprüfte 1080p-Datei.', body: 'Melden Sie sich zum Download an.' },
    fr: { subject: 'Votre vidéo est prête', preview: 'Fichier 1080p vérifié.', body: 'Connectez-vous pour le télécharger.' },
    es: { subject: 'Su vídeo está listo', preview: 'Archivo 1080p verificado.', body: 'Inicie sesión para descargarlo.' },
    pt: { subject: 'O seu vídeo está pronto', preview: 'Ficheiro 1080p verificado.', body: 'Inicie sessão para transferir.' },
    it: { subject: 'Il video è pronto', preview: 'File 1080p verificato.', body: 'Accedi per scaricarlo.' },
    pl: { subject: 'Film jest gotowy', preview: 'Zweryfikowany plik 1080p.', body: 'Zaloguj się, aby pobrać.' },
  },
  payment_received: {
    en: {
      subject: 'We received your payment',
      preview: 'The final video unlocks after this confirmation, not after a browser redirect.',
      body: 'If the tribute is not unlocked yet, wait a moment and refresh. Do not pay again.',
    },
    nl: { subject: 'We hebben uw betaling ontvangen', preview: 'De video wordt hierna ontgrendeld.', body: 'Niet opnieuw betalen.' },
    de: { subject: 'Zahlung erhalten', preview: 'Das Video wird danach freigeschaltet.', body: 'Bitte nicht erneut zahlen.' },
    fr: { subject: 'Paiement reçu', preview: 'La vidéo sera déverrouillée ensuite.', body: 'Ne payez pas une seconde fois.' },
    es: { subject: 'Hemos recibido el pago', preview: 'El vídeo se desbloqueará después.', body: 'No vuelva a pagar.' },
    pt: { subject: 'Recebemos o pagamento', preview: 'O vídeo será desbloqueado a seguir.', body: 'Não pague outra vez.' },
    it: { subject: 'Pagamento ricevuto', preview: 'Il video si sblocca dopo.', body: 'Non pagare di nuovo.' },
    pl: { subject: 'Otrzymaliśmy płatność', preview: 'Film odblokuje się po tym.', body: 'Nie płać ponownie.' },
  },
  deletion_started: {
    en: {
      subject: 'Your memorial is being deleted',
      preview: 'Photos, video and the tribute will become unavailable.',
      body: 'This cannot be undone from the website. Contact support only if you did not ask for this.',
    },
    nl: { subject: 'Uw herdenking wordt verwijderd', preview: 'Foto’s en video verdwijnen.', body: 'Dit kan niet ongedaan.' },
    de: { subject: 'Ihr Gedenken wird gelöscht', preview: 'Fotos und Video werden entfernt.', body: 'Das ist endgültig.' },
    fr: { subject: 'Votre hommage est en cours de suppression', preview: 'Photos et vidéo disparaîtront.', body: 'Irréversible.' },
    es: { subject: 'Se está eliminando su homenaje', preview: 'Fotos y vídeo dejarán de estar.', body: 'No se puede deshacer.' },
    pt: { subject: 'A homenagem está a ser apagada', preview: 'Fotos e vídeo desaparecem.', body: 'Não é reversível.' },
    it: { subject: 'Il ricordo è in eliminazione', preview: 'Foto e video non saranno più disponibili.', body: 'Irreversibile.' },
    pl: { subject: 'Wspomnienie jest usuwane', preview: 'Zdjęcia i film znikną.', body: 'Tego nie cofniemy.' },
  },
  collection_reminder: {
    en: {
      subject: 'Family uploads close soon',
      preview: 'The collection window for this memorial is almost over.',
      body: 'If relatives still have photographs, ask them to add them before the collection closes. The link you already shared still works until then.',
    },
    nl: {
      subject: 'Uploads sluiten binnenkort',
      preview: 'De verzamelperiode is bijna voorbij.',
      body: 'Vraag familie nog foto’s toe te voegen voordat de verzameling sluit.',
    },
    de: {
      subject: 'Uploads schließen bald',
      preview: 'Das Sammelfenster endet bald.',
      body: 'Bitten Sie Angehörige, Fotos hinzuzufügen, bevor die Sammlung schließt.',
    },
    fr: {
      subject: 'Les envois se ferment bientôt',
      preview: 'La collecte se termine bientôt.',
      body: 'Demandez à la famille d’ajouter des photos avant la fermeture.',
    },
    es: {
      subject: 'Las subidas cierran pronto',
      preview: 'La recogida termina pronto.',
      body: 'Pida a la familia que añada fotos antes de que cierre la recopilación.',
    },
    pt: {
      subject: 'Os envios fecham em breve',
      preview: 'A recolha termina em breve.',
      body: 'Peça à família para adicionar fotografias antes do fecho.',
    },
    it: {
      subject: 'I caricamenti chiudono presto',
      preview: 'La raccolta sta per chiudere.',
      body: 'Chiedete alla famiglia di aggiungere foto prima della chiusura.',
    },
    pl: {
      subject: 'Wysyłanie zdjęć wkrótce się kończy',
      preview: 'Okno zbiórki prawie minęło.',
      body: 'Poproś rodzinę o dodanie zdjęć zanim zbiórka się zamknie.',
    },
  },
  family_invitation: allLocales(
    {
      subject: 'You are invited to help with a memorial',
      preview: 'A family member invited you to collaborate.',
      body: 'Sign in with this invitation to help arrange the tribute. You will not see private notes unless they are shared with you.',
    },
    {
      nl: { subject: 'U bent uitgenodigd voor een herdenking', preview: 'Familie nodigt u uit.', body: 'Meld u aan via deze uitnodiging om te helpen.' },
      de: { subject: 'Sie sind zu einem Gedenken eingeladen', preview: 'Ein Angehöriger lädt Sie ein.', body: 'Melden Sie sich über diese Einladung an.' },
      fr: { subject: 'Vous êtes invité à un hommage', preview: 'Un proche vous invite.', body: 'Connectez-vous avec cette invitation pour aider.' },
      es: { subject: 'Le invitan a un homenaje', preview: 'Un familiar le invita.', body: 'Inicie sesión con esta invitación para ayudar.' },
      pt: { subject: 'Foi convidado para uma homenagem', preview: 'Um familiar convida-o.', body: 'Inicie sessão com este convite para ajudar.' },
      it: { subject: 'Sei invitato a un ricordo', preview: 'Un familiare ti invita.', body: 'Accedi con questo invito per aiutare.' },
      pl: { subject: 'Zaproszenie do wspomnienia', preview: 'Bliska osoba Cię zaprasza.', body: 'Zaloguj się tym zaproszeniem, aby pomóc.' },
    },
  ),
  contributor_invitation: allLocales(
    {
      subject: 'Add photographs to a memorial',
      preview: 'A private link for family photographs.',
      body: 'Use the link you were given to add photographs. You do not need an account. Filenames stay private.',
    },
    {
      nl: { subject: 'Voeg foto’s toe aan een herdenking', preview: 'Een privélink voor familie.', body: 'Gebruik de link om foto’s toe te voegen. Geen account nodig.' },
      de: { subject: 'Fotos zu einem Gedenken hinzufügen', preview: 'Privater Link für die Familie.', body: 'Nutzen Sie den Link, um Fotos hinzuzufügen. Kein Konto nötig.' },
      fr: { subject: 'Ajouter des photos à un hommage', preview: 'Lien privé pour la famille.', body: 'Utilisez le lien pour ajouter des photos. Pas de compte requis.' },
      es: { subject: 'Añadir fotos a un homenaje', preview: 'Enlace privado para la familia.', body: 'Use el enlace para añadir fotos. No necesita cuenta.' },
      pt: { subject: 'Adicionar fotografias a uma homenagem', preview: 'Ligação privada para a família.', body: 'Use a ligação para adicionar fotografias. Sem conta.' },
      it: { subject: 'Aggiungi foto a un ricordo', preview: 'Link privato per la famiglia.', body: 'Usa il link per aggiungere foto. Non serve un account.' },
      pl: { subject: 'Dodaj zdjęcia do wspomnienia', preview: 'Prywatny link dla rodziny.', body: 'Użyj linku, aby dodać zdjęcia. Konto nie jest potrzebne.' },
    },
  ),
  contribution_received: allLocales(
    {
      subject: 'A family photograph arrived',
      preview: 'Someone added a memory to your tribute.',
      body: 'Sign in to review new photographs in your Memory Library. Filenames are never shown in email.',
    },
    {
      nl: { subject: 'Er is een familiefoto binnengekomen', preview: 'Iemand voegde een herinnering toe.', body: 'Meld u aan om nieuwe foto’s te bekijken.' },
      de: { subject: 'Ein Familienfoto ist eingetroffen', preview: 'Jemand hat eine Erinnerung hinzugefügt.', body: 'Melden Sie sich an, um neue Fotos zu prüfen.' },
      fr: { subject: 'Une photo de famille est arrivée', preview: 'Quelqu’un a ajouté un souvenir.', body: 'Connectez-vous pour examiner les nouvelles photos.' },
      es: { subject: 'Llegó una foto familiar', preview: 'Alguien añadió un recuerdo.', body: 'Inicie sesión para revisar las nuevas fotos.' },
      pt: { subject: 'Chegou uma fotografia da família', preview: 'Alguém adicionou uma memória.', body: 'Inicie sessão para rever as novas fotografias.' },
      it: { subject: 'È arrivata una foto di famiglia', preview: 'Qualcuno ha aggiunto un ricordo.', body: 'Accedi per esaminare le nuove foto.' },
      pl: { subject: 'Nadeszło zdjęcie od rodziny', preview: 'Ktoś dodał wspomnienie.', body: 'Zaloguj się, aby przejrzeć nowe zdjęcia.' },
    },
  ),
  film_ready: allLocales(
    {
      subject: 'Your memorial film is ready to review',
      preview: 'The arranged film is waiting in your tribute.',
      body: 'Sign in to watch the draft film and make meaningful decisions. Nothing downloads until you ask.',
    },
    {
      nl: { subject: 'Uw herdenkingsfilm is klaar om te bekijken', preview: 'De film wacht in uw tribute.', body: 'Meld u aan om de film te bekijken.' },
      de: { subject: 'Ihr Gedenkfilm ist zur Prüfung bereit', preview: 'Der Film wartet in Ihrem Tribute.', body: 'Melden Sie sich an, um den Film anzusehen.' },
      fr: { subject: 'Votre film mémorial est prêt à revoir', preview: 'Le film attend dans votre hommage.', body: 'Connectez-vous pour regarder le film.' },
      es: { subject: 'Su película memorial está lista para revisar', preview: 'La película espera en su homenaje.', body: 'Inicie sesión para ver la película.' },
      pt: { subject: 'O seu filme memorial está pronto para rever', preview: 'O filme espera na homenagem.', body: 'Inicie sessão para ver o filme.' },
      it: { subject: 'Il film commemorativo è pronto da rivedere', preview: 'Il film ti aspetta nel ricordo.', body: 'Accedi per guardare il film.' },
      pl: { subject: 'Film memorialny jest gotowy do przejrzenia', preview: 'Film czeka w Twoim hołdzie.', body: 'Zaloguj się, aby obejrzeć film.' },
    },
  ),
  processing_attention: allLocales(
    {
      subject: 'A memory needs a moment of attention',
      preview: 'Something in your tribute needs a calm review.',
      body: 'Sign in to see which photograph or clip needs attention. You can retry or replace it when you are ready.',
    },
    {
      nl: { subject: 'Een herinnering vraagt even aandacht', preview: 'Iets in uw tribute vraagt om review.', body: 'Meld u aan om te zien wat aandacht nodig heeft.' },
      de: { subject: 'Eine Erinnerung braucht einen Moment Aufmerksamkeit', preview: 'Etwas in Ihrem Tribute braucht Prüfung.', body: 'Melden Sie sich an, um zu sehen, was Aufmerksamkeit braucht.' },
      fr: { subject: 'Un souvenir demande un moment d’attention', preview: 'Quelque chose dans votre hommage demande une revue.', body: 'Connectez-vous pour voir ce qui demande attention.' },
      es: { subject: 'Un recuerdo necesita un momento de atención', preview: 'Algo en su homenaje necesita revisión.', body: 'Inicie sesión para ver qué necesita atención.' },
      pt: { subject: 'Uma memória precisa de um momento de atenção', preview: 'Algo na homenagem precisa de revisão.', body: 'Inicie sessão para ver o que precisa de atenção.' },
      it: { subject: 'Un ricordo richiede un momento di attenzione', preview: 'Qualcosa nel ricordo richiede revisione.', body: 'Accedi per vedere cosa richiede attenzione.' },
      pl: { subject: 'Wspomnienie wymaga chwili uwagi', preview: 'Coś w hołdzie wymaga spokojnego przeglądu.', body: 'Zaloguj się, aby zobaczyć, co wymaga uwagi.' },
    },
  ),
  private_screening_invitation: allLocales(
    {
      subject: 'A private viewing link for a memorial film',
      preview: 'Watch calmly. Download is not included.',
      body: 'Open the private viewing link you were given. It can be revoked at any time and does not grant editor access.',
    },
    {
      nl: { subject: 'Een privé-kijklink voor een herdenkingsfilm', preview: 'Rustig bekijken. Geen download.', body: 'Open de privélink. Hij kan worden ingetrokken.' },
      de: { subject: 'Ein privater Vorführlink für einen Gedenkfilm', preview: 'Ruhig ansehen. Kein Download.', body: 'Öffnen Sie den privaten Link. Er kann widerrufen werden.' },
      fr: { subject: 'Un lien de visionnage privé pour un film mémorial', preview: 'Visionnage calme. Pas de téléchargement.', body: 'Ouvrez le lien privé. Il peut être révoqué.' },
      es: { subject: 'Un enlace de visionado privado para una película memorial', preview: 'Ver con calma. Sin descarga.', body: 'Abra el enlace privado. Se puede revocar.' },
      pt: { subject: 'Uma ligação de visionamento privado para um filme memorial', preview: 'Ver com calma. Sem transferência.', body: 'Abra a ligação privada. Pode ser revogada.' },
      it: { subject: 'Un link di visione privata per un film commemorativo', preview: 'Visione calma. Nessun download.', body: 'Apri il link privato. Può essere revocato.' },
      pl: { subject: 'Prywatny link do oglądania filmu memorialnego', preview: 'Spokojne oglądanie. Bez pobierania.', body: 'Otwórz prywatny link. Może zostać unieważniony.' },
    },
  ),
};

export function renderTransactionalEmail(input: {
  template: EmailTemplate;
  locale: LaunchLanguage;
}): EmailMessage {
  const copy = COPY[input.template][input.locale];
  return {
    template: input.template,
    locale: input.locale,
    subject: copy.subject,
    preview: copy.preview,
    body: copy.body,
  };
}

export function emailTemplateCoverage(): EmailTemplate[] {
  return EMAIL_TEMPLATES.filter((template) => LAUNCH_LANGUAGES.every((locale) => COPY[template][locale]));
}
