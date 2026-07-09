/**
 * Diagnostic Scanner
 * Scans configuration files for issues related to errors
 */

import fs from 'fs';
import path from 'path';
import logger from '../utils/logger.js';
import { readFileSafe } from '../utils/filesystem.js';

export class DiagnosticScanner {
  constructor(workspacePath = process.env.SANDBOX_WORKSPACE || './sandbox-workspace') {
    this.workspacePath = workspacePath;
    this.configFiles = [
      'package.json',
      'package-lock.json',
      'tsconfig.json',
      'jsconfig.json',
      'vite.config.js',
      'webpack.config.js',
      'next.config.js',
      '.env',
      'Dockerfile',
      'railway.toml',
      'nixpacks.toml'
    ];
  }

  /**
   * Scan configuration files for issues related to error
   */
  async scanForError(errorInfo) {
    logger.info('Scanning config files for error', {
      errorType: errorInfo.type,
      category: errorInfo.category
    });

    const diagnostics = {
      error: errorInfo,
      configIssues: [],
      recommendations: []
    };

    // Category-specific scanning
    switch (errorInfo.category) {
      case 'module':
        await this.scanModuleError(errorInfo, diagnostics);
        break;
      case 'build':
        await this.scanBuildError(errorInfo, diagnostics);
        break;
      case 'runtime':
        await this.scanRuntimeError(errorInfo, diagnostics);
        break;
      case 'system':
        await this.scanSystemError(errorInfo, diagnostics);
        break;
    }

    logger.info('Diagnostic scan complete', {
      issuesFound: diagnostics.configIssues.length,
      recommendations: diagnostics.recommendations.length
    });

    return diagnostics;
  }

  /**
   * Scan for module-related errors
   */
  async scanModuleError(errorInfo, diagnostics) {
    // Check package.json
    const packageJsonPath = path.join(this.workspacePath, 'package.json');
    const packageJson = await this.readJsonFile(packageJsonPath);

    if (packageJson && errorInfo.missingModule) {
      const module = errorInfo.missingModule;

      // Check if module is in dependencies
      const allDeps = {
        ...packageJson.dependencies,
        ...packageJson.devDependencies
      };

      if (!allDeps[module]) {
        diagnostics.configIssues.push({
          file: 'package.json',
          issue: `Module '${module}' not listed in dependencies`,
          severity: 'high'
        });

        diagnostics.recommendations.push({
          action: 'install_dependency',
          command: `npm install ${module}`,
          description: `Install missing module: ${module}`
        });
      } else {
        // Module is listed but not installed - run npm install
        diagnostics.recommendations.push({
          action: 'reinstall_dependencies',
          command: 'npm install',
          description: 'Reinstall dependencies (node_modules may be missing)'
        });
      }
    }
  }

  /**
   * Scan for build-related errors
   */
  async scanBuildError(errorInfo, diagnostics) {
    // Check build configuration files
    const buildConfigs = ['vite.config.js', 'webpack.config.js', 'tsconfig.json'];

    for (const configFile of buildConfigs) {
      const filePath = path.join(this.workspacePath, configFile);
      if (fs.existsSync(filePath)) {
        diagnostics.configIssues.push({
          file: configFile,
          issue: 'Build configuration exists, check for syntax errors',
          severity: 'medium'
        });
      }
    }

    diagnostics.recommendations.push({
      action: 'clean_build',
      command: 'rm -rf node_modules dist build && npm install',
      description: 'Clean install to resolve build issues'
    });
  }

  /**
   * Scan for runtime errors
   */
  async scanRuntimeError(errorInfo, diagnostics) {
    if (errorInfo.type === 'Port Already In Use' && errorInfo.port) {
      diagnostics.recommendations.push({
        action: 'kill_port',
        command: `lsof -ti :${errorInfo.port} | xargs kill -9`,
        description: `Kill process on port ${errorInfo.port}`
      });
    }

    // Check .env file
    const envPath = path.join(this.workspacePath, '.env');
    if (!fs.existsSync(envPath)) {
      diagnostics.configIssues.push({
        file: '.env',
        issue: 'Environment file missing',
        severity: 'medium'
      });
    }
  }

  /**
   * Scan for system errors
   */
  async scanSystemError(errorInfo, diagnostics) {
    if (errorInfo.type === 'Native Build Error') {
      // Check Dockerfile for build tools
      const dockerfilePath = path.join(this.workspacePath, 'Dockerfile');
      if (fs.existsSync(dockerfilePath)) {
        const dockerfile = await readFileSafe(dockerfilePath);
        if (dockerfile && !dockerfile.includes('python3') && !dockerfile.includes('make')) {
          diagnostics.configIssues.push({
            file: 'Dockerfile',
            issue: 'Missing build tools (python3, make, g++)',
            severity: 'high'
          });

          diagnostics.recommendations.push({
            action: 'add_build_tools',
            description: 'Add build tools to Dockerfile',
            patch: 'RUN apk add --no-cache python3 make g++'
          });
        }
      }
    }
  }

  /**
   * Read JSON file safely
   */
  async readJsonFile(filePath) {
    try {
      const content = await readFileSafe(filePath);
      if (!content) return null;
      return JSON.parse(content);
    } catch (error) {
      logger.warn('Failed to read JSON file', { file: filePath, error: error.message });
      return null;
    }
  }
}

export default DiagnosticScanner;
