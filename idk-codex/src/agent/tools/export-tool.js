/**
 * Export / Deliverable Tools (Phase 7.3)
 *
 * export_zip:
 *   Packages a project directory into a .zip file using the system `zip`
 *   command. Excludes node_modules, .git, dist, .next, build, .cache.
 *   Returns the path to the created .zip.
 *
 * export_readme:
 *   Generates a professional README.md for a project based on its
 *   package.json (or other detectable metadata). Overwrites any existing
 *   README.md.
 */

import fsp from 'fs/promises';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import logger from '../../utils/logger.js';

const execAsync = promisify(exec);
const SANDBOX = process.env.SANDBOX_WORKSPACE || './sandbox-workspace';

// ============================================================================
// HELPER: detect project info from package.json
// ============================================================================

async function readPackageJson(projectRoot) {
  try {
    const raw = await fsp.readFile(path.join(projectRoot, 'package.json'), 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function detectStack(projectRoot, pkg) {
  const stacks = [];
  if (pkg?.dependencies?.next) stacks.push('Next.js');
  if (pkg?.dependencies?.react) stacks.push('React');
  if (pkg?.dependencies?.express) stacks.push('Express');
  if (pkg?.dependencies?.vue) stacks.push('Vue');
  if (pkg?.dependencies?.svelte) stacks.push('Svelte');
  if (pkg?.devDependencies?.vite) stacks.push('Vite');
  if (pkg?.dependencies?.fastapi) stacks.push('FastAPI');
  if (pkg?.dependencies?.flask) stacks.push('Flask');
  if (pkg?.dependencies?.django) stacks.push('Django');
  return stacks;
}

// ============================================================================
// TOOL DEFINITIONS
// ============================================================================

export const exportTools = {
  export_zip: {
    name: 'export_zip',
    description: 'Package a project directory into a .zip archive (excludes node_modules, .git, dist, .next, build). Returns the path to the .zip file in the sandbox. Use this when the user asks to "download", "package", "export", or "zip" a project.',
    params: {
      dir: 'string (required) — the directory to zip (relative to workspace)',
      output: 'string (optional) — output .zip filename (default: <dir>.zip)'
    },
    execute: async (args) => {
      const dir = args.dir;
      if (!dir) return 'Error: dir is required';

      const projectRoot = path.resolve(SANDBOX, dir);
      if (!projectRoot.startsWith(path.resolve(SANDBOX))) {
        return 'Error: dir is outside the sandbox workspace';
      }

      try {
        // Verify the directory exists
        try {
          const stat = await fsp.stat(projectRoot);
          if (!stat.isDirectory()) {
            return `Error: "${dir}" is not a directory`;
          }
        } catch {
          return `Error: directory not found: ${dir}`;
        }

        const zipName = (args.output || `${path.basename(projectRoot)}.zip`).replace(/\.zip$/i, '') + '.zip';
        const zipPath = path.resolve(SANDBOX, zipName);

        // Use the system `zip` command to create the archive, excluding
        // common heavy/build directories.
        // -r = recursive, -q = quiet
        // Exclusions: node_modules, .git, dist, .next, build, .cache, .turbo, coverage
        const cmd = `zip -r -q "${zipPath}" "${path.basename(projectRoot)}" ` +
          `-x "${path.basename(projectRoot)}/node_modules/*" ` +
          `-x "${path.basename(projectRoot)}/.git/*" ` +
          `-x "${path.basename(projectRoot)}/dist/*" ` +
          `-x "${path.basename(projectRoot)}/.next/*" ` +
          `-x "${path.basename(projectRoot)}/build/*" ` +
          `-x "${path.basename(projectRoot)}/.cache/*" ` +
          `-x "${path.basename(projectRoot)}/.turbo/*" ` +
          `-x "${path.basename(projectRoot)}/coverage/*" ` +
          `-x "*.zip"`;

        logger.info('TOOL:export_zip', { dir, zipName, cmd: cmd.slice(0, 200) });

        try {
          await execAsync(cmd, { cwd: SANDBOX, maxBuffer: 50 * 1024 * 1024 });
        } catch (zipErr) {
          // `zip` may not be available — try `tar` as a fallback? No, the spec
          // says use `zip`. Return a helpful error.
          if (zipErr.message.includes('not found') || zipErr.message.includes('command not found')) {
            return `Error: the 'zip' command is not installed on this system. Install it with: apt-get install zip (Debian/Ubuntu) or brew install zip (macOS).`;
          }
          throw zipErr;
        }

        // Verify the zip was created
        try {
          const stat = await fsp.stat(zipPath);
          return `Created ${zipName} (${(stat.size / 1024).toFixed(1)} KB) at ${zipName}\n` +
            `Excluded: node_modules, .git, dist, .next, build, .cache, .turbo, coverage`;
        } catch {
          return `Error: zip command ran but no .zip was created. Check that the directory has files.`;
        }
      } catch (err) {
        return `Error creating zip: ${err.message}`;
      }
    }
  },

  export_readme: {
    name: 'export_readme',
    description: 'Generate a professional README.md for a project based on its package.json (or detectable structure). Overwrites any existing README.md. Use this when the user asks to "document", "write a README", or "explain how to run" a project.',
    params: {
      dir: 'string (required) — the project directory (relative to workspace)',
      title: 'string (optional) — project title (default: derived from package.json)',
      description: 'string (optional) — project description (default: derived from package.json)'
    },
    execute: async (args) => {
      const dir = args.dir;
      if (!dir) return 'Error: dir is required';

      const projectRoot = path.resolve(SANDBOX, dir);
      if (!projectRoot.startsWith(path.resolve(SANDBOX))) {
        return 'Error: dir is outside the sandbox workspace';
      }

      try {
        // Verify the directory exists
        try {
          const stat = await fsp.stat(projectRoot);
          if (!stat.isDirectory()) {
            return `Error: "${dir}" is not a directory`;
          }
        } catch {
          return `Error: directory not found: ${dir}`;
        }

        const pkg = await readPackageJson(projectRoot);
        const stacks = detectStack(projectRoot, pkg);
        const title = args.title || pkg?.name || path.basename(projectRoot);
        const description = args.description || pkg?.description || 'A project built with MAX.';

        // List directory contents (top-level only) for the Project Structure section
        let entries = [];
        try {
          entries = await fsp.readdir(projectRoot, { withFileTypes: true });
        } catch { /* empty */ }
        const visibleEntries = entries
          .filter(e => !e.name.startsWith('.') && e.name !== 'node_modules')
          .map(e => `- ${e.isDirectory() ? `${e.name}/` : e.name}`)
          .slice(0, 30)
          .join('\n');

        // Determine install + run commands
        let installCmd = 'npm install';
        let runCmd = 'npm run dev';
        let buildCmd = 'npm run build';
        let testCmd = pkg?.scripts?.test ? 'npm test' : null;

        // Detect Python projects (no package.json but requirements.txt)
        const hasRequirements = entries.some(e => e.name === 'requirements.txt');
        const hasAppPy = entries.some(e => e.name === 'app.py' || e.name === 'main.py');
        if (hasRequirements || (!pkg && hasAppPy)) {
          installCmd = 'pip install -r requirements.txt';
          runCmd = 'python app.py';
          buildCmd = null;
          testCmd = null;
        }

        // Build the README content
        const lines = [];
        lines.push(`# ${title}`);
        lines.push('');
        lines.push(`> ${description}`);
        lines.push('');
        if (stacks.length > 0) {
          lines.push(`**Tech stack:** ${stacks.join(' · ')}`);
          lines.push('');
        }
        lines.push('## Features');
        lines.push('');
        lines.push('- Built with MAX — the professional autonomous AI agent');
        lines.push('- Production-ready project structure');
        lines.push('- Easy to run and extend');
        lines.push('');
        lines.push('## Prerequisites');
        lines.push('');
        if (installCmd.startsWith('pip')) {
          lines.push('- Python 3.10+');
          lines.push('- `pip` package manager');
        } else {
          lines.push('- Node.js 18+');
          lines.push('- `npm` (or your preferred package manager: pnpm, yarn, bun)');
        }
        lines.push('');
        lines.push('## Installation');
        lines.push('');
        lines.push('```bash');
        lines.push(`git clone <your-repo-url>`);
        lines.push(`cd ${path.basename(projectRoot)}`);
        lines.push(installCmd);
        lines.push('```');
        lines.push('');
        lines.push('## Usage');
        lines.push('');
        lines.push('```bash');
        lines.push(runCmd);
        lines.push('```');
        lines.push('');
        if (buildCmd) {
          lines.push('## Build');
          lines.push('');
          lines.push('```bash');
          lines.push(buildCmd);
          lines.push('```');
          lines.push('');
        }
        if (testCmd) {
          lines.push('## Testing');
          lines.push('');
          lines.push('```bash');
          lines.push(testCmd);
          lines.push('```');
          lines.push('');
        }
        if (visibleEntries) {
          lines.push('## Project Structure');
          lines.push('');
          lines.push('```');
          lines.push(visibleEntries);
          lines.push('```');
          lines.push('');
        }
        lines.push('## Configuration');
        lines.push('');
        lines.push('Configuration is via environment variables. Copy `.env.example` to `.env` and edit values as needed.');
        lines.push('');
        lines.push('```bash');
        lines.push('cp .env.example .env');
        lines.push('```');
        lines.push('');
        lines.push('## Contributing');
        lines.push('');
        lines.push('1. Fork the repository');
        lines.push('2. Create a feature branch: `git checkout -b feature/your-feature`');
        lines.push('3. Commit your changes: `git commit -m "Add your feature"`');
        lines.push('4. Push to the branch: `git push origin feature/your-feature`');
        lines.push('5. Open a pull request');
        lines.push('');
        lines.push('## License');
        lines.push('');
        lines.push('MIT — see [LICENSE](LICENSE) for details.');
        lines.push('');
        lines.push('---');
        lines.push('');
        lines.push('_Generated by [MAX](https://github.com/) — professional autonomous AI agent._');
        lines.push('');

        const readme = lines.join('\n');
        const readmePath = path.join(projectRoot, 'README.md');
        await fsp.writeFile(readmePath, readme, 'utf-8');

        logger.info('TOOL:export_readme', { dir, path: readmePath, size: readme.length });

        return `Generated README.md at ${dir}/README.md (${readme.length} chars, ${lines.length} lines).\n` +
          `Detected stack: ${stacks.length > 0 ? stacks.join(', ') : 'generic'}\n` +
          `Install: \`${installCmd}\`\n` +
          `Run: \`${runCmd}\``;
      } catch (err) {
        return `Error generating README: ${err.message}`;
      }
    }
  }
};

export default exportTools;
