export type WavProbe = {
  durationMs: number;
  channels: number;
  sampleRate: number;
  bitsPerSample: number;
  peak: number;
  rms: number;
};

export function probeWav(bytes: Uint8Array): WavProbe | null {
  if (bytes.length < 44) {
    return null;
  }
  const riff = String.fromCharCode(bytes[0] ?? 0, bytes[1] ?? 0, bytes[2] ?? 0, bytes[3] ?? 0);
  const wave = String.fromCharCode(bytes[8] ?? 0, bytes[9] ?? 0, bytes[10] ?? 0, bytes[11] ?? 0);
  if (riff !== 'RIFF' || wave !== 'WAVE') {
    return null;
  }
  let offset = 12;
  let channels = 0;
  let sampleRate = 0;
  let bitsPerSample = 0;
  let data: Uint8Array | null = null;
  while (offset + 8 <= bytes.length) {
    const type = String.fromCharCode(
      bytes[offset] ?? 0,
      bytes[offset + 1] ?? 0,
      bytes[offset + 2] ?? 0,
      bytes[offset + 3] ?? 0,
    );
    const size =
      (bytes[offset + 4] ?? 0) |
      ((bytes[offset + 5] ?? 0) << 8) |
      ((bytes[offset + 6] ?? 0) << 16) |
      ((bytes[offset + 7] ?? 0) << 24);
    const start = offset + 8;
    if (type === 'fmt ' && start + 16 <= bytes.length) {
      channels = (bytes[start + 2] ?? 0) | ((bytes[start + 3] ?? 0) << 8);
      sampleRate =
        (bytes[start + 4] ?? 0) |
        ((bytes[start + 5] ?? 0) << 8) |
        ((bytes[start + 6] ?? 0) << 16) |
        ((bytes[start + 7] ?? 0) << 24);
      bitsPerSample = (bytes[start + 14] ?? 0) | ((bytes[start + 15] ?? 0) << 8);
    }
    if (type === 'data') {
      data = bytes.subarray(start, Math.min(bytes.length, start + size));
    }
    offset = start + size + (size % 2);
  }
  if (!channels || !sampleRate || !bitsPerSample || !data) {
    return null;
  }
  const bytesPerSample = bitsPerSample / 8;
  const frames = Math.floor(data.length / (bytesPerSample * channels));
  let peak = 0;
  let sumSq = 0;
  const samples = Math.min(frames * channels, 48_000);
  for (let index = 0; index < samples; index += 1) {
    const at = index * bytesPerSample;
    let sample = 0;
    if (bitsPerSample === 16) {
      const raw = (data[at] ?? 0) | ((data[at + 1] ?? 0) << 8);
      sample = (raw > 32767 ? raw - 65536 : raw) / 32768;
    } else {
      sample = ((data[at] ?? 128) - 128) / 128;
    }
    const abs = Math.abs(sample);
    if (abs > peak) {
      peak = abs;
    }
    sumSq += sample * sample;
  }
  return {
    durationMs: Math.round((frames / sampleRate) * 1000),
    channels,
    sampleRate,
    bitsPerSample,
    peak,
    rms: samples ? Math.sqrt(sumSq / samples) : 0,
  };
}
