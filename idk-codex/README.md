# 🤖 MAX - Multi-Agent eXecutor System

**Autonomous CI/CD Developer Agent v2.0**

A fully autonomous AI-powered development agent that executes tasks through Telegram with a 5-phase self-healing loop. Built for Railway deployment with 1GB RAM optimization.

## ✨ Features

### 🔄 5-Phase Autonomous Loop (Ralph Pattern)

1. **PLAN** - Analyze repository, read claude.md guidelines, create structured plan
2. **EXECUTE** - Generate code with self-review before committing
3. **TEST** - Run validation/test suites with detailed feedback
4. **DEPLOY** - Commit and push to GitHub with semantic messages
5. **MONITOR** - Poll GitHub Actions and detect failures

### 🛡️ Security Features

- **User Whitelist**: Only authorized Telegram user can access
- **Command Blocklist**: Blocks `rm -rf /`, `sudo`, credential modifications, etc.
- **Sandboxed Execution**: All operations in isolated workspace using `fs-safe`
- **Process Isolation**: Child processes run as nobody user (uid/gid 65534)
- **Timeouts**: 5-minute timeout on all commands
- **Path Containment**: Prevents path traversal and system directory access

### 🔧 Self-Healing

- Automatically retries failed tasks up to 10 times
- AI-powered error analysis and code fixes
- Exponential backoff between retries
- Detailed error context for each retry

### 📋 PR Review

- Security vulnerability detection
- Hardcoded credential scanning
- Malicious pattern detection
- Code quality analysis
- Compliance with claude.md guidelines

## 🚀 Quick Start

### Prerequisites

- Node.js 22+
- Telegram Bot Token ([Get one from @BotFather](https://t.me/botfather))
- Groq API Key ([Get from groq.com](https://console.groq.com))
- GitHub Personal Access Token ([Create here](https://github.com/settings/tokens))
- Railway Account ([Sign up](https://railway.app))

### Local Development

1. **Clone and Install**

```bash
git clone <your-repo-url>
cd autonomous-cicd-telegram-agent
npm install
```

2. **Configure Environment**

```bash
cp .env.example .env
# Edit .env with your credentials
```

3. **Initialize Database**

```bash
npm run init-db
```

4. **Start Development Server**

```bash
npm run dev
```

## 🌐 Railway Deployment

### One-Click Deploy

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/new/template?template=https://github.com/YOUR_USERNAME/YOUR_REPO)

### Manual Deployment

1. **Create New Project**
   - Go to [Railway Dashboard](https://railway.app/dashboard)
   - Click "New Project" → "Deploy from GitHub repo"
   - Select your repository

2. **Configure Environment Variables**

Add these in Railway project settings:

```bash
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
AUTHORIZED_USER_ID=your_telegram_user_id
GROQ_API_KEY=your_groq_api_key
GITHUB_TOKEN=your_github_token
GITHUB_REPO_OWNER=your_github_username
GITHUB_REPO_NAME=your_repo_name
NODE_ENV=production
PORT=3000
DATABASE_PATH=./data/sessions.db
SESSION_PRUNE_DAYS=30
MAX_RETRY_COUNT=10
COMMAND_TIMEOUT_MS=300000
SANDBOX_WORKSPACE=./sandbox-workspace
LOG_LEVEL=info
```

3. **Deploy**
   - Railway will automatically build and deploy
   - Check logs for successful startup

4. **Get Your Telegram User ID**

Send a message to your bot, then check Railway logs for your user ID.

## 📱 Telegram Commands

### Basic Commands

- `/start` - Welcome message and overview
- `/help` - Detailed help and documentation

### Task Execution

```
/task Create a REST API endpoint for user authentication
```

The agent will:
1. Plan the implementation
2. Generate code
3. Run tests
4. Commit and push
5. Monitor CI/CD

### PR Review

```
/review_pr 42
```

Reviews PR #42 for security, quality, and compliance.

### Status Check

```
/status
```

Shows current GitHub Actions workflow status.

## 🏗️ Architecture

```
autonomous-cicd-telegram-agent/
├── server.js                  # Main entry point
├── package.json               # Dependencies
├── railway.toml              # Railway config
├── nixpacks.toml             # Build config
├── .env.example              # Environment template
├── src/
│   ├── bot/                  # Telegram bot
│   │   ├── telegram.js       # Bot initialization
│   │   ├── commands.js       # Command handlers
│   │   └── middleware.js     # Auth & logging
│   ├── agent/                # Autonomous agent
│   │   ├── loop.js           # 5-phase orchestrator
│   │   ├── context.js        # Memory management
│   │   └── phases/           # Individual phases
│   │       ├── plan.js
│   │       ├── execute.js
│   │       ├── test.js
│   │       ├── deploy.js
│   │       └── monitor.js
│   ├── groq/                 # AI integration
│   │   ├── client.js         # Groq SDK wrapper
│   │   └── prompts.js        # Prompt templates
│   ├── github/               # GitHub integration
│   │   ├── octokit.js        # GitHub API
│   │   ├── pr-review.js      # PR analysis
│   │   └── workflows.js      # CI/CD monitoring
│   ├── security/             # Security layer
│   │   ├── sandbox.js        # Safe execution
│   │   ├── blocklist.js      # Command filtering
│   │   └── validation.js     # Input validation
│   ├── database/             # SQLite storage
│   │   ├── db.js             # Database init
│   │   ├── queries.js        # Prepared statements
│   │   └── schema.sql        # Schema definition
│   └── utils/                # Utilities
│       ├── logger.js         # Winston logging
│       ├── filesystem.js     # fs-safe wrapper
│       └── git.js            # simple-git wrapper
├── data/                     # SQLite database
├── sessions/                 # Session backups
└── sandbox-workspace/        # Isolated execution
```

## 🔒 Security Best Practices

### For Users

1. **Never share your `.env` file**
2. **Use minimal GitHub token permissions** (repo, workflow)
3. **Review all AI-generated code** before deployment
4. **Keep your Telegram user ID private**
5. **Monitor Railway logs** for suspicious activity

### Built-in Protection

- ✅ Command blocklist prevents destructive operations
- ✅ All file operations within sandbox
- ✅ Child processes run with restricted permissions
- ✅ Automatic timeout on long-running commands
- ✅ Input validation on all user inputs
- ✅ No shell execution with interpolated strings

## 📊 Performance & Optimization

### 1GB RAM Optimizations

- **Streaming responses** from Groq (no buffering)
- **SQLite WAL mode** with 16MB cache
- **Temp tables in memory** for better performance
- **Session pruning** after 30 days
- **Context limited** to last 10 messages
- **One agent loop at a time** (no concurrency)

### Database Pragmas

```sql
journal_mode = WAL
cache_size = -16000  -- 16MB
temp_store = MEMORY
synchronous = NORMAL
mmap_size = 30000000000
```

## 🧪 Testing

### Local Testing

```bash
# Run syntax check
npm run test

# Test specific component
node src/agent/phases/plan.js

# Check logs
tail -f logs/combined.log
```

### Test Commands

```bash
# Test task execution
/task Create a hello world function

# Test PR review
/review_pr 1

# Test status
/status
```

## 🐛 Troubleshooting

### Bot Not Responding

1. Check `AUTHORIZED_USER_ID` matches your Telegram ID
2. Verify `TELEGRAM_BOT_TOKEN` is correct
3. Check Railway logs for errors

### Agent Fails Immediately

1. Verify all environment variables are set
2. Check GitHub token has correct permissions
3. Ensure `GROQ_API_KEY` is valid
4. Review logs for specific errors

### Tests Always Fail

1. Check `package.json` has test script
2. Verify test command in repository
3. Review test output in agent response
3. Check sandbox workspace permissions

### Deployment Fails

1. Ensure git is configured in sandbox
2. Check GitHub token permissions
3. Verify repository exists and is accessible

## 📝 Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `TELEGRAM_BOT_TOKEN` | ✅ Yes | - | Telegram bot token from @BotFather |
| `AUTHORIZED_USER_ID` | ✅ Yes | - | Your Telegram user ID (numeric) |
| `GROQ_API_KEY` | ✅ Yes | - | Groq API key for AI |
| `GITHUB_TOKEN` | ✅ Yes | - | GitHub personal access token |
| `GITHUB_REPO_OWNER` | ✅ Yes | - | GitHub username/org |
| `GITHUB_REPO_NAME` | ✅ Yes | - | Repository name |
| `NODE_ENV` | No | `production` | Environment mode |
| `PORT` | No | `3000` | HTTP health check port |
| `DATABASE_PATH` | No | `./data/sessions.db` | SQLite database path |
| `SESSION_PRUNE_DAYS` | No | `30` | Days to keep old sessions |
| `MAX_RETRY_COUNT` | No | `10` | Maximum self-healing retries |
| `COMMAND_TIMEOUT_MS` | No | `300000` | Command timeout (5 min) |
| `SANDBOX_WORKSPACE` | No | `./sandbox-workspace` | Isolated workspace path |
| `LOG_LEVEL` | No | `info` | Logging level |

## 🤝 Contributing

Contributions welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Add tests if applicable
4. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details

## 🙏 Acknowledgments

- Built with [Telegraf](https://telegraf.js.org/)
- AI powered by [Groq](https://groq.com/)
- GitHub API via [Octokit](https://github.com/octokit/rest.js)
- Database with [better-sqlite3](https://github.com/WiseLibs/better-sqlite3)
- Security via [fs-safe](https://github.com/gribnoysup/fs-safe)

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/YOUR_USERNAME/YOUR_REPO/issues)
- **Discussions**: [GitHub Discussions](https://github.com/YOUR_USERNAME/YOUR_REPO/discussions)

---

**⚠️ Disclaimer**: This is an autonomous AI agent. Always review generated code before deploying to production. Use at your own risk.
