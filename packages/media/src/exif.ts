export type ExifCandidates = {
  capturedAt?: string;
  timezone?: string;
  hasLocation: boolean;
  orientation?: number;
};

const EXIF_HEADER = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00];

export function readJpegExifCandidates(bytes: Uint8Array): ExifCandidates {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return { hasLocation: false };
  }
  let offset = 2;
  while (offset + 4 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      break;
    }
    const marker = bytes[offset + 1];
    if (marker === undefined || marker === 0xda) {
      break;
    }
    const length = ((bytes[offset + 2] ?? 0) << 8) + (bytes[offset + 3] ?? 0);
    if (length < 2 || offset + 2 + length > bytes.length) {
      break;
    }
    if (marker === 0xe1) {
      const payload = bytes.subarray(offset + 4, offset + 2 + length);
      if (startsWith(payload, EXIF_HEADER)) {
        return parseExifTiff(payload.subarray(6));
      }
    }
    offset += 2 + length;
  }
  return { hasLocation: false };
}

function parseExifTiff(tiff: Uint8Array): ExifCandidates {
  const little = tiff[0] === 0x49 && tiff[1] === 0x49;
  const big = tiff[0] === 0x4d && tiff[1] === 0x4d;
  if (!little && !big) {
    return { hasLocation: false };
  }
  const ifd0 = readUint32(tiff, 4, little);
  const tags = readIfd(tiff, ifd0, little);
  const captured =
    asciiTag(tiff, tags.get(0x9003), little) ?? asciiTag(tiff, tags.get(0x0132), little);
  const offsetTime = asciiTag(tiff, tags.get(0x9011), little) ?? asciiTag(tiff, tags.get(0x9010), little);
  const orientation = numberTag(tiff, tags.get(0x0112), little);
  const gpsIfd = numberTag(tiff, tags.get(0x8825), little);
  return {
    capturedAt: captured ? toIsoCandidate(captured) : undefined,
    timezone: offsetTime?.trim() || undefined,
    hasLocation: Boolean(gpsIfd),
    orientation: orientation && orientation >= 1 && orientation <= 8 ? orientation : undefined,
  };
}

type IfdEntry = { type: number; count: number; valueOffset: number };

function readIfd(bytes: Uint8Array, offset: number, little: boolean): Map<number, IfdEntry> {
  const tags = new Map<number, IfdEntry>();
  if (offset + 2 > bytes.length) {
    return tags;
  }
  const count = readUint16(bytes, offset, little);
  let cursor = offset + 2;
  for (let index = 0; index < count && cursor + 12 <= bytes.length; index += 1) {
    const tag = readUint16(bytes, cursor, little);
    tags.set(tag, {
      type: readUint16(bytes, cursor + 2, little),
      count: readUint32(bytes, cursor + 4, little),
      valueOffset: readUint32(bytes, cursor + 8, little),
    });
    cursor += 12;
  }
  return tags;
}

function asciiTag(bytes: Uint8Array, entry: IfdEntry | undefined, little: boolean): string | undefined {
  if (!entry || entry.type !== 2 || entry.count < 2) {
    return undefined;
  }
  const slice =
    entry.count <= 4
      ? packUint32(entry.valueOffset, little).subarray(0, entry.count)
      : bytes.subarray(entry.valueOffset, entry.valueOffset + entry.count);
  if (slice.length < 2) {
    return undefined;
  }
  return String.fromCharCode(...slice).replace(/\0/g, '').trim() || undefined;
}

function numberTag(bytes: Uint8Array, entry: IfdEntry | undefined, little: boolean): number | undefined {
  if (!entry) {
    return undefined;
  }
  if (entry.type === 3 && entry.count === 1) {
    return little ? entry.valueOffset & 0xffff : (entry.valueOffset >>> 16) & 0xffff;
  }
  if (entry.type === 4 && entry.count === 1) {
    return entry.valueOffset;
  }
  if (entry.type === 3 && entry.valueOffset + 2 <= bytes.length) {
    return readUint16(bytes, entry.valueOffset, little);
  }
  if (entry.type === 4 && entry.valueOffset + 4 <= bytes.length) {
    return readUint32(bytes, entry.valueOffset, little);
  }
  return undefined;
}

function packUint32(value: number, little: boolean): Uint8Array {
  const buffer = new Uint8Array(4);
  if (little) {
    buffer[0] = value & 0xff;
    buffer[1] = (value >> 8) & 0xff;
    buffer[2] = (value >> 16) & 0xff;
    buffer[3] = (value >> 24) & 0xff;
  } else {
    buffer[0] = (value >> 24) & 0xff;
    buffer[1] = (value >> 16) & 0xff;
    buffer[2] = (value >> 8) & 0xff;
    buffer[3] = value & 0xff;
  }
  return buffer;
}

function toIsoCandidate(value: string): string | undefined {
  const match = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(value);
  if (!match) {
    return undefined;
  }
  return `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}`;
}

function startsWith(bytes: Uint8Array, prefix: readonly number[]): boolean {
  return prefix.every((value, index) => bytes[index] === value);
}

function readUint16(bytes: Uint8Array, offset: number, little: boolean): number {
  return little
    ? (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8)
    : ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0);
}

function readUint32(bytes: Uint8Array, offset: number, little: boolean): number {
  return little
    ? (bytes[offset] ?? 0) |
        ((bytes[offset + 1] ?? 0) << 8) |
        ((bytes[offset + 2] ?? 0) << 16) |
        ((bytes[offset + 3] ?? 0) << 24)
    : ((bytes[offset] ?? 0) << 24) |
        ((bytes[offset + 1] ?? 0) << 16) |
        ((bytes[offset + 2] ?? 0) << 8) |
        (bytes[offset + 3] ?? 0);
}
