/** Locale draft strings for MV-121 Ceremony Music (human polish still XB-004). */

const ceremonyDraft = (prefix: string) => ({
  'music.ceremony.title': `${prefix} · Ceremony music`,
  'music.ceremony.body': `${prefix} · Most services use three or four songs. Choose music for your tribute film.`,
  'music.ceremony.singleHint': `${prefix} · Start with one gentle song for the whole tribute film.`,
  'music.ceremony.momentsHint': `${prefix} · Pick a song for each moment. Opening can stay with the venue.`,
  'music.ceremony.licensedLine': `${prefix} · Licensed for ceremony playback and download`,
  'music.ceremony.previewSuggested': `${prefix} · Preview suggested song`,
  'music.ceremony.apply': `${prefix} · Use this music`,
  'music.ceremony.expandMoments': `${prefix} · Match music to each moment`,
  'music.ceremony.useOneSong': `${prefix} · Use one song for the whole film`,
  'music.ceremony.skipMoment': `${prefix} · Skip`,
  'music.ceremony.venueHandlesOpening': `${prefix} · Venue handles opening music`,
  'music.ceremony.applied': `${prefix} · Ceremony music applied to your film`,
  'music.ceremony.failed': `${prefix} · Ceremony music could not be updated`,
  'music.ceremony.savedPreviously': `${prefix} · Ceremony music is already on this film`,
  'music.ceremony.idle': `${prefix} · Preview before applying — your film stays unchanged until you confirm`,
  'music.ceremony.moment.opening': `${prefix} · Opening`,
  'music.ceremony.moment.tribute': `${prefix} · Tribute film`,
  'music.ceremony.moment.reflection': `${prefix} · Reflection`,
  'music.ceremony.moment.closing': `${prefix} · Closing`,
});

export const musicNl = ceremonyDraft('NL');
export const musicDe = ceremonyDraft('DE');
export const musicFr = ceremonyDraft('FR');
export const musicEs = ceremonyDraft('ES');
export const musicPt = ceremonyDraft('PT');
export const musicIt = ceremonyDraft('IT');
export const musicPl = ceremonyDraft('PL');
