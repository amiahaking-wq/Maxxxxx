/**
 * Supabase Storage Integration
 *
 * Stores generated files persistently in Supabase Storage so they survive
 * Railway container restarts. Files are organized by conversation ID.
 *
 * Setup:
 *   1. Create a free account at https://supabase.com
 *   2. Create a new project
 *   3. Create a storage bucket named "max-files" (set to public or private)
 *   4. Get the project URL and anon key from Settings > API
 *   5. Set in .env:
 *      SUPABASE_URL=https://yourproject.supabase.co
 *      SUPABASE_KEY=your-anon-key
 *      SUPABASE_BUCKET=max-files
 *
 * If Supabase is not configured, files are only stored in the sandbox
 * (ephemeral — lost on Railway restart).
 */

import fs from 'fs';
import path from 'path';
import logger from '../utils/logger.js';

const SUPABASE_URL = process.env.SUPABASE_URL || null;
const SUPABASE_KEY = process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY || null;
const SUPABASE_BUCKET = process.env.SUPABASE_BUCKET || 'max-files';
const SANDBOX = process.env.SANDBOX_WORKSPACE || './sandbox-workspace';

/**
 * Check if Supabase is configured
 */
export function isSupabaseConfigured() {
  return !!(SUPABASE_URL && SUPABASE_KEY);
}

/**
 * Upload a file to Supabase Storage
 * @param {string} filePath - relative path in the sandbox
 * @param {string} conversationId - conversation ID for organization
 * @returns {Promise<Object>} { success, url, path }
 */
export async function uploadToSupabase(filePath, conversationId = 'general') {
  if (!isSupabaseConfigured()) {
    return { success: false, error: 'Supabase not configured' };
  }

  const fullPath = path.resolve(SANDBOX, filePath);
  if (!fs.existsSync(fullPath)) {
    return { success: false, error: 'File not found' };
  }

  try {
    const fileBuffer = fs.readFileSync(fullPath);
    const fileName = path.basename(filePath);
    const storagePath = `${conversationId}/${fileName}`;

    const response = await fetch(
      `${SUPABASE_URL}/storage/v1/object/${SUPABASE_BUCKET}/${storagePath}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/octet-stream',
          'x-upsert': 'true'
        },
        body: fileBuffer
      }
    );

    if (!response.ok) {
      const error = await response.text();
      return { success: false, error };
    }

    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${SUPABASE_BUCKET}/${storagePath}`;

    logger.info('File uploaded to Supabase', { filePath, storagePath });

    return {
      success: true,
      url: publicUrl,
      path: storagePath
    };
  } catch (err) {
    logger.error('Supabase upload failed', { error: err.message });
    return { success: false, error: err.message };
  }
}

/**
 * List all files in a conversation's Supabase folder
 * @param {string} conversationId
 * @returns {Promise<Object>} { success, files }
 */
export async function listSupabaseFiles(conversationId = 'general') {
  if (!isSupabaseConfigured()) {
    return { success: false, error: 'Supabase not configured', files: [] };
  }

  try {
    const response = await fetch(
      `${SUPABASE_URL}/storage/v1/object/list/${SUPABASE_BUCKET}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          prefix: `${conversationId}/`,
          limit: 100,
          offset: 0
        })
      }
    );

    if (!response.ok) {
      return { success: false, error: await response.text(), files: [] };
    }

    const data = await response.json();
    const files = (data || []).map(f => ({
      name: f.name,
      path: f.name,
      size: f.metadata?.size || 0,
      url: `${SUPABASE_URL}/storage/v1/object/public/${SUPABASE_BUCKET}/${conversationId}/${f.name}`,
      lastModified: f.updated_at
    }));

    return { success: true, files };
  } catch (err) {
    logger.error('Supabase list failed', { error: err.message });
    return { success: false, error: err.message, files: [] };
  }
}

/**
 * Download a file from Supabase and save it to the sandbox
 * @param {string} storagePath - path in Supabase (e.g. "conversationId/filename.py")
 * @returns {Promise<Object>} { success, path }
 */
export async function downloadFromSupabase(storagePath) {
  if (!isSupabaseConfigured()) {
    return { success: false, error: 'Supabase not configured' };
  }

  try {
    const url = `${SUPABASE_URL}/storage/v1/object/${SUPABASE_BUCKET}/${storagePath}`;
    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${SUPABASE_KEY}` }
    });

    if (!response.ok) {
      return { success: false, error: `Download failed: ${response.status}` };
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const fileName = path.basename(storagePath);
    const localPath = path.resolve(SANDBOX, fileName);

    fs.writeFileSync(localPath, buffer);

    logger.info('File downloaded from Supabase', { storagePath, localPath: fileName });

    return { success: true, path: fileName, size: buffer.length };
  } catch (err) {
    logger.error('Supabase download failed', { error: err.message });
    return { success: false, error: err.message };
  }
}

export default {
  isSupabaseConfigured,
  uploadToSupabase,
  listSupabaseFiles,
  downloadFromSupabase
};
