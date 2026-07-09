/**
 * Tool Registry for Agent Loop
 *
 * Provides 12 tool functions that agents can use:
 * 1. read_file - Read file contents
 * 2. write_file - Write file contents
 * 3. edit_file - Edit specific parts of file
 * 4. run_command - Execute shell commands
 * 5. list_files - List files in directory
 * 6. search_code - Search for code patterns
 * 7. install_package - Install npm/pip packages
 * 8. run_tests - Run test suites
 * 9. git_operations - Git commands
 * 10. create_directory - Create directories
 * 11. web_fetch - Fetch web content
 * 12. check_syntax - Validate code syntax
 */

import { promises as fs } from 'fs';
import { join, dirname, extname, basename } from 'path';
import { readFileSafe, writeFileSafe, existsSafe } from '../../utils/filesystem.js';
import logger from '../../utils/logger.js';

// Command whitelist for security
const ALLOWED_PREFIXES = [
  'npm', 'node', 'npx', 'git', 'python', 'python3', 'pip', 'pip3',
  'ls', 'cat', 'echo', 'mkdir', 'cp', 'mv', 'rm', 'find', 'grep',
  'curl', 'wget', 'yarn', 'pnpm', 'cargo', 'go', 'tsc', 'jest',
  'vitest', 'eslint', 'prettier', 'docker', 'pwd', 'cd', 'which',
  'chmod', 'touch', 'sed', 'awk', 'sort', 'head', 'tail', 'wc',
  'du', 'df', 'ps', 'kill', 'env', 'export', 'unset'
];

// Command blocklist for security
const BLOCKED_COMMANDS = [
  'rm -rf /',
  'sudo',
  'su ',
  'passwd',
  'chmod 777 /',
  'mkfs',
  'dd if=',
  'shutdown',
  'reboot',
  'init 0',
  'halt'
];

/**
 * Build tool registry with all available tools
 * @param {Object} terminal - AgentTerminal instance
 * @param {string} workspacePath - Workspace directory path
 * @param {Function} streamCallback - Callback for streaming updates
 * @returns {Object} Tool registry object
 */
export function buildToolRegistry(terminal, workspacePath, streamCallback) {
  logger.info('Building tool registry', { workspacePath });

  /**
   * Stream tool usage event
   * @param {string} toolName - Tool name
   * @param {Object} details - Tool execution details
   */
  function streamToolUse(toolName, details) {
    if (streamCallback) {
      try {
        streamCallback('tool:use', { tool: toolName, ...details });
      } catch (error) {
        logger.warn('Stream callback failed', { error: error.message });
      }
    }
  }

  /**
   * Get absolute path from relative path
   * @param {string} path - Relative or absolute path
   * @returns {string} Absolute path
   */
  function getAbsolutePath(path) {
    if (path.startsWith('/')) {
      return path;
    }
    return join(workspacePath, path);
  }

  return {
    /**
     * TOOL 1: Read file contents
     * @param {Object} input - {path: string}
     * @returns {Promise<Object>} {content, lines, size} or {error}
     */
    async read_file(input) {
      try {
        logger.info('Tool: read_file', { path: input.path });
        streamToolUse('read_file', { path: input.path });

        const absolutePath = getAbsolutePath(input.path);
        const content = await fs.readFile(absolutePath, 'utf8');

        if (!content) {
          throw new Error('File is empty or could not be read');
        }

        const lines = content.split('\n').length;
        const size = Buffer.byteLength(content, 'utf8');

        logger.info('File read successfully', { path: input.path, lines, size });

        return {
          success: true,
          content,
          lines,
          size
        };
      } catch (error) {
        logger.error('Failed to read file', { path: input.path, error: error.message });
        return { success: false, error: error.message };
      }
    },

    /**
     * TOOL 2: Write file contents
     * @param {Object} input - {path: string, content: string}
     * @returns {Promise<Object>} {success, path, bytesWritten}
     */
    async write_file(input) {
      try {
        logger.info('Tool: write_file', { path: input.path });
        streamToolUse('write_file', { path: input.path });

        const absolutePath = getAbsolutePath(input.path);
        const dir = dirname(absolutePath);

        // Create parent directories
        await fs.mkdir(dir, { recursive: true });

        // Write file
        await fs.writeFile(absolutePath, input.content, 'utf8');
        const bytesWritten = Buffer.byteLength(input.content, 'utf8');

        logger.info('File written successfully', {
          path: input.path,
          bytesWritten
        });

        return {
          success: true,
          path: input.path,
          bytesWritten
        };
      } catch (error) {
        logger.error('Failed to write file', { path: input.path, error: error.message });
        return { success: false, error: error.message };
      }
    },

    /**
     * TOOL 3: Edit file by replacing text
     * @param {Object} input - {path: string, oldStr: string, newStr: string}
     * @returns {Promise<Object>} {success, path, linesChanged}
     */
    async edit_file(input) {
      try {
        logger.info('Tool: edit_file', { path: input.path });
        streamToolUse('edit_file', { path: input.path });

        const content = await readFileSafe(input.path);

        // Check if oldStr exists
        if (!content.includes(input.oldStr)) {
          const lines = content.split('\n');
          const contextLines = lines.slice(0, 10).join('\n');
          return {
            success: false,
            error: `String not found in file. First 10 lines:\n${contextLines}`
          };
        }

        // Check for multiple matches
        const matches = content.split(input.oldStr).length - 1;
        if (matches > 1) {
          return {
            success: false,
            error: `Found ${matches} matches. Please provide more specific oldStr to target exact location.`
          };
        }

        // Replace text
        const newContent = content.replace(input.oldStr, input.newStr);
        const absolutePath = getAbsolutePath(input.path);
        await fs.writeFile(absolutePath, newContent, 'utf8');

        const linesChanged = input.newStr.split('\n').length;

        logger.info('File edited successfully', {
          path: input.path,
          linesChanged
        });

        return {
          success: true,
          path: input.path,
          linesChanged
        };
      } catch (error) {
        logger.error('Failed to edit file', { path: input.path, error: error.message });
        return { success: false, error: error.message };
      }
    },

    /**
     * TOOL 4: Run command in terminal
     * @param {Object} input - {command: string, timeout?: number}
     * @returns {Promise<Object>} {output, exitCode}
     */
    async run_command(input) {
      try {
        logger.info('Tool: run_command', { command: input.command.substring(0, 100) });
        streamToolUse('run_command', { command: input.command });

        // Security: Check whitelist
        const commandStart = input.command.trim().split(' ')[0];
        const isAllowed = ALLOWED_PREFIXES.some(prefix => commandStart.startsWith(prefix));

        if (!isAllowed) {
          logger.warn('Command blocked by whitelist', { command: input.command });
          return {
            success: false,
            error: `Command '${commandStart}' not allowed. Allowed prefixes: ${ALLOWED_PREFIXES.join(', ')}`
          };
        }

        // Security: Check blocklist
        const isBlocked = BLOCKED_COMMANDS.some(blocked =>
          input.command.toLowerCase().includes(blocked.toLowerCase())
        );

        if (isBlocked) {
          logger.warn('Command blocked by blocklist', { command: input.command });
          return {
            success: false,
            error: 'Command contains blocked pattern for security reasons'
          };
        }

        // Execute command
        const result = await terminal.exec(input.command, input.timeout || 30000);

        logger.info('Command executed', {
          command: input.command.substring(0, 100),
          outputLength: result.output.length
        });

        return {
          success: true,
          output: result.output,
          exitCode: result.exitCode
        };
      } catch (error) {
        logger.error('Failed to run command', {
          command: input.command,
          error: error.message
        });
        return { success: false, error: error.message, exitCode: 1 };
      }
    },

    /**
     * TOOL 5: List files in directory
     * @param {Object} input - {path?: string, pattern?: string}
     * @returns {Promise<Object>} {files: [], count}
     */
    async list_files(input) {
      try {
        const searchPath = input.path || '.';
        logger.info('Tool: list_files', { path: searchPath, pattern: input.pattern });
        streamToolUse('list_files', { path: searchPath });

        const findCmd = input.pattern
          ? `find ${searchPath} -type f -name "${input.pattern}" ! -path "*/node_modules/*" ! -path "*/.git/*"`
          : `find ${searchPath} -type f ! -path "*/node_modules/*" ! -path "*/.git/*"`;

        const result = await terminal.exec(findCmd, 10000);

        const files = result.output
          .split('\n')
          .filter(line => line.trim() && !line.includes('$'))
          .map(line => line.trim());

        logger.info('Files listed', { count: files.length });

        return {
          success: true,
          files,
          count: files.length
        };
      } catch (error) {
        logger.error('Failed to list files', { error: error.message });
        return { success: false, error: error.message, files: [], count: 0 };
      }
    },

    /**
     * TOOL 6: Search code for pattern
     * @param {Object} input - {query: string, path?: string, fileType?: string}
     * @returns {Promise<Object>} {matches: [{file, line, content}], count}
     */
    async search_code(input) {
      try {
        const searchPath = input.path || '.';
        logger.info('Tool: search_code', { query: input.query, path: searchPath });
        streamToolUse('search_code', { query: input.query });

        let grepCmd = `grep -r -n "${input.query}" ${searchPath} --exclude-dir=node_modules --exclude-dir=.git`;

        if (input.fileType) {
          grepCmd += ` --include="*.${input.fileType}"`;
        }

        const result = await terminal.exec(grepCmd, 15000);

        const matches = result.output
          .split('\n')
          .filter(line => line.trim() && !line.includes('$') && line.includes(':'))
          .map(line => {
            const [filePath, ...rest] = line.split(':');
            const lineNum = rest[0];
            const content = rest.slice(1).join(':');
            return {
              file: filePath.trim(),
              line: parseInt(lineNum) || 0,
              content: content.trim()
            };
          })
          .filter(m => m.file && m.content);

        logger.info('Code search completed', { count: matches.length });

        return {
          success: true,
          matches,
          count: matches.length
        };
      } catch (error) {
        logger.error('Failed to search code', { error: error.message });
        return { success: false, error: error.message, matches: [], count: 0 };
      }
    },

    /**
     * TOOL 7: Install package
     * @param {Object} input - {packages: string[], manager?: string}
     * @returns {Promise<Object>} {success, output, installed: []}
     */
    async install_package(input) {
      try {
        logger.info('Tool: install_package', { packages: input.packages });
        streamToolUse('install_package', { packages: input.packages });

        let manager = input.manager;

        // Auto-detect package manager
        if (!manager) {
          const hasPackageJson = await existsSafe('package.json');
          const hasYarnLock = await existsSafe('yarn.lock');
          const hasPnpmLock = await existsSafe('pnpm-lock.yaml');

          if (hasPnpmLock) {
            manager = 'pnpm';
          } else if (hasYarnLock) {
            manager = 'yarn';
          } else if (hasPackageJson) {
            manager = 'npm';
          } else {
            manager = 'npm';
          }
        }

        const packagesStr = input.packages.join(' ');
        const installCmd = `${manager} install ${packagesStr}`;

        const result = await terminal.exec(installCmd, 120000);

        logger.info('Packages installed', { packages: input.packages, manager });

        return {
          success: true,
          output: result.output,
          installed: input.packages,
          manager
        };
      } catch (error) {
        logger.error('Failed to install packages', {
          packages: input.packages,
          error: error.message
        });
        return { success: false, error: error.message, installed: [] };
      }
    },

    /**
     * TOOL 8: Run tests
     * @param {Object} input - {command?: string, path?: string}
     * @returns {Promise<Object>} {passed, failed, output, success}
     */
    async run_tests(input) {
      try {
        logger.info('Tool: run_tests', { command: input.command });
        streamToolUse('run_tests', { command: input.command });

        let testCmd = input.command;

        // Auto-detect test command
        if (!testCmd) {
          const hasPackageJson = await existsSafe('package.json');
          if (hasPackageJson) {
            const pkgContent = await readFileSafe('package.json');
            const pkg = JSON.parse(pkgContent);

            if (pkg.scripts?.test) {
              testCmd = 'npm test';
            } else if (pkg.devDependencies?.jest || pkg.dependencies?.jest) {
              testCmd = 'npx jest';
            } else if (pkg.devDependencies?.vitest || pkg.dependencies?.vitest) {
              testCmd = 'npx vitest run';
            } else {
              testCmd = 'npm test';
            }
          } else {
            testCmd = 'npm test';
          }
        }

        const result = await terminal.exec(testCmd, 60000);

        // Parse test results
        let passed = 0;
        let failed = 0;

        // Try to extract test counts from output
        const passMatch = result.output.match(/(\d+)\s+passed/i);
        const failMatch = result.output.match(/(\d+)\s+failed/i);

        if (passMatch) passed = parseInt(passMatch[1]);
        if (failMatch) failed = parseInt(failMatch[1]);

        const success = failed === 0 && result.exitCode === 0;

        logger.info('Tests completed', { passed, failed, success });

        return {
          success,
          passed,
          failed,
          output: result.output
        };
      } catch (error) {
        logger.error('Failed to run tests', { error: error.message });
        return {
          success: false,
          passed: 0,
          failed: 1,
          output: error.message
        };
      }
    },

    /**
     * TOOL 9: Git operations
     * @param {Object} input - {operation: string, files?: [], message?: string}
     * @returns {Promise<Object>} {output, success}
     */
    async git_operations(input) {
      try {
        logger.info('Tool: git_operations', { operation: input.operation });
        streamToolUse('git_operations', { operation: input.operation });

        let gitCmd;

        switch (input.operation) {
          case 'status':
            gitCmd = 'git status';
            break;
          case 'diff':
            gitCmd = 'git diff';
            break;
          case 'add':
            gitCmd = input.files?.length
              ? `git add ${input.files.join(' ')}`
              : 'git add .';
            break;
          case 'commit':
            if (!input.message) {
              return { success: false, error: 'Commit message required' };
            }
            gitCmd = `git commit -m "${input.message}"`;
            break;
          case 'push':
            gitCmd = 'git push';
            break;
          case 'log':
            gitCmd = 'git log --oneline -10';
            break;
          default:
            return { success: false, error: `Unknown git operation: ${input.operation}` };
        }

        const result = await terminal.exec(gitCmd, 30000);

        logger.info('Git operation completed', { operation: input.operation });

        return {
          success: true,
          output: result.output,
          operation: input.operation
        };
      } catch (error) {
        logger.error('Git operation failed', {
          operation: input.operation,
          error: error.message
        });
        return { success: false, error: error.message };
      }
    },

    /**
     * TOOL 10: Create directory
     * @param {Object} input - {path: string}
     * @returns {Promise<Object>} {success, path}
     */
    async create_directory(input) {
      try {
        logger.info('Tool: create_directory', { path: input.path });
        streamToolUse('create_directory', { path: input.path });

        const result = await terminal.exec(`mkdir -p ${input.path}`, 5000);

        logger.info('Directory created', { path: input.path });

        return {
          success: true,
          path: input.path
        };
      } catch (error) {
        logger.error('Failed to create directory', {
          path: input.path,
          error: error.message
        });
        return { success: false, error: error.message };
      }
    },

    /**
     * TOOL 11: Fetch web content
     * @param {Object} input - {url: string, type?: string}
     * @returns {Promise<Object>} {content, length}
     */
    async web_fetch(input) {
      try {
        logger.info('Tool: web_fetch', { url: input.url });
        streamToolUse('web_fetch', { url: input.url });

        // Security: Block local network addresses
        const blockedPatterns = [
          'localhost',
          '127.0.0.1',
          '0.0.0.0',
          '192.168.',
          '10.',
          '172.16.',
          '172.17.',
          '172.18.',
          '172.19.',
          '172.20.',
          '172.21.',
          '172.22.',
          '172.23.',
          '172.24.',
          '172.25.',
          '172.26.',
          '172.27.',
          '172.28.',
          '172.29.',
          '172.30.',
          '172.31.'
        ];

        const isBlocked = blockedPatterns.some(pattern =>
          input.url.toLowerCase().includes(pattern)
        );

        if (isBlocked) {
          logger.warn('Blocked local network access', { url: input.url });
          return {
            success: false,
            error: 'Access to local network addresses is blocked for security'
          };
        }

        const result = await terminal.exec(`curl -s -L "${input.url}"`, 30000);

        logger.info('Web content fetched', {
          url: input.url,
          length: result.output.length
        });

        return {
          success: true,
          content: result.output,
          length: result.output.length
        };
      } catch (error) {
        logger.error('Failed to fetch web content', {
          url: input.url,
          error: error.message
        });
        return { success: false, error: error.message };
      }
    },

    /**
     * TOOL 12: Check syntax
     * @param {Object} input - {path: string}
     * @returns {Promise<Object>} {valid, errors: []}
     */
    async check_syntax(input) {
      try {
        logger.info('Tool: check_syntax', { path: input.path });
        streamToolUse('check_syntax', { path: input.path });

        const ext = extname(input.path);
        let checkCmd;

        switch (ext) {
          case '.js':
          case '.mjs':
            checkCmd = `node --check ${input.path}`;
            break;
          case '.ts':
            checkCmd = `npx tsc --noEmit --skipLibCheck ${input.path}`;
            break;
          case '.py':
            checkCmd = `python3 -m py_compile ${input.path}`;
            break;
          case '.json':
            // Read and parse JSON
            try {
              const content = await readFileSafe(input.path);
              JSON.parse(content);
              return { success: true, valid: true, errors: [] };
            } catch (error) {
              return {
                success: true,
                valid: false,
                errors: [error.message]
              };
            }
          default:
            return {
              success: false,
              error: `Syntax checking not supported for ${ext} files`
            };
        }

        const result = await terminal.exec(checkCmd, 15000);

        const valid = result.exitCode === 0;
        const errors = valid ? [] : [result.output];

        logger.info('Syntax check completed', { path: input.path, valid });

        return {
          success: true,
          valid,
          errors
        };
      } catch (error) {
        logger.error('Failed to check syntax', {
          path: input.path,
          error: error.message
        });
        return {
          success: true,
          valid: false,
          errors: [error.message]
        };
      }
    }
  };
}

export default buildToolRegistry;
