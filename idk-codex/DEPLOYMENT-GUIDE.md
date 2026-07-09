# Railway Deployment Guide

## 🎯 Current Status

**Pull Request Created**: [#4 - Fix: Resolve Docker build missing src/database directory](https://github.com/johnadekola676-page/IDK/pull/4)

**Status**: ✅ All fixes applied, ready for deployment after environment setup

**Latest Commit**: Fixed incorrect logger import paths in API files (dd6a5ef)

---

## 🔧 What Was Fixed

### Problem
Railway deployment was failing with error:
```
Cannot find module '/app/src/db/index.js' imported from /app/src/api/routes/sessions.js
```

### Root Cause
The Dockerfile's `COPY src ./src` command was not properly copying the `src/database/` directory to the container.

### Solution Applied
✅ Updated Dockerfile to explicitly copy all 13 src/ subdirectories
✅ Updated .dockerignore to only exclude runtime DB files, not source code
✅ Fixed incorrect logger import paths in API files (files.js, auth.js)
✅ Ensures `src/database/` and all source code is always included in Docker image

---

## 📋 Pre-Deployment Checklist

Before merging the PR and deploying, you MUST configure these environment variables in Railway:

### Required Environment Variables

| Variable | Value | How to Get It |
|----------|-------|---------------|
| `NODE_ENV` | `production` | Just type this value |
| `TELEGRAM_BOT_TOKEN` | `123456789:ABC...` | See section below ⬇️ |
| `GROQ_API_KEY` | `gsk_...` | See section below ⬇️ |
| `GITHUB_TOKEN` | `ghp_...` or `github_pat_...` | See section below ⬇️ |
| `JWT_SECRET` | Random 32-char string | Run: `openssl rand -base64 32` |
| `ADMIN_SECRET` | Random 32-char string | Run: `openssl rand -base64 32` |

### Optional Environment Variables

| Variable | Purpose | How to Get It |
|----------|---------|---------------|
| `ANTHROPIC_API_KEY` | Claude AI (optional) | [console.anthropic.com](https://console.anthropic.com) |
| `GOOGLE_API_KEY` | Gemini AI (optional) | [makersuite.google.com](https://makersuite.google.com/app/apikey) |

---

## 🔑 How to Get Each API Key

### 1. TELEGRAM_BOT_TOKEN

```
Step 1: Open Telegram app
Step 2: Search for @BotFather
Step 3: Send message: /newbot
Step 4: Follow prompts:
        - Bot name: "Your Bot Name" (display name)
        - Username: "your_bot_username" (must end in 'bot')
Step 5: Copy the token (format: 123456789:ABCdefGHIjklMNOpqrsTUVwxyz)
Step 6: Paste into Railway environment variables
```

**Example Token**: `6789012345:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw`

---

### 2. GROQ_API_KEY

```
Step 1: Visit https://console.groq.com
Step 2: Sign up or log in (free tier available - no credit card required)
Step 3: Navigate to "API Keys" in left sidebar
Step 4: Click "Create API Key"
Step 5: Name it: "Railway Production"
Step 6: Copy the key (starts with: gsk_...)
Step 7: Paste into Railway environment variables
```

**Example Key**: `gsk_1234567890abcdefghijklmnopqrstuvwxyz`

**Pricing**: Free tier includes 14,400 requests/day

---

### 3. GITHUB_TOKEN

```
Step 1: Visit https://github.com/settings/tokens
Step 2: Click "Generate new token" → "Generate new token (classic)"
Step 3: Fill in form:
        - Note: "Railway Bot Access"
        - Expiration: "No expiration" or choose duration

Step 4: Select scopes (IMPORTANT - check these boxes):
        ✅ repo (Full control of private repositories)
           ✅ repo:status
           ✅ repo_deployment
           ✅ public_repo
           ✅ repo:invite
           ✅ security_events
        ✅ workflow (Update GitHub Action workflows)
        ✅ read:org (Read org and team membership)

Step 5: Scroll down, click "Generate token"
Step 6: Copy immediately (you can only see it once!)
Step 7: Paste into Railway environment variables
```

**Example Token**: `ghp_1234567890abcdefghijklmnopqrstuvwxyzABCD`

**⚠️ CRITICAL**: Copy the token immediately - GitHub won't show it again!

---

### 4. JWT_SECRET & ADMIN_SECRET

These are random strings used for security. Generate them locally:

```bash
# Generate JWT_SECRET
openssl rand -base64 32

# Output example: Kj8xP2mN5qR9tV3wY6zB8cF1hL4nM7pS0uX2aD5gH8k=

# Generate ADMIN_SECRET (run command again for different value)
openssl rand -base64 32

# Output example: Q9rT2vY5xB8dG1jM4nP7sU0wZ3aC6fI9lO2qT5vX8zA=
```

**Copy each output** and add as separate variables in Railway.

**Why needed?**
- `JWT_SECRET`: Encrypts user session tokens
- `ADMIN_SECRET`: Authenticates admin API requests

---

### 5. ANTHROPIC_API_KEY (Optional)

```
Step 1: Visit https://console.anthropic.com
Step 2: Sign up or log in
Step 3: Click "Get API Keys" or navigate to API Keys section
Step 4: Click "Create Key"
Step 5: Name it: "Railway Production"
Step 6: Copy the key (starts with: sk-ant-...)
Step 7: Paste into Railway environment variables
```

**Example Key**: `sk-ant-api03-1234567890abcdefghijklmnopqrstuvwxyz`

**Cost**: Claude API is paid (credits required)

---

### 6. GOOGLE_API_KEY (Optional)

```
Step 1: Visit https://makersuite.google.com/app/apikey
Step 2: Sign in with Google account
Step 3: Click "Create API Key"
Step 4: Select existing project or create new one
Step 5: Copy the key
Step 6: Paste into Railway environment variables
```

**Example Key**: `AIzaSyAbCdEfGhIjKlMnOpQrStUvWxYz1234567`

**Pricing**: Gemini has generous free tier

---

## 🚀 Deployment Steps

### Step 1: Configure Railway Environment Variables

```
1. Go to Railway dashboard: https://railway.app
2. Select your project: "telegram-agent" (or whatever you named it)
3. Click on your service
4. Click "Variables" tab
5. Click "+ New Variable" for each required variable
6. Paste the variable name and value
7. Click "Add" after each variable
```

**Required Variables to Add**:
- `NODE_ENV` = `production`
- `TELEGRAM_BOT_TOKEN` = (from @BotFather)
- `GROQ_API_KEY` = (from console.groq.com)
- `GITHUB_TOKEN` = (from github.com/settings/tokens)
- `JWT_SECRET` = (from openssl command)
- `ADMIN_SECRET` = (from openssl command)

**Screenshot Checklist**:
- [ ] All 6 required variables visible in Railway
- [ ] No typos in variable names (case-sensitive!)
- [ ] No trailing spaces in values
- [ ] Values match the tokens you generated

---

### Step 2: Merge the Pull Request

```
1. Go to: https://github.com/johnadekola676-page/IDK/pull/4
2. Review the changes (Dockerfile and .dockerignore)
3. Click "Merge pull request"
4. Click "Confirm merge"
5. Optionally: Delete the branch after merge
```

**What happens after merge?**
- Railway detects the new commit on `main` branch
- Automatically triggers a new deployment
- Builds Docker image with the fixed Dockerfile
- Deploys the container

---

### Step 3: Monitor Deployment

```
1. Go to Railway dashboard
2. Click "Deployments" tab
3. Watch the latest deployment
4. Wait for status to change:
   - "Building" → "Deploying" → "Success" ✅
```

**Expected Build Time**: 2-5 minutes

**Watch for these log messages**:
```
✅ "Successfully built"
✅ "Pushing to registry"
✅ "Deployment successful"
✅ "🚀 Initializing Interface Router"
✅ "✅ Application started successfully"
```

**❌ If you see errors**, check:
- Environment variables are set correctly
- All required variables are present
- No typos in variable names
- Dockerfile changes were merged

---

### Step 4: Verify Deployment

#### Test 1: Health Check
```bash
curl https://your-app-url.railway.app/health
```

**Expected Response**:
```json
{
  "status": "healthy",
  "timestamp": "2026-05-28T12:00:00.000Z"
}
```

#### Test 2: Telegram Bot
```
1. Open Telegram
2. Search for your bot username
3. Send: /start
4. Bot should respond
```

#### Test 3: Web Interface
```
1. Visit: https://your-app-url.railway.app
2. Should see the web UI
3. No 404 or 500 errors
```

---

## 🏗️ Architecture Overview

### You DO NOT need separate services

Your current setup is **CORRECT** - single service architecture:

```
┌─────────────────────────────────────────┐
│     Railway Service: telegram-agent     │
│  ┌───────────────────────────────────┐ │
│  │     Docker Container (Port $PORT)  │ │
│  │  ┌─────────────┐  ┌─────────────┐ │ │
│  │  │   Backend   │  │  Frontend   │ │ │
│  │  │  (Node.js)  │◄─┤   (Static)  │ │ │
│  │  │  Express    │  │    React    │ │ │
│  │  │  + SQLite   │  │   (built)   │ │ │
│  │  └─────────────┘  └─────────────┘ │ │
│  └───────────────────────────────────┘ │
└─────────────────────────────────────────┘
         ▲
         │ Telegram Bot API
         │ + Web Traffic
```

**How it works**:
1. Dockerfile builds frontend → `frontend/dist/`
2. Dockerfile installs backend dependencies
3. Final image combines both
4. Express serves frontend static files
5. Express also serves API routes
6. Single port serves everything

**No action needed** - this is already configured correctly in your Dockerfile.

---

## 🐛 Troubleshooting

### Deployment Still Failing After Fix?

#### Error: "Cannot find module '/app/src/database/...'"

**Check**:
```
1. Verify PR was merged to main branch
2. Railway is deploying from main branch (not the PR branch)
3. Check Railway logs for "COPY src/database ./src/database"
```

**Fix**:
```bash
# Ensure you're on main branch with latest changes
git checkout main
git pull origin main

# Verify Dockerfile has explicit COPY commands
cat Dockerfile | grep "COPY src/"
```

---

#### Error: "Missing environment variable: TELEGRAM_BOT_TOKEN"

**Check**:
```
1. Railway dashboard → Variables
2. Verify variable name is exactly: TELEGRAM_BOT_TOKEN (case-sensitive)
3. No typos, no extra spaces
4. Value is the token from @BotFather
```

**Fix**:
```
Delete the variable and re-add it carefully:
- Click X to delete
- Click "+ New Variable"
- Type: TELEGRAM_BOT_TOKEN
- Paste token value
- Click Add
```

---

#### Error: "Database file is locked" or "SQLITE_BUSY"

**Cause**: Multiple instances trying to access same database file

**Fix**: Railway should only run 1 instance (default)
```
Railway Dashboard → Settings → Replicas: 1
```

---

#### Container Crashes Immediately After Starting

**Check Railway Logs**:
```
1. Click on failed deployment
2. View logs tab
3. Look for specific error message
4. Common issues:
   - Missing environment variable
   - Database initialization failed
   - Port binding error
```

**Fix**: Based on error message
- Missing var → Add to Railway variables
- DB init failed → Check if init-db.js is in image
- Port error → Railway sets $PORT automatically, don't hardcode

---

#### Frontend Shows 404 or Doesn't Load

**Check**:
```
1. Verify frontend was built in Docker
2. Check logs for: "npm run build" in frontend-builder stage
3. Verify COPY --from=frontend-builder line exists
```

**Test**:
```bash
# Check if frontend files exist in container
# (Add this temporarily to Dockerfile after COPY commands)
RUN ls -la /app/frontend/dist/

# Should show: index.html, assets/, etc.
```

---

## 📊 Post-Deployment Monitoring

### Railway Dashboard

**Metrics to watch**:
- CPU usage (should be < 50% normally)
- Memory usage (should be < 512MB)
- Request count
- Error rate (should be 0%)

### Logs

**Access logs**:
```
Railway Dashboard → Deployments → [Latest] → Logs
```

**Key log messages**:
```
✅ "Application started successfully"
✅ "Telegram bot connected"
✅ "Database initialized"
❌ "Uncaught exception" (needs investigation)
❌ "ECONNREFUSED" (API connection issue)
```

### Set Up Alerts (Optional)

```
Railway Dashboard → Settings → Notifications
- Enable: Deployment failure alerts
- Enable: Health check failure alerts
```

---

## 🎉 Success Checklist

Once deployed successfully, verify:

- [ ] Railway shows "Deployment: Active"
- [ ] Health endpoint returns 200 OK
- [ ] Telegram bot responds to /start
- [ ] Web UI loads at Railway URL
- [ ] No errors in Railway logs
- [ ] Database initialized (check logs for "Database initialized")
- [ ] All API endpoints responding (test a few)
- [ ] Bot can receive and process commands
- [ ] Frontend can communicate with backend

---

## 📞 Need Help?

### Common Questions

**Q: Do I need to set PORT variable?**
A: No! Railway automatically sets $PORT. Your app reads it with `process.env.PORT`.

**Q: Can I change the bot token later?**
A: Yes! Update in Railway → Variables → Edit TELEGRAM_BOT_TOKEN → Redeploy

**Q: How do I see database contents?**
A: The database is inside the container. To inspect:
1. Use the API endpoints (e.g., GET /api/sessions)
2. Or add a database viewer route (in development only)

**Q: Can I run this locally?**
A: Yes! Copy environment variables to a `.env` file and run `npm start`

**Q: What if I want to use a different database?**
A: This app uses SQLite (file-based). To use PostgreSQL:
1. Add Railway PostgreSQL service
2. Update database connection in `src/database/db.js`
3. Migrate schema from SQLite to PostgreSQL syntax

---

## 🔐 Security Best Practices

- ✅ Never commit .env files (already in .gitignore)
- ✅ Use Railway's built-in secret storage
- ✅ Rotate API keys periodically
- ✅ GitHub token: Use minimum required scopes
- ✅ Set token expiration dates where possible
- ✅ Monitor Railway logs for suspicious activity
- ✅ Don't share your bot token publicly

---

## 📚 Additional Resources

- [Railway Documentation](https://docs.railway.app/)
- [Telegram Bot API](https://core.telegram.org/bots/api)
- [Groq API Docs](https://console.groq.com/docs)
- [GitHub Token Scopes](https://docs.github.com/en/developers/apps/scopes-for-oauth-apps)
- [Express.js Guide](https://expressjs.com/en/guide/routing.html)

---

## 📝 Summary

**What you need to do NOW**:

1. ✅ **Fix Applied** - Dockerfile updated (PR #4)
2. 🔑 **Get API Keys**:
   - Telegram: @BotFather
   - Groq: console.groq.com
   - GitHub: github.com/settings/tokens
   - Secrets: `openssl rand -base64 32` (run twice)
3. ⚙️ **Configure Railway**:
   - Add all 6 required environment variables
4. 🚀 **Deploy**:
   - Merge PR #4
   - Wait for Railway auto-deploy
   - Monitor logs for success
5. ✅ **Verify**:
   - Test health endpoint
   - Test Telegram bot
   - Test web interface

**Timeline**: 15-30 minutes to complete all steps

---

Generated: 2026-05-28
PR: [#4](https://github.com/johnadekola676-page/IDK/pull/4)
Status: Ready for deployment after environment setup
