export const SNIFFED_MIMES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'video/mp4',
  'audio/wav',
  'audio/mpeg',
] as const;
export type SniffedMime = (typeof SNIFFED_MIMES)[number] | 'unknown';

export function headerFromHex(headerHex: string): Uint8Array {
  const hex = headerHex.replace(/[^0-9a-f]/gi, '').slice(0, 32);
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

export function sniffMime(header: Uint8Array): SniffedMime {
  if (header.length >= 3 && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    header.length >= 8 &&
    header[0] === 0x89 &&
    header[1] === 0x50 &&
    header[2] === 0x4e &&
    header[3] === 0x47
  ) {
    return 'image/png';
  }
  if (
    header.length >= 12 &&
    header[0] === 0x52 &&
    header[1] === 0x49 &&
    header[2] === 0x46 &&
    header[3] === 0x46 &&
    header[8] === 0x57 &&
    header[9] === 0x45 &&
    header[10] === 0x42 &&
    header[11] === 0x50
  ) {
    return 'image/webp';
  }
  if (
    header.length >= 12 &&
    header[0] === 0x52 &&
    header[1] === 0x49 &&
    header[2] === 0x46 &&
    header[3] === 0x46 &&
    header[8] === 0x57 &&
    header[9] === 0x41 &&
    header[10] === 0x56 &&
    header[11] === 0x45
  ) {
    return 'audio/wav';
  }
  if (header.length >= 3 && header[0] === 0x49 && header[1] === 0x44 && header[2] === 0x33) {
    return 'audio/mpeg';
  }
  if (header.length >= 2 && header[0] === 0xff && (header[1]! & 0xe0) === 0xe0) {
    return 'audio/mpeg';
  }
  if (
    header.length >= 12 &&
    header[4] === 0x66 &&
    header[5] === 0x74 &&
    header[6] === 0x79 &&
    header[7] === 0x70
  ) {
    return 'video/mp4';
  }
  return 'unknown';
}

export function mimeMatchesDeclaration(detected: SniffedMime, declared: string): boolean {
  if (detected === 'unknown') {
    return false;
  }
  if (detected === declared) {
    return true;
  }
  if (detected === 'audio/wav' && ['audio/wav', 'audio/wave', 'audio/x-wav'].includes(declared)) {
    return true;
  }
  if (detected === 'audio/mpeg' && ['audio/mpeg', 'audio/mp3'].includes(declared)) {
    return true;
  }
  if (
    detected === 'video/mp4' &&
    ['video/mp4', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'video/quicktime'].includes(declared)
  ) {
    return true;
  }
  return false;
}
