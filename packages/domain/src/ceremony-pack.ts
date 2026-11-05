export type CeremonyPackManifest = {
  schemaVersion: 1;
  videoFileName: string;
  checklistFileName: string;
  cueSheetFileName: string;
  width: 1920;
  height: 1080;
  notes: readonly string[];
};

export type CeremonyCueSheetChapter = {
  /** Human chapter title only — never raw captions or private media content. */
  title: string;
  /** Clock label when known (e.g. 01:42). */
  startLabel?: string | null;
};

export type CeremonyCueSheetInput = {
  publicId: string;
  /** Opaque tribute display name for venue handoff — never log elsewhere. */
  displayName?: string | null;
  chapters?: readonly CeremonyCueSheetChapter[];
  totalLabel?: string | null;
  /** Honest: interactive speech-pause player is not in this ZIP. */
  interactivePlayerReady?: boolean;
};

export function safeCeremonyFileStem(publicId: string): string {
  const stem = publicId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32);
  return stem.length > 0 ? stem : 'memorial';
}

export function buildCeremonyPackManifest(publicId: string): CeremonyPackManifest {
  const stem = safeCeremonyFileStem(publicId);
  return {
    schemaVersion: 1,
    videoFileName: `${stem}-1080p.mp4`,
    checklistFileName: `${stem}-playback.txt`,
    cueSheetFileName: `${stem}-cue-sheet.txt`,
    width: 1920,
    height: 1080,
    notes: [
      'Play the MP4 from this folder. Do not stream it from a browser tab during the service.',
      'Open the file on the ceremony computer before guests arrive.',
      'Keep this folder as a second copy on another drive.',
      'Use the cue sheet for the running order. Pause and resume manually for live speeches.',
    ],
  };
}

export function ceremonyChecklistText(publicId: string): string {
  const pack = buildCeremonyPackManifest(publicId);
  return [
    'Venue playback checklist',
    '========================',
    '',
    ...pack.notes,
    '',
    'Before the service',
    '- Download this pack to the venue computer (or a trusted USB drive).',
    '- Test sound on the venue speakers at ceremony volume.',
    '- Confirm widescreen 16:9 framing on the projector or TV.',
    '- Confirm music rights for this tribute are cleared for the venue.',
    '',
    'During the service',
    '- One person operates playback. Use Pause for live words; Resume when ready.',
    '- This pack is a verified MP4 plus printed running order — not an automatic speech-pause player.',
    '',
  ].join('\n');
}

/**
 * Printed running order for the venue operator.
 * Static MP4 cannot wait for unscheduled speeches — pause/resume stays human-operated.
 */
export function ceremonyCueSheetText(input: CeremonyCueSheetInput): string {
  const pack = buildCeremonyPackManifest(input.publicId);
  const chapters =
    input.chapters && input.chapters.length > 0
      ? input.chapters
      : [{ title: 'Full film (no chapter markers published yet)' }];
  const lines: string[] = [
    'Ceremony cue sheet — running order',
    '==================================',
    '',
    input.displayName ? `Tribute: ${input.displayName}` : 'Tribute: (name on film titles)',
    input.totalLabel ? `Film length: ${input.totalLabel}` : 'Film length: see verified MP4',
    `Video file: ${pack.videoFileName}`,
    `Picture: ${pack.width}×${pack.height} (16:9)`,
    '',
    'Operator notes',
    '- Pause for live speeches or silences; resume only when the room is ready.',
    '- Skip ahead only if the family agreed beforehand.',
    input.interactivePlayerReady
      ? '- Interactive operator player with marked speech pauses is available in the app.'
      : '- Interactive speech-pause player is not included in this ZIP — use Pause/Resume on the venue player.',
    '',
    'Running order',
  ];
  chapters.forEach((chapter, index) => {
    const n = String(index + 1).padStart(2, '0');
    const clock = chapter.startLabel ? `  ·  ${chapter.startLabel}` : '';
    lines.push(`${n}  ${chapter.title}${clock}`);
  });
  lines.push('', 'End of cue sheet', '');
  return lines.join('\n');
}

/**
 * Classic entitlement + QC gate for Ceremony Pack ZIP.
 * MV-111 adds Ceremony Readiness on top via canProceedWithCeremonyPack —
 * Output QC readiness alone is not a Ceremony Readiness report.
 */
export function canBuildCeremonyPack(input: {
  includesCeremonyPack: boolean;
  outputVerified: boolean;
  qcPassed: boolean;
}): boolean {
  return input.includesCeremonyPack && input.outputVerified && input.qcPassed;
}
