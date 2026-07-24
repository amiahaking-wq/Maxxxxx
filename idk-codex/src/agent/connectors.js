/**
 * MAX 2.0 — Connectors Framework
 *
 * Connectors let MAX interact with external services:
 *   - Gmail (read/send emails)
 *   - Google Calendar (create/check events)
 *   - Google Drive (read/create files)
 *   - GitHub (issues, PRs, commits)
 *
 * Each connector:
 *   - Has an OAuth2 or API key auth flow
 *   - Exposes tools that the ReAct loop can call
 *   - Stores credentials securely (encrypted in DB)
 *
 * Phase 4 implementation: GitHub connector (uses PAT, no OAuth needed)
 * Gmail/Calendar/Drive: stubs ready for OAuth2 (needs Google Cloud credentials)
 */

import logger from '../utils/logger.js';

// ============================================================================
// CONNECTOR REGISTRY
// ============================================================================

const connectors = {};

/**
 * Register a connector
 */
export function registerConnector(name, connector) {
  connectors[name] = connector;
  logger.info('Connector registered', { name });
}

/**
 * Get a connector by name
 */
export function getConnector(name) {
  return connectors[name] || null;
}

/**
 * List all registered connectors
 */
export function listConnectors() {
  return Object.entries(connectors).map(([name, conn]) => ({
    name,
    connected: conn.isConnected(),
    tools: conn.getTools ? conn.getTools().map(t => t.name) : []
  }));
}

/**
 * Get all tools from all connected connectors
 * These tools are added to the ReAct loop's tool registry
 */
export function getAllConnectorTools() {
  const tools = [];
  for (const connector of Object.values(connectors)) {
    if (connector.isConnected() && connector.getTools) {
      tools.push(...connector.getTools());
    }
  }
  return tools;
}

// ============================================================================
// GITHUB CONNECTOR
// ============================================================================

class GitHubConnector {
  constructor() {
    this.name = 'github';
    this.token = process.env.GITHUB_TOKEN || null;
  }

  isConnected() {
    return !!this.token;
  }

  getTools() {
    return [
      {
        name: 'github_create_issue',
        description: 'Create a GitHub issue in a repository',
        params: {
          owner: 'string (required) — repo owner (e.g. "amiahaking-wq")',
          repo: 'string (required) — repo name (e.g. "Maxxxxx")',
          title: 'string (required) — issue title',
          body: 'string (optional) — issue description',
          labels: 'string (optional) — comma-separated labels'
        },
        execute: async (args) => this.createIssue(args)
      },
      {
        name: 'github_list_issues',
        description: 'List open issues in a GitHub repository',
        params: {
          owner: 'string (required) — repo owner',
          repo: 'string (required) — repo name',
          state: 'string (optional) — open/closed/all, default open',
          limit: 'number (optional) — max issues, default 10'
        },
        execute: async (args) => this.listIssues(args)
      },
      {
        name: 'github_create_pr',
        description: 'Create a pull request',
        params: {
          owner: 'string (required) — repo owner',
          repo: 'string (required) — repo name',
          title: 'string (required) — PR title',
          head: 'string (required) — source branch',
          base: 'string (required) — target branch (usually main)',
          body: 'string (optional) — PR description'
        },
        execute: async (args) => this.createPR(args)
      },
      {
        name: 'github_search_code',
        description: 'Search for code across GitHub repositories',
        params: {
          query: 'string (required) — search query (e.g. "repo:amiahaking-wq/Maxxxxx function")',
          limit: 'number (optional) — max results, default 10'
        },
        execute: async (args) => this.searchCode(args)
      },
      {
        name: 'github_get_file',
        description: 'Get a file from a GitHub repo (without cloning)',
        params: {
          owner: 'string (required) — repo owner',
          repo: 'string (required) — repo name',
          path: 'string (required) — file path in the repo',
          branch: 'string (optional) — branch name, default main'
        },
        execute: async (args) => this.getFile(args)
      }
    ];
  }

  async apiCall(endpoint, method = 'GET', body = null) {
    const response = await fetch(`https://api.github.com${endpoint}`, {
      method,
      headers: {
        'Authorization': `token ${this.token}`,
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json'
      },
      body: body ? JSON.stringify(body) : null
    });

    const data = await response.json();

    if (!response.ok) {
      return `Error: ${data.message || response.statusText}`;
    }

    return data;
  }

  async createIssue(args) {
    const { owner, repo, title, body, labels } = args;
    if (!owner || !repo || !title) return 'Error: owner, repo, and title are required';

    const issueBody = {
      title,
      body: body || '',
      labels: labels ? labels.split(',').map(l => l.trim()) : []
    };

    const result = await this.apiCall(`/repos/${owner}/${repo}/issues`, 'POST', issueBody);

    if (result.html_url) {
      return `Issue created: #${result.number} — ${result.html_url}`;
    }
    return `Error: ${typeof result === 'string' ? result : 'Failed to create issue'}`;
  }

  async listIssues(args) {
    const { owner, repo, state = 'open', limit = 10 } = args;
    if (!owner || !repo) return 'Error: owner and repo are required';

    const result = await this.apiCall(`/repos/${owner}/${repo}/issues?state=${state}&per_page=${limit}`);

    if (!Array.isArray(result)) {
      return `Error: ${typeof result === 'string' ? result : 'Failed to list issues'}`;
    }

    if (result.length === 0) return `No ${state} issues found.`;

    return result.map(i => `#${i.number} [${i.state}] ${i.title} — ${i.html_url}`).join('\n');
  }

  async createPR(args) {
    const { owner, repo, title, head, base, body } = args;
    if (!owner || !repo || !title || !head || !base) {
      return 'Error: owner, repo, title, head, and base are required';
    }

    const prBody = { title, head, base, body: body || '' };
    const result = await this.apiCall(`/repos/${owner}/${repo}/pulls`, 'POST', prBody);

    if (result.html_url) {
      return `PR created: #${result.number} — ${result.html_url}`;
    }
    return `Error: ${typeof result === 'string' ? result : 'Failed to create PR'}`;
  }

  async searchCode(args) {
    const { query, limit = 10 } = args;
    if (!query) return 'Error: query is required';

    const result = await this.apiCall(`/search/code?q=${encodeURIComponent(query)}&per_page=${limit}`);

    if (!result.items) {
      return `Error: ${typeof result === 'string' ? result : 'Failed to search code'}`;
    }

    if (result.items.length === 0) return 'No code matches found.';

    return result.items.map(i => `${i.repository.full_name}/${i.path}:${i.html_url}`).join('\n');
  }

  async getFile(args) {
    const { owner, repo, path, branch = 'main' } = args;
    if (!owner || !repo || !path) return 'Error: owner, repo, and path are required';

    const result = await this.apiCall(`/repos/${owner}/${repo}/contents/${path}?ref=${branch}`);

    if (result.content) {
      const content = Buffer.from(result.content, 'base64').toString('utf-8');
      if (content.length > 5000) {
        return content.substring(0, 5000) + '\n... (truncated)';
      }
      return content;
    }
    return `Error: ${typeof result === 'string' ? result : 'File not found'}`;
  }
}

// ============================================================================
// GMAIL CONNECTOR (Stub — needs OAuth2 setup)
// ============================================================================

class GmailConnector {
  constructor() {
    this.name = 'gmail';
    this.clientId = process.env.GOOGLE_CLIENT_ID || null;
    this.clientSecret = process.env.GOOGLE_CLIENT_SECRET || null;
    this.refreshToken = process.env.GOOGLE_REFRESH_TOKEN || null;
  }

  isConnected() {
    return !!(this.clientId && this.clientSecret && this.refreshToken);
  }

  getTools() {
    return [
      {
        name: 'gmail_search',
        description: 'Search Gmail inbox for emails. Returns subject, from, date, and snippet.',
        params: {
          query: 'string (required) — Gmail search query (e.g. "from:john@example.com subject:project")',
          max: 'number (optional) — max results, default 5'
        },
        execute: async (args) => this.isConnected()
          ? 'Gmail connector not yet configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REFRESH_TOKEN.'
          : 'Gmail not connected'
      },
      {
        name: 'gmail_send',
        description: 'Send an email via Gmail',
        params: {
          to: 'string (required) — recipient email',
          subject: 'string (required) — email subject',
          body: 'string (required) — email body'
        },
        execute: async (args) => 'Gmail connector not yet configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REFRESH_TOKEN.'
      }
    ];
  }
}

// ============================================================================
// GOOGLE CALENDAR CONNECTOR (Stub — needs OAuth2)
// ============================================================================

class CalendarConnector {
  constructor() {
    this.name = 'calendar';
    this.clientId = process.env.GOOGLE_CLIENT_ID || null;
    this.clientSecret = process.env.GOOGLE_CLIENT_SECRET || null;
    this.refreshToken = process.env.GOOGLE_REFRESH_TOKEN || null;
  }

  isConnected() {
    return !!(this.clientId && this.clientSecret && this.refreshToken);
  }

  getTools() {
    return [
      {
        name: 'calendar_list_events',
        description: 'List upcoming Google Calendar events',
        params: {
          max: 'number (optional) — max events, default 10',
          days: 'number (optional) — look ahead N days, default 7'
        },
        execute: async (args) => 'Calendar connector not yet configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REFRESH_TOKEN.'
      },
      {
        name: 'calendar_create_event',
        description: 'Create a Google Calendar event',
        params: {
          title: 'string (required) — event title',
          start: 'string (required) — start time (ISO 8601)',
          end: 'string (required) — end time (ISO 8601)',
          description: 'string (optional) — event description'
        },
        execute: async (args) => 'Calendar connector not yet configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REFRESH_TOKEN.'
      }
    ];
  }
}

// ============================================================================
// GOOGLE DRIVE CONNECTOR (Stub — needs OAuth2)
// ============================================================================

class DriveConnector {
  constructor() {
    this.name = 'drive';
    this.clientId = process.env.GOOGLE_CLIENT_ID || null;
    this.clientSecret = process.env.GOOGLE_CLIENT_SECRET || null;
    this.refreshToken = process.env.GOOGLE_REFRESH_TOKEN || null;
  }

  isConnected() {
    return !!(this.clientId && this.clientSecret && this.refreshToken);
  }

  getTools() {
    return [
      {
        name: 'drive_search',
        description: 'Search Google Drive for files',
        params: {
          query: 'string (required) — search query'
        },
        execute: async (args) => 'Drive connector not yet configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REFRESH_TOKEN.'
      },
      {
        name: 'drive_create_doc',
        description: 'Create a Google Doc with text content',
        params: {
          title: 'string (required) — document title',
          content: 'string (required) — document content'
        },
        execute: async (args) => 'Drive connector not yet configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REFRESH_TOKEN.'
      }
    ];
  }
}

// ============================================================================
// AUTO-REGISTER CONNECTORS
// ============================================================================

export function initializeConnectors() {
  // GitHub connector — works immediately if GITHUB_TOKEN is set
  registerConnector('github', new GitHubConnector());

  // Google connectors — need OAuth2 setup (stubs until configured)
  registerConnector('gmail', new GmailConnector());
  registerConnector('calendar', new CalendarConnector());
  registerConnector('drive', new DriveConnector());

  logger.info('Connectors initialized', {
    registered: Object.keys(connectors),
    connected: Object.entries(connectors).filter(([_, c]) => c.isConnected()).map(([n]) => n)
  });
}

export default {
  registerConnector,
  getConnector,
  listConnectors,
  getAllConnectorTools,
  initializeConnectors
};
