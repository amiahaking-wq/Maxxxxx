import fs from 'fs';
import path from 'path';
import logger from '../../utils/logger.js';

/**
 * Creates and manages SOP worksheets in /tmp/volter/sop/
 * Based on Claude Code's implementation
 *
 * Worksheets are living documents that track task progress through
 * a 9-step SOP checklist with fillable blanks and checkboxes.
 */
export class SOPWorksheet {
  constructor(chatId) {
    this.chatId = chatId;
    this.slug = this.generateSlug();
    this.worksheetPath = `/tmp/volter/sop/${this.slug}.md`;
    this.baseDir = '/tmp/volter/sop';
  }

  /**
   * Generate a memorable slug like "allied-academic-hoverfly"
   * Format: adjective-noun-animal
   *
   * @returns {string} Generated slug
   */
  generateSlug() {
    const adjectives = [
      'allied', 'bold', 'clever', 'diligent', 'eager',
      'fearless', 'graceful', 'honest', 'intrepid', 'jovial',
      'keen', 'luminous', 'mighty', 'noble', 'optimal',
      'patient', 'quick', 'robust', 'stellar', 'tenacious'
    ];

    const nouns = [
      'academic', 'beaver', 'cheetah', 'dolphin', 'eagle',
      'falcon', 'gazelle', 'hawk', 'ibis', 'jaguar',
      'kestrel', 'lynx', 'mongoose', 'nautilus', 'otter',
      'panther', 'quail', 'raven', 'swift', 'tiger'
    ];

    const animals = [
      'hoverfly', 'ibis', 'jaguar', 'koala', 'lemur',
      'mantis', 'newt', 'osprey', 'panda', 'quokka',
      'raccoon', 'seal', 'tapir', 'urchin', 'viper',
      'wombat', 'xerus', 'yak', 'zebra', 'axolotl'
    ];

    const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    const animal = animals[Math.floor(Math.random() * animals.length)];

    return `${adj}-${noun}-${animal}`;
  }

  /**
   * Create a new worksheet with the specified workflow template
   *
   * @param {string} workflow - Workflow name (e.g., 'standard-development-task')
   * @returns {Promise<string>} Path to created worksheet
   */
  async create(workflow = 'standard-development-task') {
    try {
      // Ensure base directory exists
      await fs.promises.mkdir(this.baseDir, { recursive: true });

      // Generate template content
      const template = this.generateTemplate(workflow);

      // Write worksheet file
      await fs.promises.writeFile(this.worksheetPath, template, 'utf-8');

      logger.info('SOP worksheet created', {
        path: this.worksheetPath,
        workflow,
        slug: this.slug
      });

      return this.worksheetPath;
    } catch (error) {
      logger.error('Failed to create SOP worksheet', {
        error: error.message,
        path: this.worksheetPath
      });
      throw error;
    }
  }

  /**
   * Generate worksheet template based on workflow type
   *
   * @param {string} workflow - Workflow name
   * @returns {string} Markdown template
   */
  generateTemplate(workflow) {
    const timestamp = new Date().toISOString();

    return `# SOP Worksheet: ${this.slug}

**Created:** ${timestamp}
**Workflow:** ${workflow}
**Chat ID:** ${this.chatId}

---

## Task Context

**Task Description:** ___
**Repository:** ___
**Issue ID:** ___
**Assigned to:** ___

---

## Progress Checklist

### Step 1: Link GitHub Issue
- [ ] 1.1 Check for existing issues
- [ ] 1.2 Create new issue if none exist
- [ ] 1.3 Link issue to chat
- [ ] 1.4 Ensure issue is assigned

**Status:** ___

### Step 2: Gather Context
- [ ] 2.1 Delegate to context specialist
- [ ] 2.2 Collect all relevant files
- [ ] 2.3 Understand problem thoroughly

**Context Files:** ___
**Completed:** ___

### Step 3: Plan Implementation
- [ ] 3.1 Break down into subtasks
- [ ] 3.2 Identify dependencies
- [ ] 3.3 Estimate complexity

**Plan:** ___

### Step 4: Execute Implementation
- [ ] 4.1 Delegate to coding specialist
- [ ] 4.2 Generate code changes
- [ ] 4.3 Add co-authorship attribution

**Files Modified:** ___
**Attribution:** ___

### Step 5: Run Tests
- [ ] 5.1 Delegate to QA specialist
- [ ] 5.2 Run test suite
- [ ] 5.3 Fix any failures (max 10 retries)

**Test Results:** ___
**Failures Fixed:** ___

### Step 6: Code Review
- [ ] 6.1 Delegate to review specialist
- [ ] 6.2 Check CLAUDE.md compliance
- [ ] 6.3 Verify error handling
- [ ] 6.4 Validate documentation

**Review Status:** ___
**Issues Found:** ___

### Step 7: Commit Changes
- [ ] 7.1 Delegate to git specialist
- [ ] 7.2 Stage modified files
- [ ] 7.3 Create descriptive commit message
- [ ] 7.4 Add co-authorship attribution

**Commit Hash:** ___
**Commit Message:** ___

### Step 8: Push to Remote
- [ ] 8.1 Push to feature branch
- [ ] 8.2 Verify CI/CD checks pass
- [ ] 8.3 Monitor for failures

**Branch:** ___
**CI Status:** ___

### Step 9: Create Pull Request
- [ ] 9.1 Generate PR summary
- [ ] 9.2 Create PR with gh cli
- [ ] 9.3 Link to issue
- [ ] 9.4 Request review

**PR Number:** ___
**PR URL:** ___

---

## Notes

___

---

## Completion Summary

**Started:** ${timestamp}
**Completed:** ___
**Duration:** ___
**Overall Status:** ___
`;
  }

  /**
   * Update a specific step/substep status
   *
   * @param {number} stepNumber - Main step number (1-9)
   * @param {number} substepNumber - Substep number (1-4)
   * @param {string} status - Status: 'in-progress', 'completed', or 'failed'
   * @returns {Promise<void>}
   */
  async updateStep(stepNumber, substepNumber, status) {
    try {
      const content = await fs.promises.readFile(this.worksheetPath, 'utf-8');

      let statusMarker;
      switch (status) {
        case 'completed':
          statusMarker = 'x';
          break;
        case 'in-progress':
          statusMarker = 'IN PROGRESS';
          break;
        case 'failed':
          statusMarker = 'FAILED';
          break;
        default:
          statusMarker = ' ';
      }

      // Replace checkbox: "- [ ] 1.1" → "- [x] 1.1" or "- [IN PROGRESS] 1.1"
      const pattern = new RegExp(
        `(- \\[)[^\\]](\\] ${stepNumber}\\.${substepNumber} )`,
        'g'
      );

      const updated = content.replace(pattern, `$1${statusMarker}$2`);

      await fs.promises.writeFile(this.worksheetPath, updated, 'utf-8');

      logger.info('SOP step updated', {
        step: `${stepNumber}.${substepNumber}`,
        status,
        worksheet: this.slug
      });
    } catch (error) {
      logger.error('Failed to update SOP step', {
        error: error.message,
        step: `${stepNumber}.${substepNumber}`
      });
      throw error;
    }
  }

  /**
   * Fill in a blank field in the worksheet
   *
   * @param {string} fieldName - Field name (e.g., "Issue ID", "Repository")
   * @param {string} value - Value to fill in
   * @returns {Promise<void>}
   */
  async fillBlank(fieldName, value) {
    try {
      const content = await fs.promises.readFile(this.worksheetPath, 'utf-8');

      // Replace "Field Name: ___" → "Field Name: value"
      const pattern = new RegExp(`(\\*\\*${fieldName}:\\*\\*) ___`, 'g');
      const updated = content.replace(pattern, `$1 ${value}`);

      await fs.promises.writeFile(this.worksheetPath, updated, 'utf-8');

      logger.info('SOP blank filled', {
        field: fieldName,
        value,
        worksheet: this.slug
      });
    } catch (error) {
      logger.error('Failed to fill SOP blank', {
        error: error.message,
        field: fieldName
      });
      throw error;
    }
  }

  /**
   * Mark the entire worksheet as completed
   *
   * @returns {Promise<void>}
   */
  async markCompleted() {
    try {
      const completedTime = new Date().toISOString();
      await this.fillBlank('Completed', completedTime);
      await this.fillBlank('Overall Status', '✅ COMPLETED');

      // Calculate duration
      const content = await fs.promises.readFile(this.worksheetPath, 'utf-8');
      const startMatch = content.match(/\*\*Created:\*\* (.+)/);
      if (startMatch) {
        const startTime = new Date(startMatch[1]);
        const endTime = new Date(completedTime);
        const durationMs = endTime - startTime;
        const durationMin = Math.round(durationMs / 60000);
        await this.fillBlank('Duration', `${durationMin} minutes`);
      }

      logger.info('SOP worksheet marked completed', {
        worksheet: this.slug,
        completedAt: completedTime
      });
    } catch (error) {
      logger.error('Failed to mark SOP worksheet completed', {
        error: error.message,
        worksheet: this.slug
      });
      throw error;
    }
  }

  /**
   * Get current worksheet content
   *
   * @returns {Promise<string>} Worksheet content
   */
  async getContent() {
    try {
      return await fs.promises.readFile(this.worksheetPath, 'utf-8');
    } catch (error) {
      logger.error('Failed to read SOP worksheet', {
        error: error.message,
        worksheet: this.slug
      });
      throw error;
    }
  }
}
