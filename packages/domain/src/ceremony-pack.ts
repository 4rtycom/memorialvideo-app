export type CeremonyPackManifest = {
  schemaVersion: 1;
  videoFileName: string;
  checklistFileName: string;
  width: 1920;
  height: 1080;
  notes: readonly string[];
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
    width: 1920,
    height: 1080,
    notes: [
      'Play the MP4 from this folder. Do not stream it from a browser tab.',
      'Open the file on the ceremony computer before guests arrive.',
      'Keep this folder as a second copy on another drive.',
    ],
  };
}

export function ceremonyChecklistText(publicId: string): string {
  const pack = buildCeremonyPackManifest(publicId);
  return `${pack.notes.join('\n')}\n`;
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
