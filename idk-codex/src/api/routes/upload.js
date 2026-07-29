/**
 * File Upload + Processing (Phase 2 enhancement)
 *
 * POST /api/upload            — upload file (multipart/form-data OR base64 JSON)
 * GET  /api/files/download/:path — download file from sandbox
 * GET  /api/files/list         — list uploaded files
 *
 * Files are:
 *   1. Saved to sandbox uploads/ dir (always)
 *   2. Uploaded to Supabase Storage if configured (persistent)
 *   3. Text extracted (PDF/Excel/CSV/code) and added to knowledge base
 *   4. Images returned as base64 for vision LLMs
 */

import express from 'express';
import fs from 'fs';
import path from 'path';
import logger from '../../utils/logger.js';

const router = express.Router();
const SANDBOX = process.env.SANDBOX_WORKSPACE || './sandbox-workspace';
const UPLOADS_DIR = path.resolve(SANDBOX, 'uploads');

try { fs.mkdirSync(UPLOADS_DIR, { recursive: true }); } catch (e) { /* ok */ }

const TEXT_EXTENSIONS = new Set([
  '.txt', '.md', '.markdown', '.rst', '.log',
  '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs',
  '.py', '.rb', '.go', '.rs', '.java', '.c', '.cpp', '.h',
  '.cs', '.php', '.swift', '.kt', '.lua', '.pl',
  '.html', '.htm', '.css', '.scss', '.less',
  '.json', '.yaml', '.yml', '.toml', '.ini', '.cfg', '.conf',
  '.sh', '.bash', '.zsh', '.ps1', '.bat', '.cmd',
  '.sql', '.graphql', '.xml', '.svg', '.csv', '.tsv',
  '.env', '.vue', '.svelte', '.astro'
]);

function isTextFile(filename) {
  const ext = path.extname(filename).toLowerCase();
  if (TEXT_EXTENSIONS.has(ext)) return true;
  const base = path.basename(filename).toLowerCase();
  return ['dockerfile', 'makefile', 'gemfile', 'rakefile', 'license', 'readme'].includes(base);
}
function isImageFile(filename) { return /\.(png|jpe?g|gif|webp|bmp|tiff?)$/i.test(filename); }
function isPdfFile(filename) { return /\.pdf$/i.test(filename); }
function isExcelFile(filename) { return /\.(xlsx|xls|ods)$/i.test(filename); }
function isCsvFile(filename) { return /\.(csv|tsv)$/i.test(filename); }
function sanitizeFilename(name) {
  return (name || `upload-${Date.now()}`).replace(/[^a-zA-Z0-9._-]/g, '_').substring(0, 200);
}

// ============================================================================
// SUPABASE STORAGE UPLOAD (optional — only if SUPABASE_URL + SERVICE_KEY set)
// ============================================================================
async function uploadToSupabaseStorage(buffer, filename, userId) {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;

  try {
    const storagePath = `${userId || 'anonymous'}/${Date.now()}_${filename}`;
    const resp = await fetch(`${SUPABASE_URL}/storage/v1/object/max-uploads/${storagePath}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'apikey': SUPABASE_KEY,
        'Content-Type': 'application/octet-stream',
        'x-upsert': 'false'
      },
      body: buffer
    });
    if (!resp.ok) {
      logger.warn('Supabase storage upload failed', { status: resp.status });
      return null;
    }
    return `${SUPABASE_URL}/storage/v1/object/public/max-uploads/${storagePath}`;
  } catch (e) {
    logger.warn('Supabase storage error', { error: e.message });
    return null;
  }
}

// ============================================================================
// EXTRACT TEXT FROM PDF / EXCEL / CSV
// ============================================================================
async function extractTextFromPdf(buffer) {
  try {
    const pdfParse = (await import('pdf-parse')).default;
    const data = await pdfParse(buffer);
    return (data.text || '').substring(0, 50000);
  } catch (e) {
    logger.warn('PDF extraction failed', { error: e.message });
    return null;
  }
}

async function extractTextFromExcel(buffer) {
  try {
    const XLSX = (await import('xlsx')).default;
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheets = workbook.SheetNames.map(name => {
      const sheet = XLSX.utils.sheet_to_csv(workbook.Sheets[name]);
      return `Sheet: ${name}\n${sheet}`;
    });
    return sheets.join('\n\n').substring(0, 50000);
  } catch (e) {
    logger.warn('Excel extraction failed', { error: e.message });
    return null;
  }
}

function extractTextFromCsv(buffer) {
  try {
    return buffer.toString('utf-8').substring(0, 50000);
  } catch (e) { return null; }
}

// ============================================================================
// ADD TO KNOWLEDGE BASE (RAG)
// ============================================================================
async function addToKnowledgeBase(userId, title, content, source) {
  try {
    const { knowledgeStore } = await import('../../rag/knowledge-store.js');
    await knowledgeStore.addDocument(userId, {
      title, content, type: 'uploaded_file', source
    });
    logger.info('File added to knowledge base', { userId, title });
  } catch (e) {
    logger.warn('Knowledge base add failed (non-fatal)', { error: e.message });
  }
}

// ============================================================================
// UPLOAD ENDPOINT
// ============================================================================
router.post('/', async (req, res) => {
  try {
    const contentType = req.headers['content-type'] || '';
    const contentLength = parseInt(req.headers['content-length'] || '0', 10);
    if (contentLength > 50 * 1024 * 1024) {
      return res.status(413).json({ error: 'File too large (max 50MB)' });
    }

    const userId = req.user?.id || 'anonymous';

    if (contentType.includes('application/json')) {
      const { image, filename, mimeType, file, data } = req.body;
      const base64Data = image || file || data;
      const finalName = filename || `upload-${Date.now()}.png`;
      const finalMime = mimeType || 'application/octet-stream';

      if (!base64Data) {
        return res.status(400).json({ error: 'image/file/data (base64) is required' });
      }

      const cleaned = base64Data.replace(/^data:[^;]+;base64,/, '');
      const buffer = Buffer.from(cleaned, 'base64');
      const safeFilename = sanitizeFilename(finalName);
      const filePath = path.join(UPLOADS_DIR, safeFilename);
      fs.writeFileSync(filePath, buffer);

      logger.info('File uploaded', { filename: safeFilename, size: buffer.length, userId });

      // Try Supabase Storage upload (best-effort)
      const publicUrl = await uploadToSupabaseStorage(buffer, safeFilename, userId);

      // Extract text content based on file type
      let extractedText = null;
      if (isTextFile(safeFilename)) {
        try { extractedText = fs.readFileSync(filePath, 'utf-8').substring(0, 50000); } catch (e) {}
      } else if (isPdfFile(safeFilename)) {
        extractedText = await extractTextFromPdf(buffer);
      } else if (isExcelFile(safeFilename)) {
        extractedText = await extractTextFromExcel(buffer);
      } else if (isCsvFile(safeFilename)) {
        extractedText = extractTextFromCsv(buffer);
      } else if (isImageFile(safeFilename)) {
        extractedText = `[IMAGE: ${safeFilename}]`;
      }

      // Add to knowledge base if we got text
      if (extractedText && !extractedText.startsWith('[IMAGE')) {
        await addToKnowledgeBase(userId, safeFilename, extractedText, publicUrl || `local:${safeFilename}`);
      }

      return res.json({
        success: true,
        filename: safeFilename,
        path: `uploads/${safeFilename}`,
        absolutePath: filePath,
        size: buffer.length,
        mimeType: finalMime,
        url: publicUrl || `/api/files/sandbox/uploads/${safeFilename}`,
        publicUrl,
        isText: isTextFile(safeFilename),
        isImage: isImageFile(safeFilename),
        isPdf: isPdfFile(safeFilename),
        isExcel: isExcelFile(safeFilename),
        isCsv: isCsvFile(safeFilename),
        extractedText: extractedText ? extractedText.substring(0, 2000) : null,
        addedToKnowledgeBase: !!extractedText && !extractedText.startsWith('[IMAGE')
      });
    }

    return res.status(400).json({ error: 'Content-Type must be application/json with base64 data' });
  } catch (err) {
    logger.error('Upload failed', { error: err.message });
    res.status(500).json({ error: 'Upload failed: ' + err.message });
  }
});

// ============================================================================
// LIST UPLOADED FILES
// ============================================================================
router.get('/list', (req, res) => {
  try {
    const files = [];
    if (fs.existsSync(UPLOADS_DIR)) {
      const entries = fs.readdirSync(UPLOADS_DIR, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile()) {
          const fullPath = path.join(UPLOADS_DIR, entry.name);
          const stat = fs.statSync(fullPath);
          files.push({
            name: entry.name,
            path: `uploads/${entry.name}`,
            url: `/api/files/sandbox/uploads/${entry.name}`,
            size: stat.size,
            created: stat.mtime,
            isText: isTextFile(entry.name),
            isImage: isImageFile(entry.name)
          });
        }
      }
    }
    res.json({ success: true, files });
  } catch (err) {
    res.status(500).json({ error: 'Failed to list files: ' + err.message });
  }
});

// ============================================================================
// DOWNLOAD FILE FROM SANDBOX
// ============================================================================
router.get(/^\/download\/?(.*)$/, (req, res) => {
  try {
    const requestedPath = req.params[0] || '';
    const fullPath = path.resolve(SANDBOX, requestedPath);
    if (!fullPath.startsWith(path.resolve(SANDBOX))) {
      return res.status(403).json({ error: 'Access denied' });
    }
    if (!fs.existsSync(fullPath)) return res.status(404).json({ error: 'File not found' });
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) return res.status(400).json({ error: 'Cannot download a directory' });
    const filename = path.basename(fullPath);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', stat.size);
    const stream = fs.createReadStream(fullPath);
    stream.pipe(res);
  } catch (err) {
    logger.error('Download failed', { error: err.message });
    res.status(500).json({ error: 'Download failed' });
  }
});

export default router;
export { isTextFile, isImageFile, isPdfFile, isExcelFile, isCsvFile, sanitizeFilename, UPLOADS_DIR };
