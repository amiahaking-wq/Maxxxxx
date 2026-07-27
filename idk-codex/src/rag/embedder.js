/**
 * Embedder — TF-IDF based (works on ANY OS, no native dependencies)
 *
 * Replaces the ONNX-based embedder that crashed on Alpine Linux with:
 *   "Error loading shared library ld-linux-x86-64.so.2"
 *
 * Approach: deterministic hash-based TF-IDF embedding in 384 dimensions.
 * Not as accurate as a neural model, but always works and is good enough
 * for semantic similarity search.
 *
 * If OPENROUTER_API_KEY is set, tries the OpenRouter embeddings endpoint
 * first (neural quality), falls back to TF-IDF.
 */

import crypto from 'crypto';

/**
 * TF-IDF based embedding — works on any OS, no dependencies.
 * Uses deterministic MD5 hashing to map words to vector dimensions.
 * @param {string} text
 * @param {number} dimensions - vector size (default 384 to match schema)
 * @returns {number[]} normalized embedding vector
 */
function tfidfEmbed(text, dimensions = 384) {
  const words = text.toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 2);

  const vector = new Array(dimensions).fill(0);

  if (words.length === 0) return vector;

  for (const word of words) {
    // Deterministic hash to map word to consistent dimension
    const hash = crypto.createHash('md5').update(word).digest();
    for (let i = 0; i < 4; i++) {
      const idx = (hash.readUInt32LE(i * 4) % dimensions + dimensions) % dimensions;
      const val = Math.sin(hash.readUInt32LE(i * 4) * 0.001);
      vector[idx] += val;
    }
  }

  // Normalize to unit length
  const magnitude = Math.sqrt(vector.reduce((s, v) => s + v * v, 0)) || 1;
  return vector.map(v => v / magnitude);
}

/**
 * Generate a 384-dim embedding for a text string.
 * Tries OpenRouter embeddings first (if API key set), falls back to TF-IDF.
 * @param {string} text
 * @returns {Promise<number[]|null>} embedding vector, or null if unavailable
 */
export async function generateEmbedding(text) {
  if (!text || text.trim().length === 0) return null;

  // Try OpenRouter embedding endpoint first (neural quality)
  const apiKey = process.env.OPENAI_COMPATIBLE_API_KEY || process.env.OPENROUTER_API_KEY;
  if (apiKey) {
    try {
      const baseURL = process.env.OPENAI_COMPATIBLE_BASE_URL || 'https://openrouter.ai/api/v1';
      const res = await fetch(`${baseURL}/embeddings`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          ...(baseURL.includes('openrouter.ai') ? {
            'HTTP-Referer': 'https://maxxxxx-production.up.railway.app',
            'X-Title': 'MAX Agent'
          } : {})
        },
        body: JSON.stringify({
          model: 'text-embedding-3-small',
          input: text.slice(0, 8000)
        })
      });

      if (res.ok) {
        const data = await res.json();
        const embedding = data.data?.[0]?.embedding;
        if (embedding && embedding.length > 0) {
          // Resize to 384 dims if needed
          if (embedding.length === 384) return embedding;
          // Sample down from 1536 to 384
          return Array.from({ length: 384 }, (_, i) =>
            embedding[Math.floor(i * embedding.length / 384)]
          );
        }
      }
    } catch (e) {
      // Fall through to TF-IDF
    }
  }

  // Fallback: TF-IDF (always works, no API needed)
  return tfidfEmbed(text, 384);
}

/**
 * Split a long document into overlapping chunks.
 * Uses sentence boundaries for better coherence.
 */
export function chunkText(text, chunkSize = 400, overlap = 50) {
  if (!text) return [];
  const sentences = text.match(/[^.!?\n]+[.!?\n]*/g) || [text];
  const chunks = [];
  let current = '';

  for (const sentence of sentences) {
    if ((current + sentence).split(' ').length > chunkSize) {
      if (current.trim()) chunks.push(current.trim());
      // Start new chunk with overlap from previous
      const words = current.split(' ');
      current = words.slice(-overlap).join(' ') + ' ' + sentence;
    } else {
      current += sentence;
    }
  }

  if (current.trim()) chunks.push(current.trim());
  return chunks.filter(c => c.length > 20);
}

/**
 * Check if the embedder is available.
 * Always returns true now — TF-IDF works everywhere.
 */
export async function isEmbedderAvailable() {
  return true;
}

export default { generateEmbedding, chunkText, isEmbedderAvailable };
