declare module 'jpeg-js' {
  export function decode(
    bytes: Buffer,
    options?: { useTArray?: boolean; maxMemoryUsageInMB?: number; maxResolutionInMP?: number },
  ): { width: number; height: number; data: Uint8Array };
  export function encode(
    image: { data: Buffer; width: number; height: number },
    quality?: number,
  ): { data: Buffer };
}
