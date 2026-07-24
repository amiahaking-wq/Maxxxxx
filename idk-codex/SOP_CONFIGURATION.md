# SOP System Configuration

This document describes how to configure and enable the SOP (Standard Operating Procedure) system in the Claude Code architecture.

## Environment Variables

### Core SOP Configuration

```bash
# Enable/disable SOP system (default: false)
ENABLE_SOP=true

# Workflow to use (default: standard-development-task)
SOP_WORKFLOW=standard-development-task

# Maximum retry attempts for SOP steps (default: 10)
SOP_MAX_RETRIES=10

# Directory for SOP worksheets (default: /tmp/volter/sop)
SOP_WORKSHEET_DIR=/tmp/volter/sop
```

### Specialist Configuration

```bash
# Enable/disable individual specialists
ENABLE_GIT_SPECIALIST=true
ENABLE_CODING_SPECIALIST=true
ENABLE_CONTEXT_SPECIALIST=true
ENABLE_REVIEW_SPECIALIST=true
ENABLE_QA_SPECIALIST=true

# GitHub token for Git Specialist (required for GitHub operations)
GITHUB_TOKEN=ghp_xxxxxxxxxxxxx
```

### Feature Flags

```bash
# Enable error learning (from existing system)
ERROR_LEARNING_ENABLED=true

# Enable Obsidian note writing (from existing system)
OBSIDIAN_ENABLED=true

# Enable WebSocket progress updates
WEBSOCKET_ENABLED=true
```

## Configuration Files

### .env.example

Add these lines to your `.env.example` file:

```bash
# ============================================================================
# SOP SYSTEM CONFIGURATION (Claude Code Architecture)
# ============================================================================

# Enable SOP (Standard Operating Procedure) system
ENABLE_SOP=false

# SOP workflow to use (standard-development-task, hotfix-workflow)
SOP_WORKFLOW=standard-development-task

# Maximum retry attempts for SOP steps
SOP_MAX_RETRIES=10

# SOP worksheet directory
SOP_WORKSHEET_DIR=/tmp/volter/sop

# Specialist configuration
ENABLE_GIT_SPECIALIST=true
ENABLE_CODING_SPECIALIST=true
ENABLE_CONTEXT_SPECIALIST=true
ENABLE_REVIEW_SPECIALIST=true
ENABLE_QA_SPECIALIST=true
```

## Database Migration

To enable SOP system, run the database migration:

```bash
# Apply SOP schema
sqlite3 ./data/agent.db < src/database/schema-sop.sql
```

Or use the migration helper (if available):

```bash
npm run migrate:sop
```

## Enabling the SOP System

### Step 1: Update Environment Variables

```bash
# In your .env file
ENABLE_SOP=true
```

### Step 2: Apply Database Migration

```bash
sqlite3 ./data/agent.db < src/database/schema-sop.sql
```

### Step 3: Restart the Application

```bash
# Stop the application
npm stop

# Start with new configuration
npm start
```

### Step 4: Verify SOP is Enabled

Check the logs for:

```
[INFO] SOP system enabled, attempting SOP execution
[INFO] SOP worksheet created: /tmp/volter/sop/allied-academic-hoverfly.md
```

## Available Workflows

### Standard Development Task

The default 9-step workflow for comprehensive development tasks:

1. Link GitHub Issue
2. Gather Context
3. Plan Implementation
4. Execute Implementation
5. Run Tests
6. Code Review
7. Commit Changes
8. Push to Remote
9. Create Pull Request

Usage:

```bash
SOP_WORKFLOW=standard-development-task
```

### Hotfix Workflow

Fast-tracked 3-step workflow for urgent fixes:

1. Gather Context
2. Implement Fix
3. Deploy

Usage:

```bash
SOP_WORKFLOW=hotfix-workflow
```

## Monitoring SOP Execution

### Check Worksheet Files

SOP worksheets are created in `/tmp/volter/sop/` with memorable slugs:

```bash
ls -la /tmp/volter/sop/
# Example output:
# allied-academic-hoverfly.md
# bold-beaver-jaguar.md
# clever-dolphin-lemur.md
```

### View Worksheet Contents

```bash
cat /tmp/volter/sop/allied-academic-hoverfly.md
```

### Query Database

```sql
-- View active SOP worksheets
SELECT * FROM v_active_sop_worksheets;

-- View specialist performance
SELECT * FROM v_specialist_performance;

-- View recent SOP activity
SELECT * FROM v_recent_sop_activity;
```

## Disabling the SOP System

To fall back to the original 5-phase loop:

```bash
# In your .env file
ENABLE_SOP=false
```

Or remove the environment variable entirely. The system will automatically use the standard 5-phase loop.

## Troubleshooting

### SOP Not Starting

Check:

1. `ENABLE_SOP=true` is set
2. Database migration is applied
3. `/tmp/volter/sop/` directory is writable
4. Logs show "SOP system enabled"

### Specialists Failing

Check:

1. `GITHUB_TOKEN` is set (for Git Specialist)
2. All specialist feature flags are enabled
3. Specialist logs show successful registration

### Worksheet Not Found

Check:

1. `/tmp/volter/sop/` directory exists
2. User has write permissions
3. Disk space available

### Falling Back to Standard Loop

This is normal behavior when:

1. SOP is disabled
2. SOP execution fails (graceful degradation)
3. Error occurs during SOP initialization

## Performance Considerations

### Memory Usage

SOP system adds approximately 50-100MB memory overhead:

- Specialist registry: ~10MB
- Worksheet management: ~5MB per active worksheet
- Context caching: ~20-30MB

### Execution Time

SOP execution may be 10-20% slower than standard loop due to:

- Worksheet I/O operations
- Specialist delegation overhead
- Step progress tracking

However, the improved organization and tracking often compensate through:

- Better error recovery
- Reduced retry cycles
- More efficient specialist routing

## Advanced Configuration

### Custom Workflows

Create custom workflows by adding to `src/agent/sop/workflows/`:

```javascript
export const CUSTOM_WORKFLOW = {
  name: 'my-custom-workflow',
  description: 'Custom workflow for specific use case',
  steps: [
    // Define custom steps
  ]
};
```

### Custom Specialists

Create custom specialists by extending `SpecialistAgent`:

```javascript
import { SpecialistAgent } from './base.js';

export class MySpecialist extends SpecialistAgent {
  constructor() {
    super('my-specialist', ['custom', 'keywords'], 'Description');
  }

  async execute(task, context) {
    // Custom implementation
  }
}
```

Register in `src/agent/specialists/index.js`:

```javascript
export function createSpecialistRegistry() {
  const registry = new SpecialistRegistry();
  // ... existing specialists
  registry.register(new MySpecialist());
  return registry;
}
```

## Support

For issues or questions:

1. Check logs: `tail -f logs/agent.log`
2. Review worksheet: `cat /tmp/volter/sop/<slug>.md`
3. Query database views for diagnostic information
4. File an issue with SOP worksheet and logs attached
