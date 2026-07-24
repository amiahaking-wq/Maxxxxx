# Quick Start: Cognitive Reflection System

Fast setup guide for the V4 "Think Deeply" architecture.

## Installation

1. **Update environment variables**

```bash
# Add to your .env file
ENABLE_PUSHBACK_ENGINE=true
ENABLE_AUTO_VALIDATION=true
ENABLE_ARCH_DOCUMENTATION=true
MAX_SELF_CORRECTION_RETRIES=10
```

2. **Rebuild application**

```bash
# For Docker
docker build -t agent:v4 .

# For local development
npm install
```

3. **Verify setup**

```bash
node src/agent/reflection/test-cognitive-system.js
```

## How It Works

### When You Send a Task

```
Your Task
    ↓
Is it vague?
    ├─ Yes → Get clarification menu → Choose approach
    └─ No → Proceed
         ↓
    Implementation
         ↓
    Validation (auto-corrects if needed)
         ↓
    Deployment
         ↓
    Auto-documentation to docs/ARCHITECTURE.md
```

## Usage Examples

### Example 1: System Detects Vague Prompt

**You send:**
```
Add authentication
```

**System responds:**
```
To implement "Add authentication", I need to clarify:

Missing Details:
1. Authentication method (JWT, session-based, OAuth)
2. User storage (database schema)
3. Protected routes
4. Password requirements

Suggested Approaches:

Option A: JWT-Based Authentication
- Stateless token-based auth
- Pros: Scalable, no server storage
- Cons: Token revocation complexity

Option B: Session-Based Authentication
- Traditional cookie-based sessions
- Pros: Simple, well-understood
- Cons: Requires session storage

Option C: Minimal Viable Approach (Default)
- Basic username/password with bcrypt
- Simple session storage

Please choose A, B, C, or provide more details.
```

**You choose:** "Option A"

**System:** Proceeds with JWT implementation

### Example 2: System Validates and Self-Corrects

**Implementation generates code with syntax error**

```javascript
// Generated code (broken)
const jwt = require('jsonwebtoken');
const secret = ;  // Syntax error
```

**Auto-Validator detects error:**
```
Syntax error: Unexpected token ;
```

**System self-corrects:**
```
1. Check error learning database → No known fix
2. Generate AI fix → "Add missing value"
3. Apply fix → const secret = process.env.JWT_SECRET;
4. Retry validation → Success
5. Learn pattern for future
```

**Deploy proceeds with corrected code**

### Example 3: System Documents Architecture

**After successful deployment:**

File created: `docs/ARCHITECTURE.md`

```markdown
## JWT Authentication System - 2026-05-28

### Decision
Implemented JWT-based stateless authentication

### Rationale
Chosen for horizontal scalability and microservices support

### Trade-offs
- Pros: Stateless, scalable, mobile-friendly
- Cons: Token revocation requires infrastructure

### Files Modified
- src/auth/jwt.js: Token generation and validation
- src/middleware/auth.js: Authentication middleware

### Technical Details
- Using RS256 (asymmetric) for security
- 15-minute access token expiry
- 7-day refresh token with rotation
```

## Configuration Options

### Enable/Disable Individual Layers

```bash
# Disable vague prompt detection
ENABLE_PUSHBACK_ENGINE=false

# Disable automatic validation
ENABLE_AUTO_VALIDATION=false

# Disable architecture documentation
ENABLE_ARCH_DOCUMENTATION=false
```

### Adjust Self-Correction Attempts

```bash
# Default: 10 attempts
MAX_SELF_CORRECTION_RETRIES=5
```

## Monitoring

### Check Logs

```bash
# View cognitive reflection activity
tail -f logs/combined.log | grep "cognitive\|pushback\|validation\|architecture"
```

### Key Log Messages

```
- "Prompt needs clarification" → Vague prompt detected
- "Auto-validation passed" → Code validated successfully
- "Self-correction successful" → Error automatically fixed
- "Architecture documented" → Docs written
```

### WebSocket Events (Web UI)

Listen for these events in your web UI:

```javascript
socket.on('validation:running', (data) => {
  console.log('Validating files...');
});

socket.on('validation:success', (data) => {
  console.log('Validation passed!', data);
});

socket.on('clarification:needed', (data) => {
  console.log('Please clarify:', data.menu);
});
```

## Architecture Documentation

All successful deployments are documented to:

```
docs/ARCHITECTURE.md
```

View your project's architectural history:

```bash
cat docs/ARCHITECTURE.md
```

## Troubleshooting

### Issue: Pushback engine always triggers

**Cause:** Groq API key missing or invalid

**Fix:**
```bash
# Check environment
echo $GROQ_API_KEY

# If missing, add to .env
GROQ_API_KEY=your_api_key_here
```

### Issue: Validation fails for all files

**Cause:** Validators not installed

**Fix:**
```bash
# For JavaScript/Node.js projects
node --version  # Should be v22+

# For TypeScript projects
npm install -g typescript

# For Python projects
python3 --version
```

### Issue: Architecture docs not created

**Cause:** docs/ directory not writable

**Fix:**
```bash
mkdir -p docs
chmod 755 docs
```

## Performance Impact

| Component | Tokens | Time (avg) | When |
|-----------|--------|------------|------|
| Pushback Engine | 500-1000 | ~2-3s | Only for vague prompts |
| Auto-Validator | 300-500 | ~1-2s | Only for failed validation |
| Arch Writer | 800-1500 | ~3-4s | After every deploy |

**Total:** ~5-9 seconds and 1600-3000 tokens per task (only when needed)

## Best Practices

### Writing Clear Prompts

**Bad (triggers pushback):**
```
- "Add login"
- "Fix bugs"
- "Optimize the app"
- "Make it better"
```

**Good (proceeds immediately):**
```
- "Implement JWT authentication in src/auth/jwt.js using RS256 algorithm"
- "Fix syntax error in src/utils/parser.js line 45"
- "Add Redis caching to GET /api/users endpoint with 5-minute TTL"
- "Update Dockerfile to use multi-stage build for smaller image"
```

### Responding to Clarification

**Option 1: Choose suggested approach**
```
"Choose Option A" or "A"
```

**Option 2: Provide more details**
```
"Implement JWT authentication with:
- RS256 algorithm
- 15-minute access token expiry
- Refresh token rotation
- Store tokens in PostgreSQL"
```

**Option 3: Proceed with minimal approach**
```
"Proceed with minimal approach" or "Option C"
```

## Docker Image Size

The optimized multi-stage Dockerfile reduces image size by 70%:

```bash
# Before: ~350MB
docker images | grep agent
agent   v3   350MB

# After: ~105MB
docker images | grep agent
agent   v4   105MB
```

**Benefit:** Faster builds, deploys, and lower hosting costs

## Testing Your Setup

Run the comprehensive test suite:

```bash
node src/agent/reflection/test-cognitive-system.js
```

Expected output:
```
🧪 Testing Cognitive Reflection System

📋 Test 1: Pushback Engine
✅ PASS: Correctly detected vague prompt

🔍 Test 2: Auto-Validator
✅ PASS: Valid file passed validation
✅ PASS: Invalid file correctly failed validation

📝 Test 3: Architecture Writer
✅ PASS: Documentation generated successfully

🧠 Test 4: Complete Cognitive Reflection Loop
✅ PASS: Loop correctly requested clarification

✅ All tests completed!
```

## More Information

- Full documentation: `docs/COGNITIVE_REFLECTION.md`
- Implementation details: `docs/V4_COGNITIVE_REFLECTION_IMPLEMENTATION.md`
- Project standards: `CLAUDE.md`

## Support

If you encounter issues:

1. Check logs: `tail -f logs/combined.log`
2. Verify environment variables: `cat .env`
3. Run tests: `node src/agent/reflection/test-cognitive-system.js`
4. Review documentation: `docs/COGNITIVE_REFLECTION.md`

---

**Status:** Production Ready ✅
**Version:** 4.0.0
**Last Updated:** 2026-05-28
