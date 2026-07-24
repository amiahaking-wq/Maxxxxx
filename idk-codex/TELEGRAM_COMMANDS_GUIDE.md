# 🤖 Telegram Bot - Complete Command Guide

## ✅ **NEW COMMANDS ADDED**

Your Telegram bot now has Claude Code-style commands! Here's everything you can do:

---

## 📁 **Repository Commands**

### `/setrepo owner/repo`
Set which GitHub repository the agent should work on.

**Example:**
```
/setrepo johnadekola676-page/IDK
```

**Response:**
```
✅ Repository set to: johnadekola676-page/IDK

All future tasks will use this repository.
```

### `/repos`
List configured repositories and see what's currently active.

**Shows:**
- Currently configured GITHUB_OWNER
- Currently configured GITHUB_REPO
- Instructions on how to change

---

## ⚡ **Quick Action Commands**

### `/commit <message>`
Quickly commit all changes with a message.

**Example:**
```
/commit Add new feature for user authentication
```

**What it does:**
1. Stages all changes
2. Creates commit with your message
3. Pushes to GitHub
4. Reports back success/failure

### `/test`
Run all tests in the project.

**Example:**
```
/test
```

**What it does:**
1. Finds and runs test suite
2. Reports test results
3. Shows any failures

### `/build`
Build the project.

**Example:**
```
/build
```

**What it does:**
1. Runs build command
2. Reports build status
3. Shows any build errors

---

## 🔧 **Main Commands** (Already Existed)

### `/task <description>`
Execute an autonomous development task.

**Example:**
```
/task Create a REST API endpoint for user registration
```

**What it does:**
- **Plan** - Analyzes task and creates implementation plan
- **Execute** - Writes the code
- **Test** - Runs tests
- **Deploy** - Commits and pushes to GitHub
- **Monitor** - Watches CI/CD pipelines

### `/review_pr <number>`
Review a pull request.

**Example:**
```
/review_pr 42
```

**Checks for:**
- Security vulnerabilities
- Hardcoded credentials
- Code quality issues
- Compliance with CLAUDE.md

### `/status`
Check GitHub Actions workflow status.

---

## 📋 **How to Use**

### **Step 1: Start the bot**
```
/start
```

### **Step 2: Set your repository**
```
/setrepo your-username/your-repo
```

### **Step 3: Start working!**

**Option A - Full Autonomous Task:**
```
/task Create a login page with React
```

**Option B - Quick Actions:**
```
/commit Fixed bug in authentication
/test
/build
```

---

## 🔄 **Workflow Example**

Here's a complete workflow using the new commands:

```bash
# 1. Set your repository
/setrepo johnadekola676-page/IDK

# 2. Work on a feature
/task Add a new API endpoint for user profiles

# 3. Agent does its thing (plan, code, test)
# ... wait for completion ...

# 4. Quick commit
/commit Add user profile API endpoint

# 5. Run tests
/test

# 6. Build
/build

# 7. Check deployment status
/status
```

---

## 🎯 **Key Features**

✅ **Repository Switching** - Work on multiple repos easily
✅ **Quick Actions** - Fast commits, tests, builds
✅ **Full Autonomy** - Complete 5-phase execution
✅ **Real-time Updates** - See progress as it happens
✅ **Error Handling** - Self-healing with retries

---

## 🆚 **Web vs Telegram vs CLI**

All three interfaces now have the same features:

| Feature | Web UI | Telegram | CLI |
|---------|--------|----------|-----|
| Repository Selection | ✅ Menu | ✅ /setrepo | ✅ Config |
| Run Tasks | ✅ Chat | ✅ /task | ✅ submit |
| Quick Commit | ✅ Menu | ✅ /commit | ✅ commit |
| Run Tests | ✅ Menu | ✅ /test | ✅ test |
| Build | ✅ Menu | ✅ /build | ✅ build |
| Status | ✅ Status bar | ✅ /status | ✅ status |

---

## 🐛 **Troubleshooting**

### **Bot not responding?**
1. Check Railway logs for errors
2. Verify `TELEGRAM_BOT_TOKEN` is set
3. Send `/start` to wake it up

### **Commands not working?**
1. Make sure you're authorized (check `AUTHORIZED_USER_ID`)
2. Try `/help` to see all commands
3. Check Railway logs for errors

### **"Repository not set" error?**
Run `/setrepo owner/repo` first before running tasks.

---

## 📱 **Mobile-Friendly**

All commands work great on mobile Telegram:
- Short command names
- Clear feedback
- Real-time updates
- Easy to type

Perfect for coding on-the-go! 🚀

---

## 🚀 **Deployment Commands** (NEW!)

### `/pr <title>`
Create a pull request with automatic description.

**Example:**
```
/pr Add user authentication feature
```

**What it does:**
1. Analyzes recent changes
2. Creates PR with title
3. Generates detailed description
4. Links related issues

### `/deploy`
Trigger production deployment.

**Example:**
```
/deploy
```

**What it does:**
1. Pushes to main branch
2. Triggers deployment
3. Monitors status
4. Reports completion

### `/rollback`
Rollback to previous stable version.

**Example:**
```
/rollback
```

**What it does:**
1. Reverts last commit
2. Redeploys previous version
3. Verifies rollback success

---

## 🔍 **Debugging Commands** (NEW!)

### `/logs [lines]`
View recent application logs.

**Examples:**
```
/logs          # Show last 50 lines (default)
/logs 100      # Show last 100 lines
/logs 500      # Show last 500 lines
```

**Shows:**
- Error messages
- API calls
- Performance metrics
- System events

### `/fix <issue>`
Auto-diagnose and fix problems.

**Examples:**
```
/fix Tests are failing
/fix Build errors
/fix Deployment stuck
```

**What it does:**
1. Analyzes the problem
2. Debugs root cause
3. Implements solution
4. Runs tests to verify
5. Commits the fix

### `/docs`
Generate comprehensive documentation.

**Example:**
```
/docs
```

**Creates:**
- README updates
- API documentation
- Code comments
- Usage examples

---

## 📊 **Complete Command List**

### **Main Commands** (5)
1. `/start` - Welcome message
2. `/help` - Command reference
3. `/task <desc>` - Execute development task
4. `/review_pr <num>` - Review pull request
5. `/status` - Check workflow status

### **Repository** (2)
6. `/setrepo owner/repo` - Set active repository
7. `/repos` - List repositories

### **Quick Actions** (3)
8. `/commit <msg>` - Commit changes
9. `/test` - Run tests
10. `/build` - Build project

### **Deployment** (3)
11. `/pr <title>` - Create pull request
12. `/deploy` - Deploy to production
13. `/rollback` - Rollback deployment

### **Debugging** (3)
14. `/logs [lines]` - View logs
15. `/fix <issue>` - Auto-fix problems
16. `/docs` - Generate documentation

**Total: 16 commands** covering every development workflow!
