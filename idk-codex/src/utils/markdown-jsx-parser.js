/**
 * Markdown JSX Parser
 *
 * Parses JSX-like components in Markdown for rendering in Telegram/Discord.
 * Based on Claude Code's JSX-in-Markdown system.
 *
 * Supported components:
 * - <GitHubIssue owner="" repo="" number="" />
 * - <GitHubPR owner="" repo="" number="" />
 * - <GitHubWorkflow owner="" repo="" runId="" />
 * - <FileLink path="" />
 * - <CodeBlock lang="" code="" />
 *
 * @module markdown-jsx-parser
 */

import logger from './logger.js';

/**
 * Markdown JSX Parser
 */
export class MarkdownJSXParser {
  constructor() {
    this.components = {
      GitHubIssue: this.renderGitHubIssue.bind(this),
      GitHubPR: this.renderGitHubPR.bind(this),
      GitHubWorkflow: this.renderGitHubWorkflow.bind(this),
      FileLink: this.renderFileLink.bind(this),
      CodeBlock: this.renderCodeBlock.bind(this)
    };
  }

  /**
   * Parse markdown with JSX components
   *
   * @param {string} markdown - Markdown string with JSX components
   * @param {string} format - Output format ('telegram', 'discord', 'html')
   * @returns {string} Parsed markdown
   */
  parse(markdown, format = 'telegram') {
    if (!markdown) {
      return '';
    }

    let parsed = markdown;

    // Find and replace all JSX components
    for (const [componentName, renderer] of Object.entries(this.components)) {
      const pattern = this.getComponentPattern(componentName);
      const matches = [...parsed.matchAll(pattern)];

      for (const match of matches) {
        try {
          const props = this.parseProps(match[1]);
          const rendered = renderer(props, format);
          parsed = parsed.replace(match[0], rendered);
        } catch (error) {
          logger.error('Failed to render JSX component', {
            component: componentName,
            error: error.message
          });
          // Leave component as-is on error
        }
      }
    }

    return parsed;
  }

  /**
   * Get regex pattern for component
   *
   * @param {string} componentName - Component name
   * @returns {RegExp} Pattern
   */
  getComponentPattern(componentName) {
    // Matches: <ComponentName prop="value" prop2="value2" />
    return new RegExp(
      `<${componentName}\\s+([^>]+?)\\s*/>`,
      'g'
    );
  }

  /**
   * Parse component props from string
   *
   * @param {string} propsString - Props string (e.g., 'owner="foo" repo="bar"')
   * @returns {Object} Props object
   */
  parseProps(propsString) {
    const props = {};

    // Match prop="value" or prop='value' or prop={value}
    const propPattern = /(\w+)=(?:"([^"]*)"|'([^']*)'|\{([^}]*)\})/g;
    let match;

    while ((match = propPattern.exec(propsString)) !== null) {
      const propName = match[1];
      const propValue = match[2] || match[3] || match[4];
      props[propName] = propValue;
    }

    return props;
  }

  /**
   * Render GitHubIssue component
   *
   * @param {Object} props - Component props
   * @param {string} format - Output format
   * @returns {string} Rendered component
   */
  renderGitHubIssue(props, format) {
    const { owner, repo, number, title } = props;

    if (!owner || !repo || !number) {
      logger.warn('GitHubIssue missing required props', { props });
      return '[Invalid GitHubIssue component]';
    }

    const url = `https://github.com/${owner}/${repo}/issues/${number}`;

    if (format === 'telegram') {
      const displayTitle = title || `Issue #${number}`;
      return `🔗 <a href="${url}">${this.escapeHtml(displayTitle)}</a>`;
    } else if (format === 'discord') {
      const displayTitle = title || `Issue #${number}`;
      return `🔗 [${displayTitle}](${url})`;
    } else {
      const displayTitle = title || `Issue #${number}`;
      return `<a href="${url}">${this.escapeHtml(displayTitle)}</a>`;
    }
  }

  /**
   * Render GitHubPR component
   *
   * @param {Object} props - Component props
   * @param {string} format - Output format
   * @returns {string} Rendered component
   */
  renderGitHubPR(props, format) {
    const { owner, repo, number, title } = props;

    if (!owner || !repo || !number) {
      logger.warn('GitHubPR missing required props', { props });
      return '[Invalid GitHubPR component]';
    }

    const url = `https://github.com/${owner}/${repo}/pull/${number}`;

    if (format === 'telegram') {
      const displayTitle = title || `PR #${number}`;
      return `🔀 <a href="${url}">${this.escapeHtml(displayTitle)}</a>`;
    } else if (format === 'discord') {
      const displayTitle = title || `PR #${number}`;
      return `🔀 [${displayTitle}](${url})`;
    } else {
      const displayTitle = title || `PR #${number}`;
      return `<a href="${url}">${this.escapeHtml(displayTitle)}</a>`;
    }
  }

  /**
   * Render GitHubWorkflow component
   *
   * @param {Object} props - Component props
   * @param {string} format - Output format
   * @returns {string} Rendered component
   */
  renderGitHubWorkflow(props, format) {
    const { owner, repo, runId, name, status } = props;

    if (!owner || !repo || !runId) {
      logger.warn('GitHubWorkflow missing required props', { props });
      return '[Invalid GitHubWorkflow component]';
    }

    const url = `https://github.com/${owner}/${repo}/actions/runs/${runId}`;

    let emoji = '⚙️';
    if (status === 'success') emoji = '✅';
    else if (status === 'failure') emoji = '❌';
    else if (status === 'in_progress') emoji = '🔄';

    if (format === 'telegram') {
      const displayName = name || `Workflow #${runId}`;
      return `${emoji} <a href="${url}">${this.escapeHtml(displayName)}</a>`;
    } else if (format === 'discord') {
      const displayName = name || `Workflow #${runId}`;
      return `${emoji} [${displayName}](${url})`;
    } else {
      const displayName = name || `Workflow #${runId}`;
      return `${emoji} <a href="${url}">${this.escapeHtml(displayName)}</a>`;
    }
  }

  /**
   * Render FileLink component
   *
   * @param {Object} props - Component props
   * @param {string} format - Output format
   * @returns {string} Rendered component
   */
  renderFileLink(props, format) {
    const { path, line } = props;

    if (!path) {
      logger.warn('FileLink missing path prop', { props });
      return '[Invalid FileLink component]';
    }

    const displayPath = line ? `${path}:${line}` : path;

    if (format === 'telegram') {
      return `📄 <code>${this.escapeHtml(displayPath)}</code>`;
    } else if (format === 'discord') {
      return `📄 \`${displayPath}\``;
    } else {
      return `<code>${this.escapeHtml(displayPath)}</code>`;
    }
  }

  /**
   * Render CodeBlock component
   *
   * @param {Object} props - Component props
   * @param {string} format - Output format
   * @returns {string} Rendered component
   */
  renderCodeBlock(props, format) {
    const { lang, code } = props;

    if (!code) {
      logger.warn('CodeBlock missing code prop', { props });
      return '[Invalid CodeBlock component]';
    }

    if (format === 'telegram') {
      // Telegram doesn't support syntax highlighting in HTML mode
      return `<pre>${this.escapeHtml(code)}</pre>`;
    } else if (format === 'discord') {
      const language = lang || '';
      return `\`\`\`${language}\n${code}\n\`\`\``;
    } else {
      const language = lang || 'text';
      return `<pre><code class="language-${language}">${this.escapeHtml(code)}</code></pre>`;
    }
  }

  /**
   * Escape HTML special characters
   *
   * @param {string} text - Text to escape
   * @returns {string} Escaped text
   */
  escapeHtml(text) {
    if (!text) return '';

    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Parse and render for Telegram
   *
   * @param {string} markdown - Markdown with JSX
   * @returns {string} Telegram HTML
   */
  toTelegram(markdown) {
    return this.parse(markdown, 'telegram');
  }

  /**
   * Parse and render for Discord
   *
   * @param {string} markdown - Markdown with JSX
   * @returns {string} Discord markdown
   */
  toDiscord(markdown) {
    return this.parse(markdown, 'discord');
  }

  /**
   * Parse and render for HTML
   *
   * @param {string} markdown - Markdown with JSX
   * @returns {string} HTML
   */
  toHTML(markdown) {
    return this.parse(markdown, 'html');
  }

  /**
   * Extract GitHub links from markdown
   *
   * @param {string} markdown - Markdown content
   * @returns {Array<Object>} Array of GitHub links
   */
  extractGitHubLinks(markdown) {
    const links = [];

    // Extract GitHubIssue components
    const issuePattern = /<GitHubIssue\s+([^>]+?)\s*\/>/g;
    let match;

    while ((match = issuePattern.exec(markdown)) !== null) {
      const props = this.parseProps(match[1]);
      if (props.owner && props.repo && props.number) {
        links.push({
          type: 'issue',
          owner: props.owner,
          repo: props.repo,
          number: parseInt(props.number, 10),
          url: `https://github.com/${props.owner}/${props.repo}/issues/${props.number}`
        });
      }
    }

    // Extract GitHubPR components
    const prPattern = /<GitHubPR\s+([^>]+?)\s*\/>/g;

    while ((match = prPattern.exec(markdown)) !== null) {
      const props = this.parseProps(match[1]);
      if (props.owner && props.repo && props.number) {
        links.push({
          type: 'pull_request',
          owner: props.owner,
          repo: props.repo,
          number: parseInt(props.number, 10),
          url: `https://github.com/${props.owner}/${props.repo}/pull/${props.number}`
        });
      }
    }

    return links;
  }
}

/**
 * Singleton instance
 */
export const parser = new MarkdownJSXParser();

export default MarkdownJSXParser;
