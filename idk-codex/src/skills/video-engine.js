/**
 * Video Processing Skills
 *
 * FFmpeg integration module for programmatic video operations.
 * Executes FFmpeg CLI commands in sandbox with background process management.
 * Used by MediaDirector micro-agent.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import logger from '../utils/logger.js';
import { existsSync } from 'fs';
import { join } from 'path';

const execAsync = promisify(exec);

/**
 * Safely parse a fraction string like "30/1" to a number
 * @param {string} fraction - Fraction string (e.g., "30/1")
 * @returns {number} - Parsed number
 */
function parseFraction(fraction) {
  if (!fraction || typeof fraction !== 'string') return 0;
  const parts = fraction.split('/');
  if (parts.length !== 2) return parseFloat(fraction) || 0;
  const numerator = parseFloat(parts[0]);
  const denominator = parseFloat(parts[1]);
  if (isNaN(numerator) || isNaN(denominator) || denominator === 0) return 0;
  return numerator / denominator;
}

/**
 * FFmpeg path configuration
 */
const FFMPEG_PATH = process.env.MAX_FFMPEG_PATH || 'ffmpeg';
const FFPROBE_PATH = process.env.MAX_FFPROBE_PATH || 'ffprobe';

/**
 * Maximum execution time for FFmpeg operations (10 minutes)
 */
const MAX_EXECUTION_TIME = 10 * 60 * 1000;

/**
 * Execute FFmpeg operation
 *
 * @param {string} command - FFmpeg command to execute
 * @param {Object} options - Execution options
 * @param {boolean} options.background - Run in background (don't block main loop)
 * @param {number} options.timeout - Timeout in milliseconds
 * @returns {Promise<Object>} Execution result
 */
export async function executeFFmpegOperation(command, options = {}) {
  const {
    background = false,
    timeout = MAX_EXECUTION_TIME
  } = options;

  try {
    logger.info('Executing FFmpeg operation', {
      command: command.substring(0, 200),
      background,
      timeout
    });

    // Validate FFmpeg is available
    if (!await isFFmpegAvailable()) {
      throw new Error('FFmpeg is not available. Install FFmpeg or set MAX_FFMPEG_PATH.');
    }

    // Sanitize command for security
    const sanitizedCommand = sanitizeFFmpegCommand(command);

    if (background) {
      // Run in background, return immediately
      execAsync(sanitizedCommand, { timeout, maxBuffer: 10 * 1024 * 1024 })
        .then(({ stdout, stderr }) => {
          logger.info('Background FFmpeg operation completed', {
            command: sanitizedCommand.substring(0, 100)
          });
        })
        .catch(error => {
          logger.error('Background FFmpeg operation failed', {
            error: error.message,
            command: sanitizedCommand.substring(0, 100)
          });
        });

      return {
        success: true,
        background: true,
        message: 'FFmpeg operation started in background'
      };
    }

    // Run synchronously
    const { stdout, stderr } = await execAsync(sanitizedCommand, {
      timeout,
      maxBuffer: 10 * 1024 * 1024
    });

    logger.info('FFmpeg operation completed', {
      command: sanitizedCommand.substring(0, 100)
    });

    return {
      success: true,
      output: stdout,
      stderr,
      command: sanitizedCommand
    };

  } catch (error) {
    logger.error('FFmpeg operation failed', {
      error: error.message,
      command: command.substring(0, 100)
    });

    return {
      success: false,
      error: error.message,
      stderr: error.stderr,
      command: command.substring(0, 200)
    };
  }
}

/**
 * Parse JSON timeline and execute operations
 *
 * @param {Object} timeline - Timeline object
 * @param {Array} timeline.operations - Array of operations
 * @param {string} timeline.quality - Quality preset
 * @param {string} timeline.preset - Encoding preset
 * @returns {Promise<Object>} Execution result
 */
export async function executeTimeline(timeline) {
  try {
    logger.info('Executing video timeline', {
      operationCount: timeline.operations?.length || 0,
      quality: timeline.quality,
      preset: timeline.preset
    });

    if (!timeline.operations || timeline.operations.length === 0) {
      throw new Error('Timeline has no operations');
    }

    const results = [];

    for (let i = 0; i < timeline.operations.length; i++) {
      const operation = timeline.operations[i];

      logger.info(`Executing operation ${i + 1}/${timeline.operations.length}`, {
        type: operation.type,
        input: operation.input,
        output: operation.output
      });

      const command = buildFFmpegCommand(operation, timeline);
      const result = await executeFFmpegOperation(command);

      results.push({
        operation: i + 1,
        type: operation.type,
        success: result.success,
        error: result.error
      });

      if (!result.success) {
        logger.warn('Operation failed, continuing timeline', {
          operation: i + 1,
          type: operation.type,
          error: result.error
        });
      }
    }

    const successCount = results.filter(r => r.success).length;

    return {
      success: successCount === results.length,
      totalOperations: results.length,
      successfulOperations: successCount,
      failedOperations: results.length - successCount,
      results
    };

  } catch (error) {
    logger.error('Timeline execution failed', {
      error: error.message
    });

    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Build FFmpeg command from operation definition
 *
 * @param {Object} operation - Operation definition
 * @param {Object} timeline - Timeline context
 * @returns {string} FFmpeg command
 */
function buildFFmpegCommand(operation, timeline) {
  const { type, input, output, params } = operation;

  // Base command
  let command = `${FFMPEG_PATH} -y -i "${input}"`;

  // Quality presets
  const quality = timeline.quality || 'medium';
  const preset = timeline.preset || 'medium';

  switch (type) {
    case 'trim':
      // Trim video to specific time range
      if (params.start) {
        command += ` -ss ${params.start}`;
      }
      if (params.duration) {
        command += ` -t ${params.duration}`;
      }
      break;

    case 'cut':
      // Cut out a section (inverse of trim)
      throw new Error('Cut operation requires multiple FFmpeg passes. Use trim instead.');

    case 'concat':
      // Concatenate multiple videos
      if (!params.inputs || params.inputs.length < 2) {
        throw new Error('Concat requires at least 2 input files');
      }
      const concatList = params.inputs.map(f => `file '${f}'`).join('\n');
      command = `echo "${concatList}" | ${FFMPEG_PATH} -y -f concat -safe 0 -i - `;
      break;

    case 'overlay':
      // Overlay video/image on top
      if (!params.overlay) {
        throw new Error('Overlay operation requires overlay file');
      }
      command += ` -i "${params.overlay}"`;
      command += ` -filter_complex "[0:v][1:v]overlay=${params.x || 0}:${params.y || 0}"`;
      break;

    case 'filter':
      // Apply video filter
      if (!params.filter) {
        throw new Error('Filter operation requires filter parameter');
      }
      command += ` -vf "${params.filter}"`;
      break;

    case 'encode':
      // Re-encode with specific settings (handled below)
      break;

    default:
      throw new Error(`Unknown operation type: ${type}`);
  }

  // Quality settings
  const qualityMap = {
    high: { crf: 18, preset: 'slow' },
    medium: { crf: 23, preset: 'medium' },
    low: { crf: 28, preset: 'fast' }
  };

  const qualitySettings = qualityMap[quality] || qualityMap.medium;

  // Encoding parameters
  command += ` -c:v libx264 -preset ${preset || qualitySettings.preset}`;
  command += ` -crf ${params.crf || qualitySettings.crf}`;
  command += ` -c:a aac -b:a ${params.audioBitrate || '128k'}`;

  // Additional parameters
  if (params.width && params.height) {
    command += ` -s ${params.width}x${params.height}`;
  }
  if (params.fps) {
    command += ` -r ${params.fps}`;
  }

  // Output
  command += ` "${output}"`;

  return command;
}

/**
 * Get video metadata using ffprobe
 *
 * @param {string} filePath - Path to video file
 * @returns {Promise<Object>} Video metadata
 */
export async function getVideoMetadata(filePath) {
  try {
    if (!existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const command = `${FFPROBE_PATH} -v quiet -print_format json -show_format -show_streams "${filePath}"`;

    const { stdout } = await execAsync(command, {
      timeout: 30000,
      maxBuffer: 5 * 1024 * 1024
    });

    const metadata = JSON.parse(stdout);

    // Extract useful information
    const videoStream = metadata.streams.find(s => s.codec_type === 'video');
    const audioStream = metadata.streams.find(s => s.codec_type === 'audio');

    return {
      success: true,
      format: metadata.format?.format_name,
      duration: parseFloat(metadata.format?.duration),
      size: parseInt(metadata.format?.size),
      bitrate: parseInt(metadata.format?.bit_rate),
      video: videoStream ? {
        codec: videoStream.codec_name,
        width: videoStream.width,
        height: videoStream.height,
        fps: parseFraction(videoStream.r_frame_rate),
        bitrate: parseInt(videoStream.bit_rate)
      } : null,
      audio: audioStream ? {
        codec: audioStream.codec_name,
        sampleRate: parseInt(audioStream.sample_rate),
        channels: audioStream.channels,
        bitrate: parseInt(audioStream.bit_rate)
      } : null
    };

  } catch (error) {
    logger.error('Failed to get video metadata', {
      error: error.message,
      filePath
    });

    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Check if FFmpeg is available
 *
 * @returns {Promise<boolean>} True if FFmpeg is available
 */
async function isFFmpegAvailable() {
  try {
    await execAsync(`${FFMPEG_PATH} -version`, { timeout: 5000 });
    return true;
  } catch (error) {
    logger.warn('FFmpeg not available', {
      path: FFMPEG_PATH,
      error: error.message
    });
    return false;
  }
}

/**
 * Sanitize FFmpeg command for security
 *
 * @param {string} command - Raw command
 * @returns {string} Sanitized command
 */
function sanitizeFFmpegCommand(command) {
  // Remove dangerous characters and command injection attempts
  const dangerous = [';', '|', '&', '$', '`', '\n', '\r'];

  let sanitized = command;

  for (const char of dangerous) {
    sanitized = sanitized.replace(new RegExp('\\' + char, 'g'), '');
  }

  // Ensure command starts with ffmpeg
  if (!sanitized.trim().startsWith(FFMPEG_PATH) && !sanitized.trim().startsWith('echo')) {
    throw new Error('Invalid FFmpeg command');
  }

  return sanitized;
}

/**
 * Validate timeline structure
 *
 * @param {Object} timeline - Timeline to validate
 * @returns {Object} Validation result
 */
export function validateTimeline(timeline) {
  const errors = [];

  if (!timeline) {
    errors.push('Timeline is null or undefined');
  }

  if (!timeline.operations || !Array.isArray(timeline.operations)) {
    errors.push('Timeline must have operations array');
  }

  if (timeline.operations) {
    timeline.operations.forEach((op, index) => {
      if (!op.type) {
        errors.push(`Operation ${index}: missing type`);
      }
      if (!op.input && op.type !== 'concat') {
        errors.push(`Operation ${index}: missing input`);
      }
      if (!op.output) {
        errors.push(`Operation ${index}: missing output`);
      }
    });
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

export default {
  executeFFmpegOperation,
  executeTimeline,
  getVideoMetadata,
  validateTimeline
};
