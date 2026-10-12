import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

import { assertSafePixelCount, type RgbaImage } from './pixels';
import { isLosslessWebp } from './webp-size';

export { isLosslessWebp };

const require = createRequire(import.meta.url);

function jsquashId(kind: 'decode' | 'encode'): string {
  return ['@jsquash', 'webp', kind].join('/');
}

function jsquashWasm(kind: 'dec' | 'enc'): string {
  const file = kind === 'dec' ? 'webp_dec.wasm' : 'webp_enc.wasm';
  return require.resolve(['@jsquash', `webp/codec/${kind}/${file}`].join('/'));
}

type WasmImage = {
  data: Uint8ClampedArray | Uint8Array;
  width: number;
  height: number;
};

type WasmModule = object;

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

let decodeReady: Promise<(bytes: Uint8Array) => Promise<WasmImage>> | null = null;

async function compileWasm(wasmPath: string): Promise<WasmModule> {
  const compiler = (globalThis as { WebAssembly?: { compile: (bytes: Uint8Array) => Promise<WasmModule> } })
    .WebAssembly;
  if (!compiler) {
    throw new Error('undecodable');
  }
  return compiler.compile(await readFile(wasmPath));
}

async function loadLossyDecoder(): Promise<(bytes: Uint8Array) => Promise<WasmImage>> {
  const decodeMod = (await import(jsquashId('decode'))) as {
    default: (buffer: ArrayBuffer) => Promise<WasmImage>;
    init: (module: WasmModule) => Promise<unknown>;
  };
  await decodeMod.init(await compileWasm(jsquashWasm('dec')));
  return async (bytes: Uint8Array) => decodeMod.default(toArrayBuffer(bytes));
}

export async function decodeLossyWebp(bytes: Uint8Array): Promise<RgbaImage> {
  decodeReady ??= loadLossyDecoder();
  const decode = await decodeReady;
  const image = await decode(bytes);
  assertSafePixelCount(image.width, image.height);
  return {
    width: image.width,
    height: image.height,
    data: image.data instanceof Uint8Array ? image.data : Uint8Array.from(image.data),
  };
}

export async function encodeLossyWebp(image: RgbaImage, quality = 80): Promise<Uint8Array> {
  const encodeMod = (await import(jsquashId('encode'))) as {
    default: (
      data: { data: Uint8ClampedArray; width: number; height: number },
      options?: { quality?: number },
    ) => Promise<ArrayBuffer>;
    init: (module: WasmModule) => Promise<unknown>;
  };
  await encodeMod.init(await compileWasm(jsquashWasm('enc')));
  const encoded = await encodeMod.default(
    {
      data: new Uint8ClampedArray(image.data),
      width: image.width,
      height: image.height,
    },
    { quality },
  );
  return new Uint8Array(encoded);
}
