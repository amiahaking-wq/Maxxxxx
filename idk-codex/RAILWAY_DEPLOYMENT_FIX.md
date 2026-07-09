# Railway Deployment Crash-Restart Loop Fix

## Problem
Railway deployment is stuck in a crash-restart loop causing 409 Telegram API conflicts. The image push phase appears stuck at 100% complete.

## Root Cause
**409 Conflict Error**: Multiple bot instances are running simultaneously, causing Telegram API to reject new connections. This happens when:
1. Old deployment is still running while new one starts
2. Railway's restart policy (ON_FAILURE with 10 retries) keeps restarting crashed instances
3. Multiple failed deployments remain active

## Immediate Actions

### Option 1: Railway Dashboard (Fastest)
1. **Login to Railway Dashboard**: https://railway.app
2. **Navigate to your project**: `autonomous-cicd-telegram-agent`
3. **Stop ALL deployments**:
   - Go to "Deployments" tab
   - Click on each running/restarting deployment
   - Click "Stop Deployment" or "Remove"
4. **Clear stuck builds**:
   - Look for deployments showing "Building" or "Deploying"
   - Force cancel them
5. **Trigger fresh deployment**:
   - Go to "Settings" → "Redeploy"
   - OR push a new commit to trigger GitHub integration

### Option 2: Railway CLI (If Installed)
```bash
# Install Railway CLI if not present
npm i -g @railway/cli

# Login to Railway
railway login

# Link to your project
railway link

# List all deployments
railway status

# Remove stuck deployments
railway down

# Start fresh deployment
railway up
```

### Option 3: GitHub Webhook (Trigger New Deploy)
```bash
cd /__modal/volumes/vo-kQcELnLuzbEEeWpAfe5rqq/claude-workspace/joychaeira76368_gmail.com/johnadekola676-page/IDK

# Make a small change to trigger redeploy
echo "# Deployment fix - $(date)" >> .railway-deploy-trigger

# Commit and push
git add .railway-deploy-trigger
git commit -m "fix: Force Railway redeployment to clear crash loop

- Stop all existing instances causing 409 Telegram conflicts
- Fresh deployment with single bot instance

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
git push origin main
```

## Preventive Fixes

### 1. Add Single-Instance Lock (Recommended)
Create a mechanism to prevent multiple bot instances:

**File: `src/bot/telegram-bot.js`** (add at start of bot initialization)
```javascript
// Prevent multiple instances (409 conflict)
const INSTANCE_LOCK_KEY = 'telegram_bot_instance_lock';
const LOCK_TTL = 60000; // 60 seconds

async function acquireInstanceLock() {
  const lockFile = path.join(process.cwd(), 'data', 'bot.lock');

  try {
    const stats = await fs.stat(lockFile);
    const age = Date.now() - stats.mtimeMs;

    if (age < LOCK_TTL) {
      throw new Error('Another bot instance is running (409 prevention)');
    }
  } catch (err) {
    // Lock doesn't exist or is stale, proceed
  }

  await fs.writeFile(lockFile, JSON.stringify({
    pid: process.pid,
    started: new Date().toISOString()
  }));

  // Refresh lock periodically
  setInterval(() => {
    fs.writeFile(lockFile, JSON.stringify({
      pid: process.pid,
      started: new Date().toISOString()
    })).catch(() => {});
  }, 30000);
}
```

### 2. Update Railway Configuration
**File: `railway.toml`**
```toml
[build]
builder = "DOCKERFILE"
dockerfilePath = "Dockerfile"

[deploy]
startCommand = "node server.js"
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 3  # REDUCED from 10 to prevent restart loops
numReplicas = 1              # ENSURE single instance

[[services]]
name = "telegram-agent"

[services.healthcheck]
path = "/health"
initialDelaySeconds = 30     # INCREASED to allow full startup
periodSeconds = 30
timeoutSeconds = 10
failureThreshold = 3
```

### 3. Improve Graceful Shutdown
**File: `server.js`** (enhance shutdown function)
```javascript
async function shutdown(signal) {
  logger.info(`Received ${signal}, shutting down gracefully`);

  try {
    // 1. Stop accepting new requests
    if (global.server) {
      await new Promise((resolve) => {
        global.server.close(resolve);
      });
    }

    // 2. Stop Telegram bot
    if (global.bot) {
      await global.bot.stop(signal);
      logger.info('Telegram bot stopped');
    }

    // 3. Close database
    const { getDatabase } = await import('./src/database/db.js');
    const db = getDatabase();
    if (db) {
      db.close();
      logger.info('Database closed');
    }

    // 4. Remove instance lock
    const lockFile = path.join(process.cwd(), 'data', 'bot.lock');
    await fs.unlink(lockFile).catch(() => {});

  } catch (error) {
    logger.error('Error during shutdown', { error: error.message });
  }

  process.exit(0);
}
```

### 4. Add Health Check Improvements
**File: `src/api/gateway.js`** (enhance health endpoint)
```javascript
app.get('/health', async (req, res) => {
  try {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      bot: global.bot ? 'connected' : 'disconnected',
      database: 'connected' // Add DB check
    };

    // Check if bot is actually polling
    if (global.bot && !global.bot.isRunning) {
      health.status = 'unhealthy';
      health.bot = 'not_polling';
      return res.status(503).json(health);
    }

    res.status(200).json(health);
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: error.message
    });
  }
});
```

## Deployment Checklist

Before next deployment:
- [ ] Stop ALL running Railway deployments via dashboard
- [ ] Verify no instances are in "Restarting" state
- [ ] Clear any stuck build processes
- [ ] Update `railway.toml` with reduced retry count
- [ ] Implement instance lock mechanism (optional but recommended)
- [ ] Test locally first: `docker build -t test . && docker run -p 3000:3000 test`
- [ ] Push to trigger new deployment
- [ ] Monitor logs for 409 errors: `railway logs`

## Monitoring After Deploy

Watch for these indicators:
```bash
# Check Railway logs
railway logs --tail 100

# Look for these patterns:
# ✅ GOOD: "Application started successfully"
# ✅ GOOD: "Telegram bot connected"
# ❌ BAD: "409 Conflict"
# ❌ BAD: "ECONNREFUSED"
# ❌ BAD: "Error: Conflict: terminated by other getUpdates request"
```

## Emergency Stop Command

If crash loop continues:
```bash
# Via Railway CLI
railway down

# Via dashboard
# Settings → Service → Delete (temporary)
# Then recreate from GitHub repo
```

## Long-term Solution

Consider moving to **webhook mode** instead of polling to completely eliminate 409 conflicts:
```javascript
// Instead of bot.launch()
app.use(bot.webhookCallback('/telegram-webhook'));
// Railway provides stable HTTPS endpoint
```

---

**Status**: Ready to execute
**Next Step**: Choose Option 1, 2, or 3 above to stop existing deployments
