# 🚂 Railway Deployment Setup Guide

## ⚠️ CRITICAL: Why Your Deployment is Failing

Your Railway deployment is **building successfully** but **failing health checks** because:

1. ❌ **Missing Environment Variables** - The app requires API keys to start
2. ❌ **Environment Validation Fails** - Server crashes before health endpoint responds
3. ❌ **Health Check Can't Reach** `/api/health` - App never finishes starting

**Screenshot shows:** Build succeeds → App crashes → Health check fails → Railway marks as unhealthy

---

## 🔧 SOLUTION: Add Environment Variables to Railway

### Step 1: Open Railway Project Settings

1. Go to https://railway.app
2. Click on your `IDK` project
3. Click on the service (should show "Active" but failing health checks)
4. Click on the **"Variables"** tab

### Step 2: Add Required Environment Variables

Add these **CRITICAL** variables (app won't start without them):

```bash
# === REQUIRED FOR APP TO START ===

# Telegram Bot
TELEGRAM_BOT_TOKEN=<your_bot_token_from_@BotFather>
AUTHORIZED_USER_ID=<your_telegram_user_id>

# At least ONE LLM provider (Groq recommended - FREE)
GROQ_API_KEY=<your_groq_api_key>

# GitHub Integration
GITHUB_TOKEN=<your_github_token>
GITHUB_OWNER=johnadekola676-page
GITHUB_REPO=IDK

# Environment
NODE_ENV=production
```

### Step 3: Add Optional (But Recommended) Variables

```bash
# === OPTIONAL BUT RECOMMENDED ===

# Additional LLM Providers (for fallback)
ANTHROPIC_API_KEY=<your_anthropic_key>  # Optional
GOOGLE_GEMINI_API_KEY=<your_gemini_key>  # Optional

# LLM Configuration
LLM_PROVIDER_PRIORITY=groq,anthropic,gemini
LLM_AUTO_FALLBACK=true
LLM_USE_INTELLIGENT_ROUTING=true

# Deployment Settings
AUTO_FEATURE_BRANCH=true
SKIP_DEPLOY_VALIDATION=false

# Error Resolution
AUTO_ERROR_RESOLUTION=true
ERROR_RESOLUTION_MAX_RETRIES=5
```

### Step 4: Redeploy

After adding variables:
1. Railway will **automatically redeploy**
2. Wait for the build to complete (~5-7 minutes)
3. Health check should now **pass** ✅
4. Your app will be live at the Railway URL

---

## 🔑 WHERE TO GET API KEYS

### 1. TELEGRAM_BOT_TOKEN

**Required:** YES (app won't start without it)

**How to get:**
1. Open Telegram
2. Search for `@BotFather`
3. Send `/newbot`
4. Follow prompts to name your bot
5. Copy the token (format: `1234567890:ABCdefGHIjklMNOpqrs`)

**Add to Railway:**
```
Variable: TELEGRAM_BOT_TOKEN
Value: 1234567890:ABCdefGHIjklMNOpqrsTUVwxyz
```

---

### 2. AUTHORIZED_USER_ID

**Required:** YES

**How to get:**

**Method A (Easy):**
1. Search for `@userinfobot` on Telegram
2. Send it any message
3. It replies with your ID (e.g., `123456789`)

**Method B (From logs):**
1. Deploy to Railway first (will fail)
2. Message your bot `/start`
3. Check Railway logs: "Unauthorized user: 123456789"
4. Use that number

**Add to Railway:**
```
Variable: AUTHORIZED_USER_ID
Value: 123456789
```

---

### 3. GROQ_API_KEY

**Required:** YES (at least one LLM provider)

**Recommended:** Use Groq - it's FREE and fast

**How to get:**
1. Go to https://console.groq.com
2. Sign up with Google/GitHub (free)
3. Click "API Keys" in sidebar
4. Click "Create API Key"
5. Copy the key (starts with `gsk_`)

**Limits (FREE tier):**
- 14,400 requests/day
- 30 requests/minute
- Perfect for development and production

**Add to Railway:**
```
Variable: GROQ_API_KEY
Value: gsk_yourKeyHere123456789abcdefg
```

---

### 4. GITHUB_TOKEN

**Required:** YES

**How to get:**
1. Go to https://github.com/settings/tokens
2. Click "Generate new token" → "Generate new token (classic)"
3. Name: `MAX Agent Railway`
4. Select scopes:
   - ✅ `repo` (Full repository access)
   - ✅ `workflow` (GitHub Actions)
   - ✅ `read:org` (Read organization)
5. Click "Generate token"
6. Copy token (starts with `ghp_` or `github_pat_`)

**Add to Railway:**
```
Variable: GITHUB_TOKEN
Value: ghp_yourTokenHere123456789
```

**Also add:**
```
Variable: GITHUB_OWNER
Value: johnadekola676-page

Variable: GITHUB_REPO
Value: IDK
```

---

### 5. ANTHROPIC_API_KEY (Optional)

**Required:** NO (but recommended for high-quality responses)

**How to get:**
1. Go to https://console.anthropic.com
2. Sign up (requires credit card)
3. Add $5 minimum credit
4. Go to "API Keys"
5. Create new key

**Cost:** ~$3 per million tokens (Claude 3.5 Sonnet)

**Add to Railway:**
```
Variable: ANTHROPIC_API_KEY
Value: sk-ant-yourKeyHere
```

---

### 6. GOOGLE_GEMINI_API_KEY (Optional)

**Required:** NO (but free and useful for large context)

**How to get:**
1. Go to https://aistudio.google.com/app/apikey
2. Sign in with Google
3. Click "Create API Key"
4. Copy key

**Limits (FREE tier):**
- 60 requests/minute
- Large context window (2M tokens)

**Add to Railway:**
```
Variable: GOOGLE_GEMINI_API_KEY
Value: AIzaSyYourKeyHere
```

---

## 📊 VERIFYING DEPLOYMENT

### After Adding Variables

1. **Check Build Logs:**
   - Railway automatically redeploys
   - Build should complete successfully
   - Look for: `✅ Application started successfully`

2. **Check Health:**
   - Go to "Deployments" tab
   - Status should be **"Active"** (green)
   - Health check should show ✅

3. **Test API:**
   - Open your Railway URL
   - You should see the web UI (React app)
   - Go to `<your-railway-url>/api/health`
   - Should return:
   ```json
   {
     "success": true,
     "status": "healthy",
     "timestamp": "2026-05-29T...",
     "telegram": "connected"
   }
   ```

4. **Test Telegram Bot:**
   - Open Telegram
   - Search for your bot
   - Send `/start`
   - Bot should respond with welcome message
   - Try: `/task "create a hello world function"`

---

## 🐛 TROUBLESHOOTING

### Build Succeeds But Health Check Fails

**Cause:** Missing environment variables

**Fix:**
1. Check Railway logs for errors
2. Look for: `Missing required environment variables:`
3. Add the missing variables
4. Wait for automatic redeploy

---

### "Telegram bot not connected" in health check

**Cause:** Invalid `TELEGRAM_BOT_TOKEN` or bot blocked

**Fix:**
1. Verify token is correct from @BotFather
2. Check Railway logs: look for "Telegram bot" errors
3. Make sure you didn't revoke the token
4. Try regenerating token with @BotFather

---

### "Unauthorized user" in logs

**Cause:** Your `AUTHORIZED_USER_ID` doesn't match

**Fix:**
1. Check logs for: "Unauthorized user: 123456789"
2. Update `AUTHORIZED_USER_ID` with that number
3. Redeploy

---

### Frontend shows "index.html missing"

**Cause:** Frontend build failed in Docker

**Fix:**
- This shouldn't happen - the Dockerfile builds frontend
- Check build logs for frontend build errors
- Usually caused by missing npm dependencies

---

## 📝 COMPLETE RAILWAY VARIABLES LIST

Here's the complete list to copy-paste into Railway Variables section:

```bash
# === CRITICAL (REQUIRED) ===
TELEGRAM_BOT_TOKEN=YOUR_BOT_TOKEN
AUTHORIZED_USER_ID=YOUR_USER_ID
GROQ_API_KEY=YOUR_GROQ_KEY
GITHUB_TOKEN=YOUR_GITHUB_TOKEN
GITHUB_OWNER=johnadekola676-page
GITHUB_REPO=IDK
NODE_ENV=production

# === OPTIONAL (RECOMMENDED) ===
ANTHROPIC_API_KEY=YOUR_ANTHROPIC_KEY
GOOGLE_GEMINI_API_KEY=YOUR_GEMINI_KEY
LLM_PROVIDER_PRIORITY=groq,anthropic,gemini
LLM_AUTO_FALLBACK=true
LLM_USE_INTELLIGENT_ROUTING=true
AUTO_FEATURE_BRANCH=true
SKIP_DEPLOY_VALIDATION=false
AUTO_ERROR_RESOLUTION=true
ERROR_RESOLUTION_MAX_RETRIES=5
```

**Replace `YOUR_*` placeholders with actual values!**

---

## ⏱️ DEPLOYMENT TIMELINE

After adding variables:

| Time | Status |
|------|--------|
| 0:00 | Variables saved → Auto-redeploy triggered |
| 0:30 | Docker build starts |
| 2:00 | Frontend building |
| 4:00 | Backend dependencies installing |
| 6:00 | Build complete → Container starting |
| 6:30 | Health check #1 (fails - app still starting) |
| 7:00 | Health check #2 (succeeds - app ready) ✅ |
| 7:00 | Deployment **ACTIVE** |

**Total time:** ~7 minutes

---

## 🎯 QUICK START CHECKLIST

- [ ] Get Telegram bot token from @BotFather
- [ ] Get your Telegram user ID from @userinfobot
- [ ] Sign up for Groq and get API key
- [ ] Create GitHub personal access token
- [ ] Open Railway project → Variables tab
- [ ] Add all 7 required variables
- [ ] Wait for automatic redeploy (~7 minutes)
- [ ] Check health: URL should show web UI
- [ ] Test bot: Send /start in Telegram
- [ ] Try: /task "create hello world"

---

## 🚀 NEXT STEPS AFTER DEPLOYMENT

Once your app is running on Railway:

1. **Test the Web UI:**
   - Open your Railway URL
   - Explore the 3-column dashboard
   - Try creating a task from the web interface

2. **Test Telegram Integration:**
   - Message your bot
   - Try commands: `/task`, `/status`, `/help`

3. **Monitor Logs:**
   - Railway Logs tab shows real-time output
   - Watch for errors or issues

4. **Set Up Local Development:**
   - Create `.env` file locally (same variables)
   - Run `npm start` locally
   - Use `max-cli.js` for CLI mode

5. **Integrate with GitHub:**
   - Bot will auto-create issues
   - Auto-create feature branches
   - Auto-commit and push changes

---

## 📚 ADDITIONAL RESOURCES

- **Main Documentation:** `README.md`
- **Architecture Guide:** `AUTONOMOUS_AGENT_ARCHITECTURE.md`
- **V2 Features:** `V2_FEATURES.md`
- **Deployment Guide:** `DEPLOYMENT-GUIDE.md`
- **Audit Report:** `COMPREHENSIVE_AUDIT_REPORT.md`
- **Harness Integration:** `docs/CLAUDE_CODE_HARNESS_INTEGRATION.md`

---

## 💡 PRO TIPS

1. **Use Groq for most tasks** - Free and fast
2. **Use Claude for complex reasoning** - Higher quality but costs money
3. **Enable auto-fallback** - System switches providers on rate limits
4. **Monitor token usage** - Check Railway logs for budget tracking
5. **Set up Obsidian vault** - Auto-documentation of all agent runs

---

**Need help?** Check Railway logs first - they show exactly what's failing!

**Still stuck?** Open a GitHub issue with logs and error messages.
