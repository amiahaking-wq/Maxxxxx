/**
 * Ruflo Swarm Configuration
 * Maps MAX micro-agents to ruflo agent roles with specialized tools
 */

export default {
  // LLM Provider Configuration
  llmProvider: "anthropic",
  apiKey: process.env.ANTHROPIC_API_KEY,

  // Agent Definitions (maps to MAX micro-agents)
  agents: [
    {
      role: "system-architect",
      systemPrompt: `You are the System Architect agent specializing in:
- Database schema design and migrations
- Technical documentation and architecture decisions
- API design and system integration patterns
- File structure and module organization

Tools available: read, write, glob, grep
Focus on high-level design and documentation.`,
      tools: ["read", "write", "glob", "grep"],
      model: "claude-sonnet-4-5-20250929",
      temperature: 0.2
    },
    {
      role: "fullstack-engineer",
      systemPrompt: `You are the FullStack Engineer agent specializing in:
- Writing modular, testable backend and frontend code
- Implementing features with proper error handling
- Refactoring and code optimization
- Integration of APIs and services

Tools available: read, write, edit, bash
Focus on clean code implementation following project standards.`,
      tools: ["read", "write", "edit", "bash"],
      model: "claude-sonnet-4-5-20250929",
      temperature: 0.3
    },
    {
      role: "devops-engineer",
      systemPrompt: `You are the DevOps Engineer agent specializing in:
- Docker builds and container optimization
- CI/CD pipeline configuration
- Cloud deployment workflows (Railway, etc.)
- Environment configuration and secrets management

Tools available: bash, write, read
Focus on deployment automation and infrastructure.`,
      tools: ["bash", "write", "read"],
      model: "claude-sonnet-4-5-20250929",
      temperature: 0.2
    },
    {
      role: "media-director",
      systemPrompt: `You are the Media Director agent specializing in:
- Video processing with FFmpeg
- Media timeline calculations and JSON generation
- Image and audio manipulation
- Format conversions and optimization

Tools available: read, write
Focus on media processing and timeline generation.`,
      tools: ["read", "write"],
      model: "claude-sonnet-4-5-20250929",
      temperature: 0.3
    }
  ],

  // Swarm Orchestration Configuration
  orchestration: {
    // Hierarchical topology for coordinated execution
    topology: "hierarchical",

    // Maximum concurrent agents (aligned with 4 micro-agents)
    maxAgents: 4,

    // Specialized strategy (each agent has specific role)
    strategy: "specialized",

    // Context sharing between agents
    contextSharing: true,

    // Automatic dependency resolution
    autoDependencies: true
  },

  // MCP (Model Context Protocol) Integration
  mcp: {
    enabled: process.env.RUFLO_MCP_TOOLS === 'enabled',
    tools: [
      "read",
      "write",
      "edit",
      "bash",
      "glob",
      "grep"
    ]
  },

  // Daemon Configuration
  daemon: {
    enabled: process.env.RUFLO_DAEMON_ENABLED === 'true',
    port: process.env.RUFLO_DAEMON_PORT || 7878,
    autoStart: true
  },

  // Logging Configuration
  logging: {
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    format: 'json'
  }
};
