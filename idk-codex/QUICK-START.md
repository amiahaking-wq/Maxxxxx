# 🚀 Quick Start - Railway Deployment

**Goal**: Get your Telegram bot deployed to Railway in 30 minutes

---

## ✅ What's Already Done

- ✅ Code is ready
- ✅ Dockerfile is fixed (PR #4)
- ✅ Docker build issue resolved
- ✅ Architecture is correct (single service)

---

## 🎯 What You Need to Do

Only **3 main steps** to deploy:

```
1. Get API Keys (15 min)
2. Configure Railway (5 min)
3. Merge & Deploy (10 min)
```

---

## Step 1: Get API Keys (15 minutes)

### 1.1 Telegram Bot Token (3 min)
```
□ Open Telegram
□ Search: @BotFather
□ Send: /newbot
□ Follow prompts
□ Copy token → Save somewhere safe
```
**Result**: Token like `123456789:ABCdefGHI...`

---

### 1.2 Groq API Key (3 min)
```
□ Visit: console.groq.com
□ Sign up (free, no card needed)
□ Click: "API Keys"
□ Click: "Create API Key"
□ Copy key → Save somewhere safe
```
**Result**: Key like `gsk_abc123...`

---

### 1.3 GitHub Personal Access Token (5 min)
```
□ Visit: github.com/settings/tokens
□ Click: "Generate new token (classic)"
□ Name: "Railway Bot"
□ Check boxes:
  ✅ repo (all)
  ✅ workflow
  ✅ read:org
□ Click: "Generate token"
□ Copy IMMEDIATELY → Save somewhere safe
```
**Result**: Token like `ghp_abc123...`

⚠️ **CRITICAL**: You can only see this token ONCE!

---

### 1.4 Generate Secrets (2 min)

Open your terminal and run:

```bash
# Generate JWT_SECRET
openssl rand -base64 32
```
**Copy the output** → Save as `JWT_SECRET`

```bash
# Generate ADMIN_SECRET (run again for different value)
openssl rand -base64 32
```
**Copy the output** → Save as `ADMIN_SECRET`

**Result**: Two different random strings

---

### 1.5 Checklist
```
□ TELEGRAM_BOT_TOKEN saved
□ GROQ_API_KEY saved
□ GITHUB_TOKEN saved (with correct scopes!)
□ JWT_SECRET saved
□ ADMIN_SECRET saved (different from JWT_SECRET!)
```

---

## Step 2: Configure Railway (5 minutes)

### 2.1 Navigate to Variables
```
□ Go to: railway.app
□ Click: Your project
□ Click: Your service
□ Click: "Variables" tab
```

---

### 2.2 Add Each Variable

Click **"+ New Variable"** and add:

| # | Variable Name | Value |
|---|---------------|-------|
| 1 | `NODE_ENV` | `production` |
| 2 | `TELEGRAM_BOT_TOKEN` | (paste from Step 1.1) |
| 3 | `GROQ_API_KEY` | (paste from Step 1.2) |
| 4 | `GITHUB_TOKEN` | (paste from Step 1.3) |
| 5 | `JWT_SECRET` | (paste from Step 1.4) |
| 6 | `ADMIN_SECRET` | (paste from Step 1.4) |

**For each variable**:
```
□ Click "+ New Variable"
□ Type variable name (exact match, case-sensitive!)
□ Paste value (no quotes, no spaces)
□ Press Enter or click Add
```

---

### 2.3 Verify
```
□ All 6 variables visible in Railway
□ No typos in names
□ No extra spaces in values
□ Values match what you saved in Step 1
```

---

## Step 3: Merge & Deploy (10 minutes)

### 3.1 Merge the Fix
```
□ Go to: github.com/johnadekola676-page/IDK/pull/4
□ Review changes (Dockerfile + .dockerignore)
□ Click: "Merge pull request"
□ Click: "Confirm merge"
```

**What happens**: Railway detects the merge and starts deploying automatically

---

### 3.2 Monitor Deployment
```
□ Go to Railway dashboard
□ Click: "Deployments" tab
□ Watch the deployment progress
□ Wait for: Building → Deploying → Active ✅
```

**Expected time**: 3-5 minutes

---

### 3.3 Check Logs

Look for these success messages:
```
✅ "Successfully built"
✅ "Deployment successful"
✅ "🚀 Initializing Interface Router"
✅ "✅ Application started successfully"
```

**If you see errors**:
- Check environment variables are correct
- Verify all 6 required variables are present
- Check for typos in variable names

---

### 3.4 Test Deployment

**Test 1**: Health Check
```bash
curl https://your-app.railway.app/health
```
Expected: `{"status":"healthy",...}`

**Test 2**: Telegram Bot
```
□ Open Telegram
□ Search for your bot
□ Send: /start
□ Bot should respond
```

**Test 3**: Web Interface
```
□ Visit: https://your-app.railway.app
□ Should see web UI
□ No errors
```

---

## 🎉 Success Checklist

You're done when:
```
□ Railway shows "Active" deployment
□ Health endpoint returns 200 OK
□ Telegram bot responds to /start
□ Web UI loads in browser
□ No errors in Railway logs
```

---

## 🐛 Troubleshooting

### Deployment Failed?

**Check 1**: Environment Variables
```
Railway → Variables → Verify all 6 present
```

**Check 2**: Deployment Logs
```
Railway → Deployments → [Latest] → Logs
Look for specific error message
```

**Check 3**: PR Merged?
```
GitHub → Pull Requests → #4 should be "Merged"
```

---

### Common Errors

**Error**: "Missing environment variable"
```
Fix: Add the missing variable in Railway → Variables
```

**Error**: "Cannot find module '/app/src/database/...'"
```
Fix: Ensure PR #4 is merged to main branch
Check Railway is deploying from main (not PR branch)
```

**Error**: "Unauthorized" or "Invalid token"
```
Fix: Double-check your API keys are correct
- Telegram: Test with curl or Telegram app
- Groq: Log in to console.groq.com to verify
- GitHub: Check token hasn't expired
```

---

## 📚 Reference Documents

For detailed information, see:

- **DEPLOYMENT-GUIDE.md** - Complete deployment documentation
- **ENV-SETUP.md** - Environment variables reference
- **PR #4** - The Dockerfile fix

---

## 🆘 Still Stuck?

### Quick Diagnostics

Run this checklist:

```
□ PR #4 merged? → github.com/johnadekola676-page/IDK/pull/4
□ Railway deploying from 'main' branch?
□ All 6 environment variables set in Railway?
□ No typos in variable names? (case-sensitive!)
□ Tokens are valid and not expired?
□ Railway logs show specific error?
```

### Get Help

1. **Check Railway logs** for specific error message
2. **Review DEPLOYMENT-GUIDE.md** for detailed troubleshooting
3. **Verify environment variables** match exactly (case-sensitive)
4. **Test API keys locally** before deploying

---

## ⏱️ Timeline

**Estimated total time**: 30 minutes

- Step 1 (Get API Keys): 15 min
- Step 2 (Configure Railway): 5 min
- Step 3 (Merge & Deploy): 10 min

**Actual deployment time**: 3-5 minutes (automated)

---

## 🎯 Your Current Position

```
✅ Code ready
✅ Dockerfile fixed
✅ PR created (#4)
⏳ Need to: Get API keys
⏳ Need to: Configure Railway
⏳ Need to: Merge PR
⏳ Need to: Deploy
```

**Next action**: Start with Step 1.1 (Telegram Bot Token)

---

**Created**: 2026-05-28
**Status**: Ready for deployment
**PR**: #4 - Fix Docker build
