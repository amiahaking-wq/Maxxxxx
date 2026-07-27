/**
 * Embedder — Stage 7B
 *
 * Generates 384-dimensional embeddings using @xenova/transformers
 * (Xenova/all-MiniLM-L6-v2 model). Runs locally, completely free,
 * no API key needed. Model is downloaded once (~30MB) and cached.
 *
 * If @xenova/transformers is not installed or the model can't load,
 * all RAG operations gracefully degrade (no context injected).
 */

let _pipeline = null;
let _loadError = null;
let _loadPromise = null;

/**
 * Lazy-load the transformers pipeline. The model downloads on first use.
 * Returns null if the package isn't installed or loading fails.
 */
async function getPipeline() {
  if (_pipeline) return _pipeline;
  if (_loadError) return null;
  if (_loadPromise) return _loadPromise;

  _loadPromise = (async () => {
    try {
      // Dynamic import so the app doesn't crash if the package isn't installed
      const { pipeline } = await import('@xenova/transformers');
      _pipeline = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
        quantized: true  // smaller, faster
      });
      return _pipeline;
    } catch (err) {
      _loadError = err;
      // Don't log on every call — just once
      console.warn('[RAG] Embedder not available:', err.message);
      console.warn('[RAG] Install with: npm install @xenova/transformers');
      return null;
    }
  })();

  return _loadPromise;
}

/**
 * Generate a 384-dim embedding for a text string.
 * @param {string} text
 * @returns {Promise<number[]|null>} embedding vector, or null if unavailable
 */
export async function generateEmbedding(text) {
  const pipe = await getPipeline();
  if (!pipe) return null;

  try {
    const output = await pipe(text, { pooling: 'mean', normalize: true });
    return Array.from(output.data);
  } catch (err) {
    console.warn('[RAG] Embedding generation failed:', err.message);
    return null;
  }
}

/**
 * Split a long document into overlapping word chunks.
 * @param {string} text
 * @param {number} chunkSize - words per chunk (default 500)
 * @param {number} overlap - overlapping words between chunks (default 50)
 * @returns {string[]} array of text chunks
 */
export function chunkText(text, chunkSize = 500, overlap = 50) {
  if (!text) return [];
  const words = text.split(/\s+/).filter(w => w.length > 0);
  if (words.length <= chunkSize) return [text];

  const chunks = [];
  for (let i = 0; i < words.length; i += chunkSize - overlap) {
    const chunk = words.slice(i, i + chunkSize).join(' ');
    if (chunk.trim()) chunks.push(chunk);
    if (i + chunkSize >= words.length) break;
  }
  return chunks;
}

/**
 * Check if the embedder is available (package installed + model loaded).
 */
export async function isEmbedderAvailable() {
  const pipe = await getPipeline();
  return !!pipe;
}

export default { generateEmbedding, chunkText, isEmbedderAvailable };
