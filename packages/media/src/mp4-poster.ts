import { decodeJpeg } from './jpeg-codec';
import { type RgbaImage } from './pixels';
import { probeVideoCodec } from './video-probe';

export function extractEmbeddedJpeg(bytes: Uint8Array): Uint8Array | null {
  for (let offset = 0; offset + 12 < bytes.length; offset += 1) {
    if (bytes[offset] !== 0xff || bytes[offset + 1] !== 0xd8 || bytes[offset + 2] !== 0xff) {
      continue;
    }
    const end = findJpegEnd(bytes, offset);
    if (end && end - offset > 64) {
      return bytes.subarray(offset, end);
    }
  }
  return extractCovrBox(bytes);
}

export function extractFirstMjpegSample(bytes: Uint8Array): Uint8Array | null {
  const table = findFirstVideoSampleTable(bytes, 0, bytes.length);
  if (!table) {
    return null;
  }
  const offset = table.chunkOffsets[0];
  const size = table.uniformSampleSize || table.sampleSizes[0];
  if (offset === undefined || !size || offset + size > bytes.length) {
    return null;
  }
  const sample = bytes.subarray(offset, offset + size);
  return clipJpegFromSample(sample);
}

export function planPosterSource(
  bytes: Uint8Array,
): 'embedded_jpeg' | 'mjpeg_sample' | 'h264_extract' | 'unavailable' {
  if (extractEmbeddedJpeg(bytes)) {
    return 'embedded_jpeg';
  }
  if (extractFirstMjpegSample(bytes)) {
    return 'mjpeg_sample';
  }
  const codec = probeVideoCodec(bytes);
  if (codec === 'avc1' || codec === 'avc3') {
    return 'h264_extract';
  }
  return 'unavailable';
}

export function decodeEmbeddedPosterFrame(bytes: Uint8Array): RgbaImage | null {
  const jpeg = extractEmbeddedJpeg(bytes) ?? extractFirstMjpegSample(bytes);
  if (!jpeg) {
    return null;
  }
  try {
    return decodeJpeg(jpeg);
  } catch {
    return null;
  }
}

function findJpegEnd(bytes: Uint8Array, start: number): number | null {
  for (let offset = start + 2; offset + 1 < bytes.length; offset += 1) {
    if (bytes[offset] === 0xff && bytes[offset + 1] === 0xd9) {
      return offset + 2;
    }
  }
  return null;
}

function extractCovrBox(bytes: Uint8Array): Uint8Array | null {
  let offset = 0;
  while (offset + 8 <= bytes.length) {
    const size =
      ((bytes[offset] ?? 0) << 24) |
      ((bytes[offset + 1] ?? 0) << 16) |
      ((bytes[offset + 2] ?? 0) << 8) |
      (bytes[offset + 3] ?? 0);
    const type = String.fromCharCode(
      bytes[offset + 4] ?? 0,
      bytes[offset + 5] ?? 0,
      bytes[offset + 6] ?? 0,
      bytes[offset + 7] ?? 0,
    );
    if (size < 8 || offset + size > bytes.length) {
      return null;
    }
    if (type === 'covr' || type === 'thmb' || type === 'pict') {
      const payload = bytes.subarray(offset + 8, offset + size);
      const jpegStart = payload.findIndex(
        (value, index) => value === 0xff && payload[index + 1] === 0xd8 && payload[index + 2] === 0xff,
      );
      if (jpegStart >= 0) {
        const end = findJpegEnd(payload, jpegStart);
        if (end) {
          return payload.subarray(jpegStart, end);
        }
      }
    }
    if (type === 'moov' || type === 'udta' || type === 'meta' || type === 'ilst') {
      const nested = extractCovrBox(bytes.subarray(offset + 8, offset + size));
      if (nested) {
        return nested;
      }
    }
    offset += size;
  }
  return null;
}

const MJPEG_CODECS = new Set(['jpeg', 'mjpa', 'mjpb', 'dmb1']);

type VideoSampleTable = {
  codec: string;
  uniformSampleSize: number;
  sampleSizes: number[];
  chunkOffsets: number[];
};

function findFirstVideoSampleTable(bytes: Uint8Array, start: number, end: number): VideoSampleTable | null {
  let offset = start;
  while (offset + 8 <= end) {
    const size = readUint32(bytes, offset);
    const type = readType(bytes, offset + 4);
    if (size < 8 || offset + size > end) {
      return null;
    }
    const payloadStart = offset + 8;
    const payloadEnd = offset + size;
    if (type === 'moov' || type === 'trak' || type === 'mdia' || type === 'minf' || type === 'stbl') {
      const nested = findFirstVideoSampleTable(bytes, payloadStart, payloadEnd);
      if (nested) {
        return nested;
      }
    }
    if (type === 'stbl') {
      const table = readSampleTable(bytes, payloadStart, payloadEnd);
      if (table && (MJPEG_CODECS.has(table.codec) || tableLooksLikeJpeg(bytes, table))) {
        return table;
      }
    }
    offset += size === 0 ? end - offset : size;
  }
  return null;
}

function readSampleTable(bytes: Uint8Array, start: number, end: number): VideoSampleTable | null {
  let codec = '';
  let uniformSampleSize = 0;
  const sampleSizes: number[] = [];
  const chunkOffsets: number[] = [];
  let offset = start;
  while (offset + 8 <= end) {
    const size = readUint32(bytes, offset);
    const type = readType(bytes, offset + 4);
    if (size < 8 || offset + size > end) {
      break;
    }
    const payloadStart = offset + 8;
    const payloadEnd = offset + size;
    if (type === 'stsd' && payloadStart + 8 <= payloadEnd) {
      const entryStart = payloadStart + 8;
      if (entryStart + 8 <= payloadEnd) {
        codec = readType(bytes, entryStart + 4);
      }
    }
    if (type === 'stsz' && payloadStart + 8 <= payloadEnd) {
      uniformSampleSize = readUint32(bytes, payloadStart + 4);
      const count = readUint32(bytes, payloadStart + 8);
      if (uniformSampleSize === 0) {
        for (let index = 0; index < count && payloadStart + 12 + (index + 1) * 4 <= payloadEnd; index += 1) {
          sampleSizes.push(readUint32(bytes, payloadStart + 12 + index * 4));
        }
      }
    }
    if (type === 'stco' && payloadStart + 4 <= payloadEnd) {
      const count = readUint32(bytes, payloadStart + 4);
      for (let index = 0; index < count && payloadStart + 8 + (index + 1) * 4 <= payloadEnd; index += 1) {
        chunkOffsets.push(readUint32(bytes, payloadStart + 8 + index * 4));
      }
    }
    if (type === 'co64' && payloadStart + 4 <= payloadEnd) {
      const count = readUint32(bytes, payloadStart + 4);
      for (let index = 0; index < count && payloadStart + 8 + (index + 1) * 8 <= payloadEnd; index += 1) {
        chunkOffsets.push(Number(readUint64(bytes, payloadStart + 8 + index * 8)));
      }
    }
    offset += size;
  }
  if (!chunkOffsets.length) {
    return null;
  }
  return { codec, uniformSampleSize, sampleSizes, chunkOffsets };
}

function tableLooksLikeJpeg(bytes: Uint8Array, table: VideoSampleTable): boolean {
  const offset = table.chunkOffsets[0];
  const size = table.uniformSampleSize || table.sampleSizes[0];
  if (offset === undefined || !size || offset + Math.min(3, size) > bytes.length) {
    return false;
  }
  return clipJpegFromSample(bytes.subarray(offset, offset + size)) !== null;
}

function clipJpegFromSample(sample: Uint8Array): Uint8Array | null {
  const start = sample[0] === 0xff && sample[1] === 0xd8 ? 0 : sample[4] === 0xff && sample[5] === 0xd8 ? 4 : -1;
  if (start < 0) {
    return null;
  }
  const end = findJpegEnd(sample, start);
  return end && end - start > 64 ? sample.subarray(start, end) : sample.subarray(start);
}

function readType(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(
    bytes[offset] ?? 0,
    bytes[offset + 1] ?? 0,
    bytes[offset + 2] ?? 0,
    bytes[offset + 3] ?? 0,
  );
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return (
    (((bytes[offset] ?? 0) << 24) |
      ((bytes[offset + 1] ?? 0) << 16) |
      ((bytes[offset + 2] ?? 0) << 8) |
      (bytes[offset + 3] ?? 0)) >>>
    0
  );
}

function readUint64(bytes: Uint8Array, offset: number): bigint {
  return (BigInt(readUint32(bytes, offset)) << 32n) | BigInt(readUint32(bytes, offset + 4));
}
