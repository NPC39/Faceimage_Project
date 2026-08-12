/**
 * Cosine Similarity & Vector Utility for Face Embeddings.
 *
 * For L2-normalized vectors (|a| = 1, |b| = 1), cosine similarity equals the dot product:
 * similarity(a, b) = a · b = ∑ (a_i * b_i)
 */

export function cosineSimilarity(a: number[], b: number[]): number {
  if (!Array.isArray(a) || !Array.isArray(b)) {
    throw new Error('Invalid input: Embeddings must be arrays of numbers.');
  }

  if (a.length === 0 || b.length === 0) {
    throw new Error('Invalid input: Embeddings cannot be empty.');
  }

  if (a.length !== b.length) {
    throw new Error(`Dimension mismatch: Vector A (${a.length}D) vs Vector B (${b.length}D).`);
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    const valA = a[i];
    const valB = b[i];

    if (!Number.isFinite(valA) || !Number.isFinite(valB)) {
      throw new Error(`Non-finite element detected at index ${i}: A=${valA}, B=${valB}`);
    }

    dotProduct += valA * valB;
    normA += valA * valA;
    normB += valB * valB;
  }

  if (normA === 0 || normB === 0) {
    return 0;
  }

  const similarity = dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));

  // Clamp strictly within [-1.0, 1.0] to prevent floating point imprecision overflow
  return Math.max(-1.0, Math.min(1.0, similarity));
}
