# Railway Environment Variables Setup

## 🚨 DEPLOYMENT CRASHED - MISSING ENVIRONMENT VARIABLES

Your build **succeeded** (Python/GCC fix worked!), but the app is **crashing at runtime** because required environment variables are not configured in Railway.

---

## ✅ **How to Fix (5 minutes)**

### Step 1: Go to Railway Dashboard
1. Open your Railway project
2. Click on your service
3. Go to **"Variables"** tab

### Step 2: Add Required Environment Variables

**MINIMUM REQUIRED (to stop crashes):**

```bash
# Telegram Bot (REQUIRED)
TELEGRAM_BOT_TOKEN=your_actual_telegram_bot_token_from_botfather
AUTHORIZED_USER_ID=your_telegram_user_id_number

# Groq AI (REQUIRED)
GROQ_API_KEY=your_groq_api_key

# GitHub (REQUIRED)
GITHUB_TOKEN=your_github_personal_access_token
GITHUB_REPO_OWNER=johnadekola676-page
GITHUB_REPO_NAME=IDK

# Basic Config (REQUIRED)
NODE_ENV=production
PORT=3000
```

### Step 3: Add Optional but Recommended Variables

```bash
# Database
DATABASE_PATH=./data/sessions.db
SESSION_PRUNE_DAYS=30

# Sandbox
SANDBOX_WORKSPACE=./sandbox-workspace
COMMAND_TIMEOUT_MS=300000

# Logging
LOG_LEVEL=info

# V2 Features (Optional - have defaults)
TOKEN_INPUT_LIMIT=6000
TOKEN_OUTPUT_LIMIT=2000
HANDOFF_TOKEN_THRESHOLD=0.8
HANDOFF_RETRY_THRESHOLD=5
OBSIDIAN_VAULT_PATH=./obsidian-vault
ENABLE_SUB_AGENTS=true
ERROR_LEARNING_ENABLED=true
CLAUDE_MD_ENFORCE=true
```

### Step 4: Redeploy
Railway will automatically redeploy after you add variables (or click "Deploy" button).

---

## 📋 **How to Get the Required Tokens**

### 1. TELEGRAM_BOT_TOKEN
1. Open Telegram and search for **@BotFather**
2. Send `/newbot` command
3. Follow prompts to create your bot
4. Copy the token (looks like: `123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11`)

### 2. AUTHORIZED_USER_ID
1. Open Telegram and search for **@userinfobot**
2. Send `/start` command
3. Copy your User ID (looks like: `123456789`)

### 3. GROQ_API_KEY
1. Go to https://console.groq.com
2. Sign up/login
3. Go to API Keys section
4. Create new API key
5. Copy the key (starts with `gsk_...`)

### 4. GITHUB_TOKEN
1. Go to https://github.com/settings/tokens
2. Click "Generate new token (classic)"
3. Select scopes:
   - `repo` (full repository access)
   - `workflow` (update GitHub Actions)
4. Generate and copy token (starts with `ghp_...`)

---

## 🔍 **Why It's Crashing**

The `server.js` file has this validation at startup (line 22-28):

```javascript
const envValidation = validateEnvironment();

if (!envValidation.valid) {
  logger.error('Environment validation failed', { errors: envValidation.errors });
  throw new Error(`Environment validation failed: ${envValidation.errors.join(', ')}`);
}
```

**Without the environment variables, this check fails and crashes the app.**

---

## ✅ **After Adding Variables**

You should see in Railway logs:

```
[INFO] Starting Autonomous CI/CD Agent
[INFO] Environment validation passed
[INFO] V2 database migration completed
[INFO] Telegram bot started successfully
[INFO] Health check server listening on port 3000
```

Then your bot will be live and respond to Telegram messages!

---

## 🎯 **Quick Checklist**

- [ ] Add TELEGRAM_BOT_TOKEN to Railway
- [ ] Add AUTHORIZED_USER_ID to Railway
- [ ] Add GROQ_API_KEY to Railway
- [ ] Add GITHUB_TOKEN to Railway
- [ ] Add GITHUB_REPO_OWNER to Railway
- [ ] Add GITHUB_REPO_NAME to Railway
- [ ] Set NODE_ENV=production
- [ ] Set PORT=3000
- [ ] Click "Deploy" or wait for auto-redeploy
- [ ] Check logs for "Telegram bot started successfully"

---

## 🔐 **Security Note**

These environment variables are **NOT in your codebase** (that's good!). They must be added through Railway's secure variable system. Never commit these values to git.

---

Once you add these variables, Railway will redeploy and your bot should start successfully! 🚀
