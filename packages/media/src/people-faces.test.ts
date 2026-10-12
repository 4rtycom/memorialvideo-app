import { describe, expect, it } from 'vitest';

import { bytesToEmbedding, embeddingToBytes } from './people-faces';

describe('people face helpers', () => {
  it('round-trips embeddings without exposing text labels', () => {
    const embedding = Float32Array.from([0.1, -0.2, 0.3, 0.4]);
    const bytes = embeddingToBytes(embedding);
    const restored = bytesToEmbedding(bytes);
    expect([...restored]).toEqual([...embedding]);
  });
});
