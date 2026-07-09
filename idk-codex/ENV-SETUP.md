# Environment Variables Quick Setup Guide

## 🎯 Copy-Paste Template for Railway

Use this checklist to configure your Railway environment variables. Copy each variable name exactly as shown (case-sensitive!).

---

## Required Variables (6 Total)

### 1. NODE_ENV
```
Variable Name: NODE_ENV
Value: production
```
✅ Just type `production`

---

### 2. TELEGRAM_BOT_TOKEN
```
Variable Name: TELEGRAM_BOT_TOKEN
Value: [GET FROM @BotFather]
```

**How to get**:
1. Open Telegram
2. Message @BotFather
3. Send: `/newbot`
4. Follow prompts
5. Copy token (looks like: `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`)

**Example**: `6789012345:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw`

---

### 3. GROQ_API_KEY
```
Variable Name: GROQ_API_KEY
Value: [GET FROM console.groq.com]
```

**How to get**:
1. Visit: https://console.groq.com
2. Sign up (free, no credit card)
3. Go to "API Keys"
4. Click "Create API Key"
5. Copy key (starts with: `gsk_`)

**Example**: `gsk_1234567890abcdefghijklmnopqrstuvwxyz`

**Free Tier**: 14,400 requests/day ✅

---

### 4. GITHUB_TOKEN
```
Variable Name: GITHUB_TOKEN
Value: [GET FROM github.com/settings/tokens]
```

**How to get**:
1. Visit: https://github.com/settings/tokens
2. Click "Generate new token (classic)"
3. Name: `Railway Bot Access`
4. **Select scopes**:
   - ✅ `repo` (all sub-items)
   - ✅ `workflow`
   - ✅ `read:org`
5. Click "Generate token"
6. **Copy immediately** (you can't see it again!)

**Example**: `ghp_1234567890abcdefghijklmnopqrstuvwxyzABCD`

⚠️ **IMPORTANT**: Token must have `repo`, `workflow`, and `read:org` scopes!

---

### 5. JWT_SECRET
```
Variable Name: JWT_SECRET
Value: [GENERATE WITH COMMAND BELOW]
```

**How to generate**:
```bash
openssl rand -base64 32
```

**Copy the output** (looks like: `Kj8xP2mN5qR9tV3wY6zB8cF1hL4nM7pS0uX2aD5gH8k=`)

**Example**: `Kj8xP2mN5qR9tV3wY6zB8cF1hL4nM7pS0uX2aD5gH8k=`

💡 **Don't have OpenSSL?** Use an online generator: https://randomkeygen.com/ (choose "CodeIgniter Encryption Keys")

---

### 6. ADMIN_SECRET
```
Variable Name: ADMIN_SECRET
Value: [GENERATE WITH COMMAND BELOW - DIFFERENT FROM JWT_SECRET]
```

**How to generate**:
```bash
openssl rand -base64 32
```

**Copy the output** (must be **different** from JWT_SECRET!)

**Example**: `Q9rT2vY5xB8dG1jM4nP7sU0wZ3aC6fI9lO2qT5vX8zA=`

⚠️ **Make sure it's different** from JWT_SECRET - run the command again!

---

## Optional Variables (2 Total)

### 7. ANTHROPIC_API_KEY (Optional)
```
Variable Name: ANTHROPIC_API_KEY
Value: [GET FROM console.anthropic.com]
```

**Only add if you want to use Claude AI**

**How to get**:
1. Visit: https://console.anthropic.com
2. Sign up
3. Go to "API Keys"
4. Click "Create Key"
5. Copy key (starts with: `sk-ant-`)

**Example**: `sk-ant-api03-1234567890abcdefghijklmnopqrstuvwxyz`

💰 **Cost**: Paid API (requires credits)

---

### 8. GOOGLE_API_KEY (Optional)
```
Variable Name: GOOGLE_API_KEY
Value: [GET FROM makersuite.google.com]
```

**Only add if you want to use Gemini AI**

**How to get**:
1. Visit: https://makersuite.google.com/app/apikey
2. Sign in with Google
3. Click "Create API Key"
4. Select or create project
5. Copy key

**Example**: `AIzaSyAbCdEfGhIjKlMnOpQrStUvWxYz1234567`

✅ **Free Tier Available**

---

## 📋 Railway Setup Checklist

Use this checklist as you add each variable:

- [ ] `NODE_ENV` = `production`
- [ ] `TELEGRAM_BOT_TOKEN` = (from @BotFather)
- [ ] `GROQ_API_KEY` = (from console.groq.com)
- [ ] `GITHUB_TOKEN` = (from github.com/settings/tokens with correct scopes)
- [ ] `JWT_SECRET` = (from `openssl rand -base64 32`)
- [ ] `ADMIN_SECRET` = (from `openssl rand -base64 32` - different value!)
- [ ] *(Optional)* `ANTHROPIC_API_KEY` = (from console.anthropic.com)
- [ ] *(Optional)* `GOOGLE_API_KEY` = (from makersuite.google.com)

---

## 🚨 Common Mistakes to Avoid

### ❌ DON'T:
- Use the same value for JWT_SECRET and ADMIN_SECRET
- Add spaces before or after variable names
- Add quotes around the values in Railway (paste raw token)
- Forget to select required scopes for GitHub token
- Share your tokens in chat or commit them to git

### ✅ DO:
- Copy tokens exactly as provided (no modifications)
- Keep tokens secret and secure
- Use different random values for JWT_SECRET and ADMIN_SECRET
- Verify all 6 required variables are present before deploying
- Store a backup of your tokens in a password manager

---

## 🔍 Verification Commands

After adding variables to Railway, verify locally (optional):

```bash
# Create a test .env file locally
cat > .env.test << 'EOF'
NODE_ENV=production
TELEGRAM_BOT_TOKEN=your_token_here
GROQ_API_KEY=your_key_here
GITHUB_TOKEN=your_token_here
JWT_SECRET=your_secret_here
ADMIN_SECRET=your_secret_here
EOF

# Check each variable is set
grep -E "^[A-Z_]+=" .env.test | wc -l
# Should output: 6 (or 8 if you added optional ones)

# Delete test file (don't commit!)
rm .env.test
```

---

## 📞 Quick Help

### "I can't find where to add variables in Railway"
```
1. Go to: https://railway.app
2. Click your project
3. Click the service name
4. Click "Variables" tab (in top nav)
5. Click "+ New Variable"
```

### "Which GitHub token scopes do I really need?"
```
REQUIRED:
✅ repo (full control)
✅ workflow
✅ read:org

OPTIONAL (recommended):
✅ read:user
✅ user:email
```

### "Can I change these later?"
```
YES! You can update any variable:
1. Railway → Variables
2. Click on variable name
3. Edit value
4. Click outside to save
5. Redeploy if needed
```

### "How do I know if my tokens work?"
```
You'll know after deployment:
- Check Railway logs for successful startup
- Test Telegram bot (send /start)
- Health check should return 200 OK
- No authentication errors in logs
```

---

## 🎯 Next Steps After Adding Variables

1. ✅ Verify all 6 required variables are present in Railway
2. ✅ Check for typos in variable names (case-sensitive!)
3. ✅ Merge PR #4 to trigger deployment
4. ✅ Monitor Railway logs for successful startup
5. ✅ Test the bot and web interface

---

## 💾 Template for Password Manager

Save this template in your password manager for backup:

```
SERVICE: Railway Telegram Bot
PROJECT: telegram-agent

NODE_ENV=production
TELEGRAM_BOT_TOKEN=
GROQ_API_KEY=
GITHUB_TOKEN=
JWT_SECRET=
ADMIN_SECRET=
ANTHROPIC_API_KEY= (optional)
GOOGLE_API_KEY= (optional)

NOTES:
- TELEGRAM_BOT_TOKEN: From @BotFather
- GROQ_API_KEY: From console.groq.com
- GITHUB_TOKEN: Personal access token with repo, workflow, read:org
- JWT_SECRET: Random 32-byte base64
- ADMIN_SECRET: Different random 32-byte base64
- Created: [DATE]
- Railway Project: [PROJECT_ID]
```

---

**Last Updated**: 2026-05-28
**Related**: See DEPLOYMENT-GUIDE.md for full deployment instructions
