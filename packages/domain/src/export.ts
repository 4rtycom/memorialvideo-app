export type ProjectExportManifest = {
  schemaVersion: 1;
  projectPublicId: string;
  locale: string;
  themeKey: string;
  timelineVersion: number;
  assetCount: number;
  excluded: readonly string[];
  checksumNote: string;
};

export function buildProjectExportManifest(input: {
  projectPublicId: string;
  locale: string;
  themeKey: string;
  timelineVersion: number;
  assetCount: number;
  includeMedia: boolean;
}): ProjectExportManifest {
  return {
    schemaVersion: 1,
    projectPublicId: input.projectPublicId,
    locale: input.locale,
    themeKey: input.themeKey,
    timelineVersion: input.timelineVersion,
    assetCount: input.assetCount,
    excluded: input.includeMedia ? [] : ['source_binaries', 'render_outputs'],
    checksumNote: 'Archive lists metadata only unless a verified owner download is attached separately.',
  };
}
