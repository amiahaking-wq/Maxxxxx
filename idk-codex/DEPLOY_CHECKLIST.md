# MAX System Deployment Checklist

Complete guide for deploying the MAX (Multi-Agent eXecutor) system to Railway.

## Prerequisites

- [x] Railway account created
- [x] GitHub repository connected to Railway
- [x] Railway CLI installed (optional, for local testing)

## 1. Required Environment Variables (Minimum Set)

Configure these in Railway dashboard under **Variables** tab:

### Core System
```bash
NODE_ENV=production
PORT=3000
DATABASE_PATH=/data/sessions.db
```

### GitHub Integration (Required for agent operations)
```bash
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
GITHUB_OWNER=your-username
GITHUB_REPO=your-repo
```

### LLM Providers (At least ONE required)
```bash
# Option 1: Groq (recommended for speed)
GROQ_API_KEY=gsk_xxxxxxxxxxxxxxxxxxxx

# Option 2: Anthropic Claude
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxxxxxxxxx

# Option 3: Google Gemini
GEMINI_API_KEY=xxxxxxxxxxxxxxxxxxxx
```

### Telegram Bot (Optional)
```bash
TELEGRAM_BOT_TOKEN=1234567890:ABCdefGHIjklMNOpqrsTUVwxyz
TELEGRAM_ENABLED=true  # Set to false to disable
TELEGRAM_WEBHOOK_ENABLED=false  # Set to true for webhooks instead of polling
```

### Phone Bridge (Optional - for Termux device)
```bash
PHONE_SECRET=your-secure-random-secret
# This secret must match on the Termux device
```

### Security (Optional but recommended)
```bash
JWT_SECRET=your-jwt-secret-key-here
SESSION_SECRET=your-session-secret-here
```

### Obsidian Sync (Optional)
```bash
OBSIDIAN_VAULT_PATH=/path/to/vault
OBSIDIAN_SYNC_ENABLED=false
```

## 2. Database Reset on First Deploy

**CRITICAL**: On first deployment, run database reset to create fresh schema:

### Method 1: Railway CLI
```bash
railway run npm run db:reset
```

### Method 2: One-off command in Railway dashboard
Navigate to your service → **Deployments** → **Run Command**:
```bash
npm run db:reset
```

### Method 3: SSH into Railway container
```bash
railway shell
npm run db:reset
exit
```

**Note**: This only needs to be done ONCE on initial deployment. Do NOT run on subsequent deploys as it will delete all session data.

## 3. Verify Telegram Bot Connection

If Telegram is enabled:

### Check Logs for Connection
In Railway dashboard, go to **Deployments** → **View Logs**, look for:
```
[info] Telegram bot initialized in polling mode
[info] Telegram bot started successfully
```

### Test Bot
1. Open Telegram and search for your bot username
2. Send `/start` command
3. Verify you receive the welcome message
4. Try a simple task: `/task Create a hello.txt file`

### Common Issues

**Bot not responding:**
- Verify `TELEGRAM_BOT_TOKEN` is correct
- Check `TELEGRAM_ENABLED=true` is set
- Review logs for authentication errors

**Bot receives messages but doesn't respond:**
- Database schema issue → run `npm run db:reset`
- Check LLM provider API keys are valid
- Review logs for FOREIGN KEY constraint errors

## 4. Test Phone Bridge from Termux

If using phone bridge for local LLM inference:

### On Railway Server
1. Verify `PHONE_SECRET` environment variable is set
2. Check logs for: `PhoneBridge initialized on /phone-bridge`

### On Android Device (Termux)
1. Copy phone-client directory to Termux:
   ```bash
   # On your computer
   scp -r phone-client user@phone-ip:~/

   # Or use Termux:API to transfer files
   ```

2. Run setup script:
   ```bash
   cd ~/phone-client
   bash setup.sh
   ```

3. Set environment variables:
   ```bash
   export PHONE_SECRET='same-as-railway-secret'
   export RAILWAY_URL='https://your-app.railway.app'
   ```

4. Start Ollama (in separate Termux session):
   ```bash
   ollama serve
   ```

5. Start inference client:
   ```bash
   cd ~/phone-client
   node inference-client.js
   ```

### Verify Connection
Check Railway logs for:
```
[info] Phone device connected
[info] Phone device registered
```

### Test Inference
From CLI or Telegram, send a simple task. If phone is available, it should handle lightweight queries.

## 5. Test CLI Entry Point

The CLI client can connect from any machine:

### Install CLI (if not using npm link)
```bash
# Clone repo
git clone <your-repo-url>
cd <repo-name>

# Install dependencies
npm install

# Test CLI
node max-cli.js "Create a test.txt file"
```

### Configure Server URL
```bash
export MAX_CLI_SERVER_URL=https://your-app.railway.app
node max-cli.js "Your task here"
```

### Expected Output
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  MAX CLI - Multi-Agent eXecutor System
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔌 Connecting to MAX Agent Server...
✓ Connected to MAX Agent Server
✓ Task submitted successfully
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Monitoring task execution (Ctrl+C to exit)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✓ Phase: PLAN - success
✓ Phase: EXECUTE - success
...
```

## 6. Log Monitoring by Entry Point

Monitor different entry points to ensure proper routing:

### Telegram Logs
```
[info] Starting agent execution for Telegram task
[info] Created new session with UUID
[info] Executing agent loop for natural language input
```

### Socket.IO (Web) Logs
```
[info] Socket.IO client connected
[info] Agent task triggered via API
[info] Created new session with UUID
```

### CLI Logs
```
[info] CLI task submitted
[info] Created new session with UUID
[info] CLI agent execution started
```

### Phone Bridge Logs
```
[info] Phone device connected
[info] Sent inference request to phone
[info] Phone inference completed
```

## 7. Health Checks

### Database Health
```bash
railway run node -e "import('./src/database/db.js').then(m => m.getDatabase().prepare('SELECT COUNT(*) as count FROM sessions').get())"
```

Should return session count without errors.

### API Health
Visit: `https://your-app.railway.app/health`

Expected response:
```json
{
  "status": "ok",
  "uptime": 12345,
  "timestamp": "2026-05-30T..."
}
```

### WebSocket Health
Use browser console:
```javascript
const socket = io('https://your-app.railway.app');
socket.on('connect', () => console.log('WebSocket connected'));
```

## 8. Common Issues & Solutions

### Issue: Database FOREIGN KEY errors
**Solution**: Run `npm run db:reset` - schema was not initialized properly

### Issue: "Session not found" errors
**Solution**: Verify `getOrCreateSession()` is being called in all entry points

### Issue: Telegram bot timeout
**Solution**:
- Check Railway container has enough memory (min 512MB)
- Verify LLM provider isn't rate limiting
- Consider enabling webhook mode: `TELEGRAM_WEBHOOK_ENABLED=true`

### Issue: Phone bridge won't connect
**Solution**:
- Verify `PHONE_SECRET` matches on both sides
- Check firewall isn't blocking WebSocket connections
- Ensure Railway URL uses `wss://` (secure WebSocket)

### Issue: CLI can't connect
**Solution**:
- Verify Railway deployment is public (not private service)
- Check `MAX_CLI_SERVER_URL` includes protocol (https://)
- Review CORS settings if browser-based

## 9. Performance Optimization

### Database Persistence
Railway provides persistent volumes. Configure in `railway.toml`:
```toml
[volumes]
data = "/data"
```

Ensure `DATABASE_PATH=/data/sessions.db` matches mount point.

### Memory Limits
Monitor Railway metrics. If hitting limits:
- Increase memory in Railway plan
- Reduce `MAX_RETRY_COUNT` to limit concurrent retries
- Enable phone bridge to offload inference

### Token Budget
Configure token limits to prevent API overages:
```bash
MAX_TOKEN_INPUT=6000
MAX_TOKEN_OUTPUT=2000
```

## 10. Monitoring & Alerts

### Setup Railway Notifications
1. Go to **Settings** → **Notifications**
2. Enable deployment notifications
3. Add webhook for custom alerts

### Log Aggregation
Railway provides built-in log viewer. For external aggregation:
- Forward logs to Logtail
- Use Railway's log API
- Setup CloudWatch/Datadog integration

### Key Metrics to Watch
- Session creation rate (should match user activity)
- Agent loop completion rate (>80% success rate is healthy)
- Database query time (should be <50ms avg)
- Memory usage (should stay under 80% of limit)
- WebSocket connection count

## 11. Backup & Recovery

### Database Backups
Schedule periodic backups:
```bash
# Backup script (run via cron or Railway cron jobs)
railway run node -e "
import { getDatabase } from './src/database/db.js';
import { copyFileSync } from 'fs';
const timestamp = new Date().toISOString().replace(/:/g, '-');
copyFileSync('/data/sessions.db', \`/data/backups/sessions-\${timestamp}.db\`);
"
```

### Environment Variable Backup
Export current variables:
```bash
railway variables --json > railway-vars-backup.json
```

### Restore from Backup
```bash
railway run cp /data/backups/sessions-TIMESTAMP.db /data/sessions.db
```

## 12. Scaling Checklist

When scaling beyond single instance:

- [ ] Migrate to PostgreSQL (SQLite doesn't support multi-instance)
- [ ] Implement Redis for session state
- [ ] Use sticky sessions for WebSocket
- [ ] Separate phone bridge to dedicated service
- [ ] Setup load balancer with Railway's built-in LB

## 13. Security Hardening

### Production Checklist
- [ ] Rotate all API keys and secrets
- [ ] Enable rate limiting on API endpoints
- [ ] Configure CORS whitelist
- [ ] Setup JWT authentication for all API routes
- [ ] Enable HTTPS only (Railway does this by default)
- [ ] Review audit logs regularly
- [ ] Implement secret scanning in CI/CD

### Audit Log Review
```bash
railway run node -e "
import { getAuditHistory } from './src/database/queries.js';
console.log(getAuditHistory({ riskLevel: 'high', limit: 100 }));
"
```

## Complete! 🎉

Your MAX system is now deployed and ready for production use. Monitor logs and metrics during initial usage to identify any issues early.

For support or issues, check:
- Railway logs: `railway logs`
- GitHub Issues: [your-repo]/issues
- Documentation: See MAX_ARCHITECTURE.md for system details
