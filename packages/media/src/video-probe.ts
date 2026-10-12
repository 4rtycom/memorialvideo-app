import { MAX_VIDEO_DURATION_MS } from './upload';

export type VideoProbe = {
  width: number | null;
  height: number | null;
  durationMs: number | null;
  hasVideo: boolean;
  hasAudio: boolean;
  codec: string | null;
};

export type VideoQualityFlags = {
  lowResolution: boolean;
  extremeAspect: boolean;
  unknownDimensions: boolean;
  noAudio: boolean;
  unknownDuration: boolean;
  tooLong: boolean;
};

export function probeMp4(bytes: Uint8Array): VideoProbe {
  const probe: VideoProbe = {
    width: null,
    height: null,
    durationMs: null,
    hasVideo: false,
    hasAudio: false,
    codec: null,
  };
  walkBoxes(bytes, 0, bytes.length, probe, 1, 0);
  return probe;
}

export function probeVideoCodec(bytes: Uint8Array): string | null {
  return probeMp4(bytes).codec;
}

export function videoQualityFlags(probe: VideoProbe): VideoQualityFlags {
  const width = probe.width;
  const height = probe.height;
  const aspect = width && height ? width / height : 0;
  return {
    lowResolution: Boolean(width && height && Math.min(width, height) < 720),
    extremeAspect: Boolean(aspect && (aspect > 2.4 || aspect < 1 / 2.4)),
    unknownDimensions: !width || !height,
    noAudio: !probe.hasAudio,
    unknownDuration: probe.durationMs === null,
    tooLong: (probe.durationMs ?? 0) > MAX_VIDEO_DURATION_MS,
  };
}

function walkBoxes(
  bytes: Uint8Array,
  start: number,
  end: number,
  probe: VideoProbe,
  timescale: number,
  depth: number,
): void {
  let offset = start;
  while (offset + 8 <= end && depth < 12) {
    let size = readUint32(bytes, offset);
    const type = readType(bytes, offset + 4);
    let header = 8;
    if (size === 1) {
      if (offset + 16 > end) {
        return;
      }
      size = Number(readUint64(bytes, offset + 8));
      header = 16;
    }
    if (size < header || offset + size > end) {
      return;
    }
    const payloadStart = offset + header;
    const payloadEnd = offset + size;
    if (type === 'moov' || type === 'trak' || type === 'mdia' || type === 'minf' || type === 'stbl') {
      walkBoxes(bytes, payloadStart, payloadEnd, probe, timescale, depth + 1);
    }
    if (type === 'mvhd') {
      const version = bytes[payloadStart] ?? 0;
      if (version === 1 && payloadStart + 32 <= payloadEnd) {
        const ts = readUint32(bytes, payloadStart + 20);
        const duration = Number(readUint64(bytes, payloadStart + 24));
        if (ts > 0) {
          probe.durationMs = Math.round((duration / ts) * 1000);
        }
      } else if (payloadStart + 24 <= payloadEnd) {
        const ts = readUint32(bytes, payloadStart + 12);
        const duration = readUint32(bytes, payloadStart + 16);
        if (ts > 0) {
          probe.durationMs = Math.round((duration / ts) * 1000);
        }
      }
    }
    if (type === 'tkhd' && payloadStart + 84 <= payloadEnd) {
      const version = bytes[payloadStart] ?? 0;
      const dimOffset = version === 1 ? payloadStart + 88 : payloadStart + 76;
      if (dimOffset + 8 <= payloadEnd) {
        const width = readUint32(bytes, dimOffset) >> 16;
        const height = readUint32(bytes, dimOffset + 4) >> 16;
        if (width > 0 && height > 0) {
          probe.width = width;
          probe.height = height;
        }
      }
    }
    if (type === 'hdlr' && payloadStart + 16 <= payloadEnd) {
      const handler = readType(bytes, payloadStart + 8);
      if (handler === 'vide') {
        probe.hasVideo = true;
      }
      if (handler === 'soun') {
        probe.hasAudio = true;
      }
    }
    if (type === 'stsd' && payloadStart + 16 <= payloadEnd && !probe.codec) {
      probe.codec = readType(bytes, payloadStart + 12);
    }
    offset += size === 0 ? end - offset : size;
  }
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
