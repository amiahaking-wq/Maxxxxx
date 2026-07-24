# 🚀 Telegram Bot - Quick Reference Card

## **Essential Commands**

```
/start              Welcome & intro
/help               Show all commands
/setrepo owner/repo Set active repository
```

## **Development Workflow**

```
/task <description> Execute autonomous task
/commit <message>   Commit all changes
/test               Run tests
/build              Build project
/pr <title>         Create pull request
/deploy             Deploy to production
```

## **Troubleshooting**

```
/status             Check workflow status
/logs [lines]       View recent logs
/fix <issue>        Auto-fix problems
/review_pr <number> Review pull request
/rollback           Undo last deployment
```

## **Other**

```
/repos              List repositories
/docs               Generate documentation
```

---

## **Typical Workflow**

```bash
# 1. Set repository
/setrepo johnadekola676-page/IDK

# 2. Build feature
/task Add user authentication

# 3. Test it
/test

# 4. Commit
/commit Add authentication feature

# 5. Create PR
/pr Add user authentication

# 6. Deploy
/deploy

# 7. Check status
/status
```

---

## **Quick Examples**

```
/task Create a REST API endpoint
/commit Fixed login bug
/test
/build
/pr Add payment integration
/deploy
/logs 100
/fix Tests failing
/status
/rollback
/docs
```

---

**💡 Tip:** Type `/help` anytime for the full command reference!
