import { planByteRange, type ByteRangePlan } from '@memorialvideo/domain';

export type ServedByteRange =
  | { action: 'full'; sizeBytes: number }
  | { action: 'partial'; start: number; end: number; sizeBytes: number }
  | { action: 'unsatisfiable'; sizeBytes: number };

/** Plan Accept-Ranges / 206 / 416 for local READY final downloads (Prompt 18). */
export function planServedByteRange(input: {
  sizeBytes: number;
  rangeHeader?: string | null;
}): ServedByteRange {
  const plan: ByteRangePlan = planByteRange({
    sizeBytes: input.sizeBytes,
    rangeHeader: input.rangeHeader,
  });
  if (plan.action === 'unsatisfiable') {
    return { action: 'unsatisfiable', sizeBytes: input.sizeBytes };
  }
  if (plan.action === 'partial') {
    return {
      action: 'partial',
      start: plan.start,
      end: plan.end,
      sizeBytes: input.sizeBytes,
    };
  }
  return { action: 'full', sizeBytes: input.sizeBytes };
}

export function sliceBytes(bytes: Uint8Array, start: number, end: number): Uint8Array {
  return bytes.subarray(start, end + 1);
}
