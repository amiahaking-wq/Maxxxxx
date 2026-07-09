/**
 * Workspace Context - handles large repositories without loading every file into the prompt
 *
 * For a "billion line" codebase, we cannot pass all content to the LLM. Instead:
 *   - Index the workspace (file paths, sizes, extensions)
 *   - Build a simple inverted index of terms from relative paths
 *   - Match files against keywords extracted from the task
 *   - Return full content only for small files, and snippets/summaries for large files
 *
 * This is a defensive, cost-free approach: no embedding model calls, no vector DB.
 * It works best with a local model configured with a large context window.
 */

import path from 'path';
import fs from 'fs/promises';
import { readDirectoryTree, existsSafe, readFileSafe } from '../utils/filesystem.js';
import { estimateTokens } from './context-manager.js';
import logger from '../utils/logger.js';

const DEFAULT_MAX_FILES = 20;
const DEFAULT_SNIPPET_CHARS = 4000;
const MAX_FILE_SIZE = 1024 * 1024; // 1 MB per file - skip full read beyond this

/**
 * Extract simple keywords from a task string
 * @param {string} task
 * @returns {string[]}
 */
export function extractKeywords(task) {
  if (!task) return [];
  return task
    .toLowerCase()
    .replace(/[^a-z0-9_\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !['the', 'and', 'for', 'with', 'from', 'that', 'this', 'you', 'are', 'can', 'use', 'add', 'new', 'all', 'any', 'the', 'and'].includes(w))
    .slice(0, 20);
}

/**
 * Score a file path by how many keywords it contains
 * @param {string} filePath
 * @param {string[]} keywords
 * @returns {number}
 */
export function scoreFile(filePath, keywords) {
  const lower = filePath.toLowerCase();
  let score = 0;
  for (const keyword of keywords) {
    if (lower.includes(keyword)) score += 1;
  }
  return score;
}

/**
 * Count lines in a string
 * @param {string} content
 * @returns {number}
 */
export function countLines(content) {
  if (!content) return 0;
  return content.split(/\r?\n/).length;
}

/**
 * Read a snippet of a file, preferring the start (headers/imports) and any
 * function/class/section that matches the keywords.
 * @param {string} filePath
 * @param {string[]} keywords
 * @param {number} maxSnippetChars
 * @returns {Promise<string>}
 */
export async function readFileSnippet(filePath, keywords = [], maxSnippetChars = DEFAULT_SNIPPET_CHARS) {
  try {
    const stats = await fs.stat(filePath);
    if (stats.size > MAX_FILE_SIZE) {
      return `[file too large: ${stats.size} bytes, path: ${filePath}]`;
    }

    const content = await readFileSafe(filePath);
    if (!content) return `[empty file: ${filePath}]`;

    const lines = content.split(/\r?\n/);
    const start = lines.slice(0, 80).join('\n');
    const matches = [];

    if (keywords.length > 0) {
      for (const line of lines) {
        const lower = line.toLowerCase();
        for (const keyword of keywords) {
          if (lower.includes(keyword)) {
            matches.push(line);
            break;
          }
        }
      }
    }

    const relevant = matches.length > 0 ? `\n\n--- relevant lines ---\n${matches.slice(0, 40).join('\n')}` : '';
    const snippet = `${start}${relevant}`.slice(0, maxSnippetChars);
    return snippet + (content.length > snippet.length ? '\n\n[...file truncated...]' : '');
  } catch (error) {
    logger.warn('Failed to read file snippet', { filePath, error: error.message });
    return `[error reading ${filePath}]`;
  }
}

/**
 * Build a workspace context string for a task.
 * @param {string} workspacePath
 * @param {string} task
 * @param {Object} options
 * @param {number} options.maxFiles
 * @param {number} options.maxSnippetChars
 * @param {number} options.maxTotalTokens
 * @returns {Promise<string>}
 */
export async function buildWorkspaceContext(workspacePath, task, options = {}) {
  const maxFiles = options.maxFiles || DEFAULT_MAX_FILES;
  const maxSnippetChars = options.maxSnippetChars || DEFAULT_SNIPPET_CHARS;
  const maxTotalTokens = options.maxTotalTokens || 12000;

  const keywords = extractKeywords(task);
  logger.info('Building workspace context', {
    workspacePath,
    keywords,
    maxFiles,
    maxTotalTokens
  });

  const files = await readDirectoryTree(workspacePath, 4);

  // Sort by relevance score descending, then by path length (shorter paths first)
  const scored = files
    .map((f) => {
      const relative = path.relative(workspacePath, f);
      return { path: f, relative, score: scoreFile(relative, keywords) };
    })
    .filter((f) => f.score > 0 || !keywords.length)
    .sort((a, b) => b.score - a.score || a.relative.length - b.relative.length)
    .slice(0, maxFiles);

  // If no relevant files, include the first N files from the tree
  const filesToRead = scored.length > 0 ? scored : files.slice(0, maxFiles).map((f) => ({ path: f, relative: path.relative(workspacePath, f), score: 0 }));

  let context = `Workspace: ${workspacePath}\nFiles: ${files.length} total\n`;
  let currentTokens = estimateTokens(context);

  for (const { path: filePath, relative } of filesToRead) {
    const availableTokens = maxTotalTokens - currentTokens;
    if (availableTokens <= 0) break;

    const availableChars = Math.max(0, availableTokens * 4 - 50); // 4 chars per token, leave header overhead
    const snippet = await readFileSnippet(filePath, keywords, Math.min(maxSnippetChars, availableChars));
    const fileHeader = `\n--- ${relative} ---\n`;
    const fileContext = fileHeader + snippet;
    const fileTokens = estimateTokens(fileContext);

    if (currentTokens + fileTokens > maxTotalTokens) {
      break;
    }

    context += fileContext;
    currentTokens += fileTokens;
  }

  return context;
}

/**
 * Workspace context class for session caching
 */
export class WorkspaceContext {
  constructor(workspacePath, options = {}) {
    this.workspacePath = workspacePath;
    this.options = options;
    this.cache = null;
  }

  /**
   * @param {string} task
   * @returns {Promise<string>}
   */
  async getContext(task) {
    if (this.cache) return this.cache;
    this.cache = await buildWorkspaceContext(this.workspacePath, task, this.options);
    return this.cache;
  }

  /**
   * Invalidate the cached context
   */
  invalidate() {
    this.cache = null;
  }
}

export default WorkspaceContext;
