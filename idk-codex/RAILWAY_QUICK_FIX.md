# 🚨 RAILWAY IS CRASHING - HERE'S THE 2-MINUTE FIX

## Why It's Crashing

Your app **intentionally crashes** when environment variables are missing (for security).

The code validates these 5 required variables at startup (see `src/security/sandbox.js` lines 191-203):

```javascript
const requiredVars = [
  'TELEGRAM_BOT_TOKEN',    // ❌ MISSING
  'GROQ_API_KEY',          // ❌ MISSING
  'GITHUB_TOKEN',          // ❌ MISSING
  'GITHUB_REPO_OWNER',     // ❌ MISSING
  'GITHUB_REPO_NAME',      // ❌ MISSING
];

if (!process.env[varName]) {
  throw new Error(`Missing required environment variable: ${varName}`);
}
```

---

## ✅ 2-Minute Fix

### Step 1: Open Railway Dashboard
Go to: https://railway.app

### Step 2: Click Your Project
Click on "IDK" project

### Step 3: Click "Variables" Tab
On the left sidebar, click **"Variables"**

### Step 4: Add These 5 Variables

Click **"+ New Variable"** and add each one:

```
Variable Name          | Value
-----------------------|--------------------------------
TELEGRAM_BOT_TOKEN     | (your bot token - starts with a number)
GROQ_API_KEY           | (your Groq key - starts with gsk_)
GITHUB_TOKEN           | (your GitHub token - starts with ghp_)
GITHUB_REPO_OWNER      | johnadekola676-page
GITHUB_REPO_NAME       | IDK
```

### Step 5: Click "Deploy"
Railway will automatically redeploy (takes ~30 seconds since image is cached)

---

## 📋 How to Get Tokens (If You Don't Have Them)

### 1. TELEGRAM_BOT_TOKEN
```
1. Open Telegram
2. Search for: @BotFather
3. Send: /newbot
4. Follow prompts
5. Copy token (looks like: 123456789:ABCdef...)
```

### 2. GROQ_API_KEY
```
1. Go to: https://console.groq.com
2. Sign up/Login
3. Go to API Keys
4. Create new key
5. Copy key (starts with: gsk_...)
```

### 3. GITHUB_TOKEN
```
1. Go to: https://github.com/settings/tokens
2. Click "Generate new token (classic)"
3. Select scopes: repo, workflow
4. Generate token
5. Copy token (starts with: ghp_...)
```

---

## ⚡ After Adding Variables

Railway will redeploy in ~30 seconds.

You'll see in logs:
```
✅ Environment validation passed
✅ V2 database migration completed
✅ Telegram bot started successfully
✅ Health check server listening on port 3000
```

Then your bot will be LIVE! 🎉

---

## 💡 Why Image Size is 549MB

The base Nixpacks Ubuntu image is large (~300MB), plus:
- Node.js 22 (~150MB)
- Python3 + GCC + build tools (~50MB)
- Your app + dependencies (~50MB)

This is normal for Nix-based builds. The app works fine - you just need the environment variables!

---

## 🔐 Security Note

These environment variables are stored securely in Railway and injected at runtime. They're never in your code or Docker image.
