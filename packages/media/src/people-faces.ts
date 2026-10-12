import { access, copyFile, mkdir, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import type { FaceObservation } from '@memorialvideo/contracts';
import { PEOPLE_ENGINE } from '@memorialvideo/contracts';

import { decodeJpeg } from './jpeg-codec';
import { decodePng } from './png-codec';

export type FaceDetectionHit = {
  bbox: FaceObservation['bbox'];
  detectionConfidence: number;
  qualityCodes: string[];
  poseOcclusionCodes: string[];
  detectorName: string;
  detectorVersion: string;
  provenance: FaceObservation['provenance'];
  embedding: Float32Array;
};

export type FaceDetectionResult = {
  engineName: typeof PEOPLE_ENGINE.name | 'unavailable';
  engineVersion: typeof PEOPLE_ENGINE.version | 'none';
  hits: FaceDetectionHit[];
  warnings: string[];
  partial: boolean;
  available: boolean;
  durationMs: number;
};

const MODEL_FILES = [
  'tiny_face_detector_model-weights_manifest.json',
  'tiny_face_detector_model.bin',
  'face_landmark_68_model-weights_manifest.json',
  'face_landmark_68_model.bin',
  'face_recognition_model-weights_manifest.json',
  'face_recognition_model.bin',
] as const;

let modelsLoaded = false;
let faceApiModule: typeof import('@vladmandic/face-api') | null = null;
let tfModule: typeof import('@tensorflow/tfjs') | null = null;

const require = createRequire(import.meta.url);

async function modelsPresent(modelDir: string): Promise<boolean> {
  try {
    await Promise.all(MODEL_FILES.map((file) => access(path.join(modelDir, file))));
    return true;
  } catch {
    return false;
  }
}

function packageModelDir(): string | null {
  try {
    const pkg = require.resolve('@vladmandic/face-api/package.json');
    return path.join(path.dirname(pkg), 'model');
  } catch {
    return null;
  }
}

/** Copies pinned package models into a local cache directory (no CDN download). */
export async function ensureFaceApiModels(modelDir: string): Promise<boolean> {
  await mkdir(modelDir, { recursive: true });
  if (await modelsPresent(modelDir)) {
    return true;
  }
  const sourceDir = packageModelDir();
  if (!sourceDir) {
    return false;
  }
  try {
    for (const file of MODEL_FILES) {
      await copyFile(path.join(sourceDir, file), path.join(modelDir, file));
    }
    return await modelsPresent(modelDir);
  } catch {
    return false;
  }
}

function decodeImage(bytes: Uint8Array): { width: number; height: number; data: Uint8Array } | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return decodeJpeg(bytes);
  }
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50) {
    return decodePng(bytes);
  }
  return null;
}

function loadFaceApiWithCpuBackend(): {
  tf: typeof import('@tensorflow/tfjs');
  faceapi: typeof import('@vladmandic/face-api');
} {
  if (tfModule && faceApiModule) {
    return { tf: tfModule, faceapi: faceApiModule };
  }
  // face-api's Node build requires @tensorflow/tfjs-node. On hosts without a native
  // binding we stub that module to plain tfjs + cpu backend (proven in probe-face-api.cjs).
  const Module = require('node:module') as typeof import('node:module') & {
    prototype: { require: (id: string) => unknown };
  };
  const originalRequire = Module.prototype.require;
  Module.prototype.require = function patchedRequire(this: unknown, id: string) {
    if (id === '@tensorflow/tfjs-node' || id === '@tensorflow/tfjs-node-gpu') {
      require('@tensorflow/tfjs-backend-cpu');
      return require('@tensorflow/tfjs');
    }
    return originalRequire.apply(this, [id]);
  };
  try {
    require('@tensorflow/tfjs-backend-cpu');
    const tf = require('@tensorflow/tfjs') as typeof import('@tensorflow/tfjs');
    const faceapi = require('@vladmandic/face-api') as typeof import('@vladmandic/face-api');
    tfModule = tf;
    faceApiModule = faceapi;
    return { tf, faceapi };
  } finally {
    Module.prototype.require = originalRequire;
  }
}

export async function runLocalFaceDetection(input: {
  bytes: Uint8Array;
  modelDir: string;
  maxFaces?: number;
}): Promise<FaceDetectionResult> {
  const started = Date.now();
  const warnings: string[] = [];
  const image = decodeImage(input.bytes);
  if (!image) {
    return {
      engineName: PEOPLE_ENGINE.name,
      engineVersion: PEOPLE_ENGINE.version,
      hits: [],
      warnings: ['unsupported_image'],
      partial: true,
      available: true,
      durationMs: Date.now() - started,
    };
  }

  try {
    const ready = await ensureFaceApiModels(input.modelDir);
    if (!ready) {
      return {
        engineName: 'unavailable',
        engineVersion: 'none',
        hits: [],
        warnings: ['face_models_unavailable'],
        partial: true,
        available: false,
        durationMs: Date.now() - started,
      };
    }

    const { tf, faceapi } = loadFaceApiWithCpuBackend();
    await tf.setBackend('cpu');
    await tf.ready();
    if (!modelsLoaded) {
      await faceapi.nets.tinyFaceDetector.loadFromDisk(input.modelDir);
      await faceapi.nets.faceLandmark68Net.loadFromDisk(input.modelDir);
      await faceapi.nets.faceRecognitionNet.loadFromDisk(input.modelDir);
      modelsLoaded = true;
    }

    const rgb = new Float32Array(image.width * image.height * 3);
    for (let index = 0; index < image.width * image.height; index += 1) {
      rgb[index * 3] = image.data[index * 4] ?? 0;
      rgb[index * 3 + 1] = image.data[index * 4 + 1] ?? 0;
      rgb[index * 3 + 2] = image.data[index * 4 + 2] ?? 0;
    }
    const tensor = tf.tensor3d(rgb, [image.height, image.width, 3]);
    try {
      const detections = await faceapi
        .detectAllFaces(
          tensor as unknown as HTMLCanvasElement,
          new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.15 }),
        )
        .withFaceLandmarks()
        .withFaceDescriptors();

      const limited = detections.slice(0, input.maxFaces ?? 40);
      const hits: FaceDetectionHit[] = limited.map((detection) => {
        const box = detection.detection.box;
        const score = detection.detection.score;
        const qualityCodes: string[] = [];
        if (score < 0.55) {
          qualityCodes.push('low_confidence');
        }
        if (box.width * box.height < image.width * image.height * 0.01) {
          qualityCodes.push('small_face');
        }
        const normX = Math.max(0, Math.min(1, box.x / image.width));
        const normY = Math.max(0, Math.min(1, box.y / image.height));
        const normW = Math.max(0, Math.min(1, box.width / image.width));
        const normH = Math.max(0, Math.min(1, box.height / image.height));
        const edgeMargin = 0.05;
        if (
          normX < edgeMargin ||
          normY < edgeMargin ||
          normX + normW > 1 - edgeMargin ||
          normY + normH > 1 - edgeMargin
        ) {
          qualityCodes.push('near_edge');
        }
        return {
          bbox: {
            x: normX,
            y: normY,
            width: normW,
            height: normH,
          },
          detectionConfidence: Math.min(1, Math.max(0, score)),
          qualityCodes,
          poseOcclusionCodes: [],
          detectorName: PEOPLE_ENGINE.detector,
          detectorVersion: PEOPLE_ENGINE.version,
          provenance: {
            provider: PEOPLE_ENGINE.name,
            model: PEOPLE_ENGINE.detector,
            version: PEOPLE_ENGINE.version,
          },
          embedding: Float32Array.from(detection.descriptor),
        };
      });

      if (hits.length === 0) {
        warnings.push('no_faces_detected');
      }

      return {
        engineName: PEOPLE_ENGINE.name,
        engineVersion: PEOPLE_ENGINE.version,
        hits,
        warnings,
        partial: warnings.length > 0,
        available: true,
        durationMs: Date.now() - started,
      };
    } finally {
      tensor.dispose();
    }
  } catch (error) {
    const code =
      error instanceof Error
        ? error.message.replace(/[^\w.\-:/ ]+/g, '').slice(0, 80) || 'face_engine_failed'
        : 'face_engine_failed';
    return {
      engineName: 'unavailable',
      engineVersion: 'none',
      hits: [],
      warnings: ['face_engine_failed', code],
      partial: true,
      available: false,
      durationMs: Date.now() - started,
    };
  }
}

export function embeddingToBytes(embedding: Float32Array): Buffer {
  return Buffer.from(embedding.buffer, embedding.byteOffset, embedding.byteLength);
}

export function bytesToEmbedding(bytes: Uint8Array): Float32Array {
  return new Float32Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 4));
}

export async function ensurePeopleModels(modelDir: string): Promise<boolean> {
  return ensureFaceApiModels(modelDir);
}

void readFile;
void pathToFileURL;
