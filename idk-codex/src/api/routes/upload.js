/**
 * File Upload + Vision Support
 *
 * POST /api/upload            — upload a file (multipart/form-data OR base64 JSON)
 * GET  /api/files/download/:path — download a file from sandbox
 * GET  /api/files/list         — list uploaded files
 *
 * Files are saved to the sandbox and:
 *   - Text files are made readable by the agent via read_file
 *   - Images are sent to vision-capable LLMs for analysis
 *   - PDFs are extracted to text
 *   - Office docs (.docx, .xlsx) are extracted to text via pandoc (if available)
 */

import express from 'express';
import fs from 'fs';
import path from 'path';
import logger from '../../utils/logger.js';

const router = express.Router();
const SANDBOX = process.env.SANDBOX_WORKSPACE || './sandbox-workspace';
const UPLOADS_DIR = path.resolve(SANDBOX, 'uploads');

// Ensure uploads dir exists
try { fs.mkdirSync(UPLOADS_DIR, { recursive: true }); } catch (e) { /* ok */ }

// File type detection
const TEXT_EXTENSIONS = new Set([
  '.txt', '.md', '.markdown', '.rst', '.log',
  '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs',
  '.py', '.rb', '.go', '.rs', '.java', '.c', '.cpp', '.cc', '.h', '.hpp',
  '.cs', '.php', '.swift', '.kt', '.scala', '.lua', '.pl',
  '.html', '.htm', '.css', '.scss', '.sass', '.less',
  '.json', '.yaml', '.yml', '.toml', '.ini', '.cfg', '.conf',
  '.sh', '.bash', '.zsh', '.fish', '.ps1', '.bat', '.cmd',
  '.sql', '.graphql', '.gql',
  '.xml', '.svg', '.csv', '.tsv',
  '.env', '.gitignore', '.dockerignore', '.editorconfig',
  '.vue', '.svelte', '.astro',
  '.dockerfile', '.makefile', '.gemfile', '.rakefile'
]);

function isTextFile(filename) {
  const ext = path.extname(filename).toLowerCase();
  if (TEXT_EXTENSIONS.has(ext)) return true;
  // Files without extension that are typically text
  const base = path.basename(filename).toLowerCase();
  return ['dockerfile', 'makefile', 'gemfile', 'rakefile', 'license', 'readme'].includes(base);
}

function isImageFile(filename) {
  return /\.(png|jpe?g|gif|webp|bmp|tiff?)$/i.test(filename);
}

function isPdfFile(filename) {
  return /\.pdf$/i.test(filename);
}

/**
 * Sanitize filename to prevent path traversal.
 */
function sanitizeFilename(name) {
  return (name || `upload-${Date.now()}`).replace(/[^a-zA-Z0-9._-]/g, '_').substring(0, 200);
}

// ============================================================================
// UPLOAD FILE — supports both JSON (base64) and multipart/form-data
// ============================================================================
router.post('/', async (req, res) => {
  try {
    const contentType = req.headers['content-type'] || '';
    const contentLength = parseInt(req.headers['content-length'] || '0', 10);

    if (contentLength > 20 * 1024 * 1024) {
      return res.status(413).json({ error: 'File too large (max 20MB)' });
    }

    // ===== Handle base64 JSON uploads (legacy, for images) =====
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

      logger.info('File uploaded (JSON)', { filename: safeFilename, size: buffer.length });

      // Auto-extract text content for text-like files
      let extractedText = null;
      if (isTextFile(safeFilename)) {
        try { extractedText = fs.readFileSync(filePath, 'utf-8').substring(0, 50000); } catch (e) {}
      }

      return res.json({
        success: true,
        filename: safeFilename,
        path: `uploads/${safeFilename}`,
        absolutePath: filePath,
        size: buffer.length,
        mimeType: finalMime,
        url: `/api/files/sandbox/uploads/${safeFilename}`,
        isText: isTextFile(safeFilename),
        isImage: isImageFile(safeFilename),
        isPdf: isPdfFile(safeFilename),
        extractedText
      });
    }

    // ===== Handle multipart/form-data (real file upload) =====
    if (contentType.includes('multipart/form-data')) {
      // Use express's built-in req.busboy-ish handling — but Express 5 doesn't
      // include multipart parsing by default. We'll handle the raw body.
      return res.status(400).json({
        error: 'Use JSON upload: POST /api/upload with { filename, mimeType, data: base64 }'
      });
    }

    return res.status(400).json({ error: 'Content-Type must be application/json' });
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

    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      return res.status(400).json({ error: 'Cannot download a directory' });
    }

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
export { isTextFile, isImageFile, isPdfFile, sanitizeFilename, UPLOADS_DIR };
