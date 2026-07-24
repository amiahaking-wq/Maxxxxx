import logger from '../../utils/logger.js';
import { MarkdownJSXParser } from '../../utils/markdown-jsx-parser.js';

/**
 * JSX Component Parser
 *
 * Parses Claude Code-style JSX components embedded in markdown
 * and converts them to appropriate display format (Telegram, CLI, etc.)
 *
 * Supported components:
 * - <GitHubIssue owner="" repo="" number="" />
 * - <GitHubPR owner="" repo="" number="" />
 * - <GitHubWorkflow owner="" repo="" runId="" />
 * - <FileLink path="" line="" />
 * - <CodeBlock lang="" code="" />
 *
 * Based on Claude Code's JSX component system
 */

// Create singleton parser instance
const parser = new MarkdownJSXParser();

/**
 * Parse JSX components in markdown text
 *
 * @param {string} markdown - Markdown text with embedded JSX
 * @param {string} format - Output format: 'telegram', 'cli', 'html'
 * @returns {string} Parsed text with components rendered
 */
export function parseJSXComponents(markdown, format = 'telegram') {
  try {
    logger.debug('Parsing JSX components', { format });

    // Use enhanced parser
    return parser.parse(markdown, format);
  } catch (error) {
    logger.error('Failed to parse JSX components', { error: error.message });
    return markdown; // Return original on error
  }
}

/**
 * Parse component props from string
 *
 * @param {string} propsString - Props string (e.g., 'repo="owner/repo" number={123}')
 * @returns {Object} Parsed props object
 */
function parseProps(propsString) {
  const props = {};

  // Match prop="value" or prop={value}
  const propRegex = /(\w+)=(?:\"([^\"]+)\"|{([^}]+)})/g;
  let match;

  while ((match = propRegex.exec(propsString)) !== null) {
    const [, name, stringValue, numberValue] = match;

    if (stringValue !== undefined) {
      props[name] = stringValue;
    } else if (numberValue !== undefined) {
      // Try to parse as number, fallback to string
      const parsed = parseInt(numberValue, 10);
      props[name] = isNaN(parsed) ? numberValue : parsed;
    }
  }

  return props;
}

/**
 * Render a component based on format
 *
 * @param {string} name - Component name
 * @param {Object} props - Component props
 * @param {string} format - Output format
 * @returns {string} Rendered component
 */
function renderComponent(name, props, format) {
  switch (name) {
    case 'GitHubIssue':
      return renderGitHubIssue(props, format);
    case 'GitHubPR':
      return renderGitHubPR(props, format);
    case 'GitHubWorkflow':
      return renderGitHubWorkflow(props, format);
    case 'FileTree':
      return renderFileTree(props, format);
    case 'CodeBlock':
      return renderCodeBlock(props, format);
    case 'TaskList':
      return renderTaskList(props, format);
    case 'ProgressBar':
      return renderProgressBar(props, format);
    default:
      logger.warn('Unknown component', { name });
      return `[${name}]`;
  }
}

/**
 * Render GitHub Issue component
 *
 * @param {Object} props - Component props
 * @param {string} format - Output format
 * @returns {string} Rendered component
 */
function renderGitHubIssue(props, format) {
  const { repo, number, title, state } = props;

  if (format === 'telegram') {
    const stateEmoji = state === 'open' ? '🟢' : state === 'closed' ? '🔴' : '⚪';
    return `${stateEmoji} Issue #${number} in ${repo}${title ? `: ${title}` : ''}`;
  }

  if (format === 'cli') {
    return `[Issue #${number}] ${repo}${title ? ` - ${title}` : ''}`;
  }

  if (format === 'html') {
    const url = `https://github.com/${repo}/issues/${number}`;
    return `<a href="${url}" target="_blank">Issue #${number}: ${title || repo}</a>`;
  }

  return `Issue #${number} in ${repo}`;
}

/**
 * Render GitHub PR component
 *
 * @param {Object} props - Component props
 * @param {string} format - Output format
 * @returns {string} Rendered component
 */
function renderGitHubPR(props, format) {
  const { repo, number, title, state } = props;

  if (format === 'telegram') {
    const stateEmoji = state === 'open' ? '🔵' : state === 'merged' ? '🟣' : '🔴';
    return `${stateEmoji} PR #${number} in ${repo}${title ? `: ${title}` : ''}`;
  }

  if (format === 'cli') {
    return `[PR #${number}] ${repo}${title ? ` - ${title}` : ''}`;
  }

  if (format === 'html') {
    const url = `https://github.com/${repo}/pull/${number}`;
    return `<a href="${url}" target="_blank">PR #${number}: ${title || repo}</a>`;
  }

  return `PR #${number} in ${repo}`;
}

/**
 * Render GitHub Workflow component
 *
 * @param {Object} props - Component props
 * @param {string} format - Output format
 * @returns {string} Rendered component
 */
function renderGitHubWorkflow(props, format) {
  const { repo, runId, status, name } = props;

  if (format === 'telegram') {
    const statusEmoji = status === 'success' ? '✅' : status === 'failure' ? '❌' : '🟠';
    return `${statusEmoji} Workflow${name ? ` "${name}"` : ''} #${runId} in ${repo}`;
  }

  if (format === 'cli') {
    return `[Workflow #${runId}] ${repo}${name ? ` - ${name}` : ''} (${status || 'unknown'})`;
  }

  if (format === 'html') {
    const url = `https://github.com/${repo}/actions/runs/${runId}`;
    return `<a href="${url}" target="_blank">Workflow ${name || '#' + runId}</a>`;
  }

  return `Workflow #${runId} in ${repo}`;
}

/**
 * Render File Tree component
 *
 * @param {Object} props - Component props
 * @param {string} format - Output format
 * @returns {string} Rendered component
 */
function renderFileTree(props, format) {
  const { files = [] } = props;

  if (format === 'telegram') {
    return '📁 Files:\n' + files.map(f => `  └─ ${f}`).join('\n');
  }

  if (format === 'cli') {
    return 'Files:\n' + files.map(f => `  - ${f}`).join('\n');
  }

  if (format === 'html') {
    return '<ul>' + files.map(f => `<li>${f}</li>`).join('') + '</ul>';
  }

  return files.join(', ');
}

/**
 * Render Code Block component
 *
 * @param {Object} props - Component props
 * @param {string} format - Output format
 * @returns {string} Rendered component
 */
function renderCodeBlock(props, format) {
  const { language = 'text', code = '' } = props;

  if (format === 'telegram') {
    return `\`\`\`${language}\n${code}\n\`\`\``;
  }

  if (format === 'cli') {
    return `--- ${language} ---\n${code}\n---------`;
  }

  if (format === 'html') {
    return `<pre><code class="language-${language}">${escapeHtml(code)}</code></pre>`;
  }

  return code;
}

/**
 * Render Task List component
 *
 * @param {Object} props - Component props
 * @param {string} format - Output format
 * @returns {string} Rendered component
 */
function renderTaskList(props, format) {
  const { tasks = [], completed = 0 } = props;

  if (format === 'telegram') {
    const lines = tasks.map(task => {
      const checkbox = task.completed ? '✅' : '⬜';
      return `${checkbox} ${task.name}`;
    });
    return lines.join('\n');
  }

  if (format === 'cli') {
    const lines = tasks.map(task => {
      const checkbox = task.completed ? '[x]' : '[ ]';
      return `${checkbox} ${task.name}`;
    });
    return lines.join('\n');
  }

  return tasks.map(t => t.name).join(', ');
}

/**
 * Render Progress Bar component
 *
 * @param {Object} props - Component props
 * @param {string} format - Output format
 * @returns {string} Rendered component
 */
function renderProgressBar(props, format) {
  const { current = 0, total = 100, label = '' } = props;
  const percentage = Math.round((current / total) * 100);

  if (format === 'telegram') {
    const filled = Math.round(percentage / 10);
    const empty = 10 - filled;
    const bar = '█'.repeat(filled) + '░'.repeat(empty);
    return `${label ? label + ' ' : ''}${bar} ${percentage}%`;
  }

  if (format === 'cli') {
    const filled = Math.round(percentage / 5);
    const empty = 20 - filled;
    const bar = '='.repeat(filled) + '-'.repeat(empty);
    return `[${bar}] ${percentage}%`;
  }

  return `${percentage}%`;
}

/**
 * Escape HTML special characters
 *
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}

/**
 * Convert markdown with JSX to plain text
 *
 * @param {string} markdown - Markdown with JSX
 * @returns {string} Plain text
 */
export function toPlainText(markdown) {
  return parseJSXComponents(markdown, 'cli');
}

/**
 * Convert markdown with JSX to Telegram format
 *
 * @param {string} markdown - Markdown with JSX
 * @returns {string} Telegram-formatted text
 */
export function toTelegram(markdown) {
  return parser.toTelegram(markdown);
}

/**
 * Convert markdown with JSX to HTML
 *
 * @param {string} markdown - Markdown with JSX
 * @returns {string} HTML
 */
export function toHTML(markdown) {
  return parser.toHTML(markdown);
}
