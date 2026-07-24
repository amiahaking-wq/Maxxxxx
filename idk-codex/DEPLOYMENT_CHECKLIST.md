# 🚀 Deployment Checklist

Use this checklist to deploy your Autonomous CI/CD Telegram Developer Agent.

## Pre-Deployment

### 1. Create Telegram Bot
- [ ] Open Telegram and search for @BotFather
- [ ] Send `/newbot` command
- [ ] Follow instructions to create your bot
- [ ] Copy the bot token (format: `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`)
- [ ] Get your Telegram User ID by messaging @userinfobot

### 2. Get Groq API Key
- [ ] Go to https://console.groq.com
- [ ] Sign up or log in
- [ ] Navigate to API Keys section
- [ ] Create new API key
- [ ] Copy the key (starts with `gsk_`)

### 3. Create GitHub Personal Access Token
- [ ] Go to https://github.com/settings/tokens
- [ ] Click "Generate new token (classic)"
- [ ] Select scopes:
  - [x] `repo` (Full control of private repositories)
  - [x] `workflow` (Update GitHub Action workflows)
- [ ] Generate and copy the token (starts with `ghp_`)

### 4. Prepare Repository
- [ ] Create or select target repository for agent operations
- [ ] Note the repository owner (username/organization)
- [ ] Note the repository name

## Railway Deployment

### 1. Push to GitHub
```bash
git init
git add .
git commit -m "Initial commit: Autonomous CI/CD Agent"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```

### 2. Deploy to Railway
- [ ] Go to https://railway.app/dashboard
- [ ] Click "New Project"
- [ ] Select "Deploy from GitHub repo"
- [ ] Authorize Railway to access your GitHub
- [ ] Select your repository
- [ ] Wait for initial deployment (will fail - expected)

### 3. Configure Environment Variables

In Railway project settings, add these variables:

```bash
# Required - Telegram Configuration
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz
AUTHORIZED_USER_ID=123456789

# Required - AI Configuration
GROQ_API_KEY=gsk_your_groq_api_key_here

# Required - GitHub Configuration
GITHUB_TOKEN=ghp_your_github_token_here
GITHUB_REPO_OWNER=your_username
GITHUB_REPO_NAME=your_repo_name

# Optional - Application Configuration
NODE_ENV=production
PORT=3000
DATABASE_PATH=./data/sessions.db
SESSION_PRUNE_DAYS=30
MAX_RETRY_COUNT=10
COMMAND_TIMEOUT_MS=300000
SANDBOX_WORKSPACE=./sandbox-workspace
LOG_LEVEL=info
```

### 4. Redeploy
- [ ] Click "Deploy" in Railway dashboard
- [ ] Wait for deployment to complete
- [ ] Check logs for successful startup

## Post-Deployment

### 1. Verify Deployment
- [ ] Check Railway logs show: "Application started successfully"
- [ ] Check logs show: "Telegram bot started successfully"
- [ ] Verify health endpoint: `https://your-app.railway.app/health`

### 2. Test Bot
- [ ] Open Telegram and find your bot
- [ ] Send `/start` command
- [ ] Verify you receive welcome message
- [ ] Send `/help` for command list

### 3. Test Basic Functionality

#### Test 1: Status Check
```
/status
```
Expected: Returns current workflow status or "No workflow runs found"

#### Test 2: Simple Task
```
/task Create a simple hello world function in a new file called hello.js
```
Expected: Agent executes 5-phase loop and creates file

#### Test 3: PR Review (if you have PRs)
```
/review_pr 1
```
Expected: Returns security and quality analysis

### 4. Monitor Logs
- [ ] Watch Railway logs for errors
- [ ] Check for memory usage (should stay under 1GB)
- [ ] Verify database initialization
- [ ] Confirm sandbox workspace creation

## Troubleshooting

### Bot Doesn't Respond
1. Check `TELEGRAM_BOT_TOKEN` is correct
2. Verify `AUTHORIZED_USER_ID` matches your ID
3. Check Railway logs for authentication errors
4. Ensure bot is running (check Railway dashboard)

### Authentication Failed
1. Get your Telegram User ID from @userinfobot
2. Update `AUTHORIZED_USER_ID` in Railway
3. Redeploy application

### Agent Fails on Tasks
1. Verify `GROQ_API_KEY` is valid
2. Check `GITHUB_TOKEN` has correct permissions
3. Ensure `GITHUB_REPO_OWNER` and `GITHUB_REPO_NAME` are correct
4. Review logs for specific error messages

### Out of Memory Errors
1. Check Railway usage dashboard
2. Reduce `MAX_RETRY_COUNT` to 5
3. Reduce `SESSION_PRUNE_DAYS` to 7
4. Monitor logs for memory-intensive operations

## Security Checklist

- [ ] `AUTHORIZED_USER_ID` is set to YOUR Telegram ID only
- [ ] GitHub token has minimal required permissions
- [ ] `.env` file is in `.gitignore`
- [ ] Environment variables are set in Railway (not in code)
- [ ] Bot token is kept private
- [ ] Regular monitoring of Railway logs

## Maintenance

### Daily
- [ ] Check Railway logs for errors
- [ ] Monitor memory usage

### Weekly
- [ ] Review agent task success rate
- [ ] Check database size
- [ ] Verify no security issues in logs

### Monthly
- [ ] Review and prune old sessions
- [ ] Update dependencies if needed
- [ ] Rotate API keys if required
- [ ] Check Railway billing

## Support

If you encounter issues:

1. Check Railway logs: `railway logs`
2. Review troubleshooting section in README.md
3. Check GitHub Issues for similar problems
4. Create new issue with:
   - Error message
   - Railway logs (redact sensitive info)
   - Steps to reproduce

---

## Success Criteria

Your deployment is successful when:

✅ Bot responds to `/start` command
✅ Agent can execute simple tasks
✅ Tests run successfully
✅ Commits are created and pushed
✅ PR reviews work correctly
✅ No memory errors in logs
✅ Health endpoint returns 200 OK

Congratulations! Your Autonomous CI/CD Agent is now live! 🎉
