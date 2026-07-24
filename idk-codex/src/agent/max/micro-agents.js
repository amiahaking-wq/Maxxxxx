/**
 * MAX Micro-Agents
 *
 * Transient specialized agents spawned by MAX orchestrator:
 * - SystemArchitect: Database schemas, technical documentation
 * - FullStackEngineer: Modular code generation following CLAUDE.md
 * - DevOpsEngineer: Docker multi-stage builds, cloud workflows
 * - MediaDirector: JSON timelines for video processing
 */

import { SpecialistAgent } from '../specialists/base.js';
import { completion } from '../../llm/adapter.js';
import { executeFFmpegOperation } from '../../skills/video-engine.js';
import logger from '../../utils/logger.js';
import { readFileSync } from 'fs';
import { join } from 'path';
import { writeFileSafe } from '../../utils/filesystem.js';

/**
 * System Architect Micro-Agent
 * Handles database schemas, architecture decisions, technical documentation
 */
export class SystemArchitect extends SpecialistAgent {
  constructor() {
    super(
      'System Architect',
      ['database', 'schema', 'architecture', 'documentation', 'design'],
      'Creates database schemas and technical documentation'
    );
  }

  async execute(task, context) {
    this.log('Executing architecture task', {
      description: task.description
    });

    try {
      const prompt = `You are a System Architect. Execute this task:

Task: ${task.description}

Context:
${context.dependencies ? JSON.stringify(context.dependencies, null, 2) : 'No dependencies'}

Guidelines:
1. Follow database best practices (normalized schemas, proper indexes)
2. Use SQLite syntax for schema definitions
3. Document all architectural decisions
4. Consider scalability and maintainability
5. Follow existing patterns from the codebase

If creating database schema:
- Use CREATE TABLE IF NOT EXISTS
- Include proper foreign keys and indexes
- Add comments for documentation

If creating documentation:
- Use clear, concise markdown
- Include examples and diagrams where helpful
- Follow existing documentation patterns

Return your response in this JSON format:
{
  "type": "schema|documentation|design",
  "content": "Your output here",
  "files": [{"path": "path/to/file", "content": "file content"}],
  "notes": "Any important notes or decisions"
}`;

      const response = await completion({
        messages: [
          { role: 'system', content: 'You are an expert system architect. Output only valid JSON.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.2,
        maxTokens: 4000,
        taskType: 'complex'
      });

      // Parse response
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('Failed to extract JSON from architecture response');
      }

      const result = JSON.parse(jsonMatch[0]);

      // Write files if specified
      if (result.files && result.files.length > 0) {
        for (const file of result.files) {
          await writeFileSafe(file.path, file.content);
          this.log('Created file', { path: file.path });
        }
      }

      return this.success(result, 'Architecture task completed');

    } catch (error) {
      this.logError('Architecture task failed', error);
      return this.failure(error.message);
    }
  }
}

/**
 * Full-Stack Engineer Micro-Agent
 * Handles modular code generation following CLAUDE.md principles
 */
export class FullStackEngineer extends SpecialistAgent {
  constructor() {
    super(
      'Full-Stack Engineer',
      ['code', 'implementation', 'refactor', 'api', 'frontend', 'backend'],
      'Generates modular code following CLAUDE.md standards'
    );
  }

  async execute(task, context) {
    this.log('Executing engineering task', {
      description: task.description
    });

    try {
      // Read CLAUDE.md for coding standards
      let claudeMd = '';
      try {
        claudeMd = readFileSync(join(process.cwd(), 'CLAUDE.md'), 'utf-8');
      } catch (error) {
        logger.warn('CLAUDE.md not found, using default standards');
      }

      const prompt = `You are a Full-Stack Engineer. Execute this task:

Task: ${task.description}

Context:
${context.dependencies ? JSON.stringify(context.dependencies, null, 2) : 'No dependencies'}

Coding Standards (from CLAUDE.md):
${claudeMd ? claudeMd.substring(0, 2000) : 'Use ES6 modules, async/await, proper error handling, winston logger'}

Guidelines:
1. Follow CLAUDE.md principles (surgical changes, simplicity first)
2. Use ES6 module syntax (import/export)
3. Prefer async/await over callbacks
4. Always use try-catch for async operations
5. Use winston logger, NOT console.log
6. Add JSDoc comments for all exported functions
7. Handle errors gracefully
8. Keep functions focused and small

Return your response in this JSON format:
{
  "files": [
    {
      "path": "path/to/file.js",
      "content": "complete file content",
      "operation": "create|update|delete"
    }
  ],
  "tests": [
    {
      "path": "path/to/test.js",
      "content": "test file content"
    }
  ],
  "summary": "Brief summary of changes",
  "notes": "Any important implementation notes"
}`;

      const response = await completion({
        messages: [
          { role: 'system', content: 'You are an expert full-stack engineer. Output only valid JSON. Follow CLAUDE.md principles strictly.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3,
        maxTokens: 6000,
        taskType: 'generation'
      });

      // Parse response
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('Failed to extract JSON from engineering response');
      }

      const result = JSON.parse(jsonMatch[0]);

      // Write files
      if (result.files && result.files.length > 0) {
        for (const file of result.files) {
          if (file.operation === 'delete') {
            this.log('File deletion requested (skipping for safety)', { path: file.path });
            continue;
          }

          await writeFileSafe(file.path, file.content);
          this.log('Written file', { path: file.path, operation: file.operation });
        }
      }

      // Write test files
      if (result.tests && result.tests.length > 0) {
        for (const test of result.tests) {
          await writeFileSafe(test.path, test.content);
          this.log('Written test file', { path: test.path });
        }
      }

      return this.success(result, 'Engineering task completed');

    } catch (error) {
      this.logError('Engineering task failed', error);
      return this.failure(error.message);
    }
  }
}

/**
 * DevOps Engineer Micro-Agent
 * Handles Docker, CI/CD, deployment configurations, cloud workflows
 */
export class DevOpsEngineer extends SpecialistAgent {
  constructor() {
    super(
      'DevOps Engineer',
      ['docker', 'deployment', 'ci/cd', 'cloud', 'infrastructure', 'workflow'],
      'Creates Docker configs and deployment workflows'
    );
  }

  async execute(task, context) {
    this.log('Executing DevOps task', {
      description: task.description
    });

    try {
      const prompt = `You are a DevOps Engineer. Execute this task:

Task: ${task.description}

Context:
${context.dependencies ? JSON.stringify(context.dependencies, null, 2) : 'No dependencies'}

Guidelines:
1. Use Docker multi-stage builds for optimization
2. Follow security best practices (non-root users, minimal base images)
3. Optimize for 1GB RAM constraint (Railway environment)
4. Use environment variables for configuration
5. Include health checks and proper logging
6. Follow 12-factor app principles

For Docker:
- Use alpine or slim base images
- Combine RUN commands to reduce layers
- Use .dockerignore to exclude unnecessary files
- Add HEALTHCHECK for container monitoring

For CI/CD:
- Use GitHub Actions for automation
- Include testing and validation steps
- Use secrets for sensitive data
- Add deployment approval steps for production

Return your response in this JSON format:
{
  "files": [
    {
      "path": "Dockerfile|.github/workflows/deploy.yml|docker-compose.yml",
      "content": "file content"
    }
  ],
  "commands": ["command to run"],
  "summary": "Brief summary of DevOps changes",
  "notes": "Deployment notes and considerations"
}`;

      const response = await completion({
        messages: [
          { role: 'system', content: 'You are an expert DevOps engineer. Output only valid JSON.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.2,
        maxTokens: 4000,
        taskType: 'complex'
      });

      // Parse response
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('Failed to extract JSON from DevOps response');
      }

      const result = JSON.parse(jsonMatch[0]);

      // Write files
      if (result.files && result.files.length > 0) {
        for (const file of result.files) {
          await writeFileSafe(file.path, file.content);
          this.log('Created DevOps file', { path: file.path });
        }
      }

      return this.success(result, 'DevOps task completed');

    } catch (error) {
      this.logError('DevOps task failed', error);
      return this.failure(error.message);
    }
  }
}

/**
 * Media Director Micro-Agent
 * Handles video processing, FFmpeg operations, JSON timelines
 */
export class MediaDirector extends SpecialistAgent {
  constructor() {
    super(
      'Media Director',
      ['video', 'ffmpeg', 'media', 'timeline', 'processing', 'encoding'],
      'Creates and executes video processing workflows'
    );
  }

  async execute(task, context) {
    this.log('Executing media task', {
      description: task.description
    });

    try {
      const prompt = `You are a Media Director specializing in FFmpeg video processing. Execute this task:

Task: ${task.description}

Context:
${context.dependencies ? JSON.stringify(context.dependencies, null, 2) : 'No dependencies'}

Guidelines:
1. Generate JSON timeline definitions for complex edits
2. Use FFmpeg best practices for quality and performance
3. Support common operations: trim, cut, concat, overlay, filter
4. Optimize for web delivery (H.264, AAC, MP4)
5. Include progress tracking for long operations

Timeline JSON Format:
{
  "operations": [
    {
      "type": "trim|cut|concat|overlay|filter|encode",
      "input": "input.mp4",
      "output": "output.mp4",
      "params": {
        "start": "00:00:10",
        "duration": "00:00:30"
      }
    }
  ],
  "quality": "high|medium|low",
  "preset": "ultrafast|fast|medium|slow"
}

Return your response in this JSON format:
{
  "timeline": { /* timeline object */ },
  "ffmpegCommands": ["ffmpeg command 1", "ffmpeg command 2"],
  "estimatedTime": "estimated processing time",
  "summary": "Brief summary of media operations",
  "notes": "Important notes about processing"
}`;

      const response = await completion({
        messages: [
          { role: 'system', content: 'You are an expert media processing specialist. Output only valid JSON.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.2,
        maxTokens: 3000,
        taskType: 'complex'
      });

      // Parse response
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('Failed to extract JSON from media response');
      }

      const result = JSON.parse(jsonMatch[0]);

      // Execute FFmpeg operations if commands are provided
      if (result.ffmpegCommands && result.ffmpegCommands.length > 0) {
        const executionResults = [];

        for (const command of result.ffmpegCommands) {
          this.log('Executing FFmpeg command', { command });

          const ffmpegResult = await executeFFmpegOperation(command);

          executionResults.push({
            command,
            success: ffmpegResult.success,
            output: ffmpegResult.output,
            error: ffmpegResult.error
          });

          if (!ffmpegResult.success) {
            logger.warn('FFmpeg command failed', {
              command,
              error: ffmpegResult.error
            });
          }
        }

        result.executionResults = executionResults;
      }

      // Save timeline if provided
      if (result.timeline) {
        const timelinePath = join('data', `timeline-${Date.now()}.json`);
        await writeFileSafe(timelinePath, JSON.stringify(result.timeline, null, 2));
        result.timelinePath = timelinePath;
        this.log('Saved timeline', { path: timelinePath });
      }

      return this.success(result, 'Media task completed');

    } catch (error) {
      this.logError('Media task failed', error);
      return this.failure(error.message);
    }
  }
}

export default {
  SystemArchitect,
  FullStackEngineer,
  DevOpsEngineer,
  MediaDirector
};
