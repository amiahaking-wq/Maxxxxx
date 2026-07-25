/**
 * File Upload + Vision Support
 * 
 * POST /api/upload — upload an image file (multipart/form-data)
 * GET  /api/files/download/:path — download a file from sandbox
 * 
 * Images are saved to the sandbox and can be sent to vision-capable LLMs
 * (Gemini, Groq with Llama Vision) for analysis.
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

// ============================================================================
// UPLOAD IMAGE/FILE
// ============================================================================
router.post('/', (req, res) => {
  try {
    // Express 5 body parser for raw data
    const contentType = req.headers['content-type'] || '';
    const contentLength = parseInt(req.headers['content-length'] || '0', 10);

    if (contentLength > 10 * 1024 * 1024) {
      return res.status(413).json({ error: 'File too large (max 10MB)' });
    }

    // Handle base64 image data (from frontend)
    if (contentType.includes('application/json')) {
      const { image, filename, mimeType } = req.body;

      if (!image) {
        return res.status(400).json({ error: 'image (base64) or file is required' });
      }

      // Remove data URL prefix if present
      const base64Data = image.replace(/^data:[^;]+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');

      const safeFilename = (filename || `upload-${Date.now()}.png`).replace(/[^a-zA-Z0-9._-]/g, '_');
      const filePath = path.join(UPLOADS_DIR, safeFilename);

      fs.writeFileSync(filePath, buffer);

      logger.info('File uploaded', { filename: safeFilename, size: buffer.length });

      return res.json({
        success: true,
        filename: safeFilename,
        path: `uploads/${safeFilename}`,
        size: buffer.length,
        mimeType: mimeType || 'image/png',
        url: `/api/files/sandbox/uploads/${safeFilename}`
      });
    }

    return res.status(400).json({ error: 'Content-Type must be application/json with base64 image' });
  } catch (err) {
    logger.error('Upload failed', { error: err.message });
    res.status(500).json({ error: 'Upload failed: ' + err.message });
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
