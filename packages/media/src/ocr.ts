import { createWorker, type Worker } from 'tesseract.js';

import type { OcrBlock } from '@memorialvideo/contracts';

export type OcrEngineResult = {
  engineName: 'tesseract.js';
  engineVersion: 'v5-local';
  blocks: OcrBlock[];
  fullText: string;
  confidence?: number;
  warnings: string[];
  partial: boolean;
};

let sharedWorker: Worker | null = null;

async function getWorker(lang: string): Promise<Worker> {
  if (!sharedWorker) {
    sharedWorker = await createWorker(lang);
  }
  return sharedWorker;
}

export async function runLocalOcr(input: {
  bytes: Uint8Array;
  assetId: string;
  language?: string;
}): Promise<OcrEngineResult> {
  const lang = input.language && /^[a-z]{3}(\+[a-z]{3})*$/i.test(input.language) ? input.language : 'eng';
  const warnings: string[] = [];
  try {
    const worker = await getWorker(lang);
    const image = Buffer.from(input.bytes);
    const result = await worker.recognize(image);
    const lines = result.data.lines ?? [];
    const reportedWidth = (result.data as { width?: number }).width;
    const reportedHeight = (result.data as { height?: number }).height;
    // Tesseract sometimes omits page width/height; fall back to bbox extents so
    // normalized coordinates stay in [0, 1] for contract validation.
    const extentX = Math.max(0, ...lines.map((line) => line.bbox?.x1 ?? 0));
    const extentY = Math.max(0, ...lines.map((line) => line.bbox?.y1 ?? 0));
    const pageWidth = Math.max(1, reportedWidth ?? 0, extentX);
    const pageHeight = Math.max(1, reportedHeight ?? 0, extentY);
    const unit = (value: number): number => Math.min(1, Math.max(0, value));
    const blocks: OcrBlock[] = lines
      .flatMap((line, index) => {
        const text = (line.text ?? '').trim();
        if (!text) {
          return [];
        }
        const bbox = line.bbox;
        const block: OcrBlock = {
          id: `blk_${index}`,
          pageNumber: 1,
          readingOrder: index,
          engineText: text.slice(0, 8000),
          confidence: typeof line.confidence === 'number' ? Math.min(1, Math.max(0, line.confidence / 100)) : undefined,
          bbox: bbox
            ? {
                x: unit(bbox.x0 / pageWidth),
                y: unit(bbox.y0 / pageHeight),
                width: unit((bbox.x1 - bbox.x0) / pageWidth),
                height: unit((bbox.y1 - bbox.y0) / pageHeight),
              }
            : undefined,
          scriptKind: 'printed',
          reviewState: 'unreviewed',
        };
        return [block];
      })
      .slice(0, 500);

    if (blocks.length === 0) {
      warnings.push('no_text_detected');
    }
    const meanConfidence =
      typeof result.data.confidence === 'number' ? Math.min(1, Math.max(0, result.data.confidence / 100)) : undefined;
    if (meanConfidence != null && meanConfidence < 0.45) {
      warnings.push('low_confidence');
    }

    return {
      engineName: 'tesseract.js',
      engineVersion: 'v5-local',
      blocks,
      fullText: (result.data.text ?? '').trim().slice(0, 50_000),
      confidence: meanConfidence,
      warnings,
      partial: warnings.includes('low_confidence'),
    };
  } catch {
    warnings.push('ocr_engine_failed');
    return {
      engineName: 'tesseract.js',
      engineVersion: 'v5-local',
      blocks: [],
      fullText: '',
      warnings,
      partial: true,
    };
  }
}

export async function terminateOcrWorker(): Promise<void> {
  if (sharedWorker) {
    await sharedWorker.terminate();
    sharedWorker = null;
  }
}
