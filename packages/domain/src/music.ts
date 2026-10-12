export function canAttachCatalogTrack(input: {
  licensedForDownload: boolean;
  licensedForPrivateStream: boolean;
  userUploaded: boolean;
  featureUserUploads: boolean;
}): boolean {
  if (input.userUploaded) {
    return input.featureUserUploads === true;
  }
  return input.licensedForDownload && input.licensedForPrivateStream;
}
