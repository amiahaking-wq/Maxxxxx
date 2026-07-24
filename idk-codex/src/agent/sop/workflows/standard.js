/**
 * Standard Development Task SOP Workflow
 *
 * This workflow defines the 9-step Standard Operating Procedure
 * for handling typical development tasks. Based on Claude Code's
 * implementation of systematic task execution.
 */

export const STANDARD_SOP_WORKFLOW = {
  name: 'standard-development-task',
  description: 'Standard 9-step workflow for development tasks',
  steps: [
    {
      id: '1',
      name: 'link-github-issue',
      description: 'Link or create GitHub issue for tracking',
      substeps: [
        {
          id: '1.1',
          name: 'Check for existing issues',
          action: 'search_issues',
          required: true
        },
        {
          id: '1.2',
          name: 'Create new issue if none exist',
          action: 'create_issue',
          required: false,
          condition: 'no_existing_issue'
        },
        {
          id: '1.3',
          name: 'Link issue to chat',
          action: 'link_issue',
          required: true
        },
        {
          id: '1.4',
          name: 'Ensure issue is assigned',
          action: 'assign_issue',
          required: true
        }
      ],
      blanks: [
        { name: 'Issue ID', type: 'string', pattern: '#\\d+' },
        { name: 'Assigned to', type: 'string' }
      ],
      specialist: 'git'
    },
    {
      id: '2',
      name: 'gather-context',
      description: 'Collect all relevant context and files',
      substeps: [
        {
          id: '2.1',
          name: 'Delegate to context specialist',
          action: 'delegate_specialist',
          required: true
        },
        {
          id: '2.2',
          name: 'Collect all relevant files',
          action: 'collect_files',
          required: true
        },
        {
          id: '2.3',
          name: 'Understand problem thoroughly',
          action: 'analyze_context',
          required: true
        }
      ],
      blanks: [
        { name: 'Context Files', type: 'list' },
        { name: 'Completed', type: 'boolean' }
      ],
      specialist: 'context'
    },
    {
      id: '3',
      name: 'plan-implementation',
      description: 'Break down task and plan approach',
      substeps: [
        {
          id: '3.1',
          name: 'Break down into subtasks',
          action: 'create_subtasks',
          required: true
        },
        {
          id: '3.2',
          name: 'Identify dependencies',
          action: 'identify_dependencies',
          required: true
        },
        {
          id: '3.3',
          name: 'Estimate complexity',
          action: 'estimate_complexity',
          required: true
        }
      ],
      blanks: [
        { name: 'Plan', type: 'text' }
      ],
      specialist: 'context'
    },
    {
      id: '4',
      name: 'execute-implementation',
      description: 'Generate and apply code changes',
      substeps: [
        {
          id: '4.1',
          name: 'Delegate to coding specialist',
          action: 'delegate_specialist',
          required: true
        },
        {
          id: '4.2',
          name: 'Generate code changes',
          action: 'generate_code',
          required: true
        },
        {
          id: '4.3',
          name: 'Add co-authorship attribution',
          action: 'add_attribution',
          required: true
        }
      ],
      blanks: [
        { name: 'Files Modified', type: 'list' },
        { name: 'Attribution', type: 'string', default: 'Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>' }
      ],
      specialist: 'coding'
    },
    {
      id: '5',
      name: 'run-tests',
      description: 'Execute test suite and fix failures',
      substeps: [
        {
          id: '5.1',
          name: 'Delegate to QA specialist',
          action: 'delegate_specialist',
          required: true
        },
        {
          id: '5.2',
          name: 'Run test suite',
          action: 'run_tests',
          required: true
        },
        {
          id: '5.3',
          name: 'Fix any failures (max 10 retries)',
          action: 'fix_failures',
          required: false,
          maxRetries: 10
        }
      ],
      blanks: [
        { name: 'Test Results', type: 'string' },
        { name: 'Failures Fixed', type: 'number', default: 0 }
      ],
      specialist: 'qa'
    },
    {
      id: '6',
      name: 'code-review',
      description: 'Review code for compliance and quality',
      substeps: [
        {
          id: '6.1',
          name: 'Delegate to review specialist',
          action: 'delegate_specialist',
          required: true
        },
        {
          id: '6.2',
          name: 'Check CLAUDE.md compliance',
          action: 'check_compliance',
          required: true
        },
        {
          id: '6.3',
          name: 'Verify error handling',
          action: 'verify_error_handling',
          required: true
        },
        {
          id: '6.4',
          name: 'Validate documentation',
          action: 'validate_docs',
          required: true
        }
      ],
      blanks: [
        { name: 'Review Status', type: 'string' },
        { name: 'Issues Found', type: 'number', default: 0 }
      ],
      specialist: 'review'
    },
    {
      id: '7',
      name: 'commit-changes',
      description: 'Stage and commit changes with proper attribution',
      substeps: [
        {
          id: '7.1',
          name: 'Delegate to git specialist',
          action: 'delegate_specialist',
          required: true
        },
        {
          id: '7.2',
          name: 'Stage modified files',
          action: 'stage_files',
          required: true
        },
        {
          id: '7.3',
          name: 'Create descriptive commit message',
          action: 'create_commit_message',
          required: true
        },
        {
          id: '7.4',
          name: 'Add co-authorship attribution',
          action: 'add_coauthor',
          required: true
        }
      ],
      blanks: [
        { name: 'Commit Hash', type: 'string' },
        { name: 'Commit Message', type: 'text' }
      ],
      specialist: 'git'
    },
    {
      id: '8',
      name: 'push-to-remote',
      description: 'Push changes and monitor CI/CD',
      substeps: [
        {
          id: '8.1',
          name: 'Push to feature branch',
          action: 'push_branch',
          required: true
        },
        {
          id: '8.2',
          name: 'Verify CI/CD checks pass',
          action: 'check_ci',
          required: true
        },
        {
          id: '8.3',
          name: 'Monitor for failures',
          action: 'monitor_ci',
          required: false
        }
      ],
      blanks: [
        { name: 'Branch', type: 'string' },
        { name: 'CI Status', type: 'string' }
      ],
      specialist: 'git'
    },
    {
      id: '9',
      name: 'create-pull-request',
      description: 'Create PR and request review',
      substeps: [
        {
          id: '9.1',
          name: 'Generate PR summary',
          action: 'generate_pr_summary',
          required: true
        },
        {
          id: '9.2',
          name: 'Create PR with gh cli',
          action: 'create_pr',
          required: true
        },
        {
          id: '9.3',
          name: 'Link to issue',
          action: 'link_pr_issue',
          required: true
        },
        {
          id: '9.4',
          name: 'Request review',
          action: 'request_review',
          required: false
        }
      ],
      blanks: [
        { name: 'PR Number', type: 'number' },
        { name: 'PR URL', type: 'url' }
      ],
      specialist: 'git'
    }
  ]
};

/**
 * Hotfix Workflow - Fast-tracked workflow for urgent fixes
 * Skips some steps like planning and extensive review
 */
export const HOTFIX_SOP_WORKFLOW = {
  name: 'hotfix-workflow',
  description: 'Fast-tracked workflow for urgent fixes',
  steps: [
    {
      id: '1',
      name: 'gather-context',
      description: 'Quick context gathering',
      substeps: [
        { id: '1.1', name: 'Identify broken functionality', action: 'identify_issue', required: true },
        { id: '1.2', name: 'Locate relevant files', action: 'locate_files', required: true }
      ],
      blanks: [{ name: 'Context Files', type: 'list' }],
      specialist: 'context'
    },
    {
      id: '2',
      name: 'implement-fix',
      description: 'Apply fix quickly',
      substeps: [
        { id: '2.1', name: 'Generate fix', action: 'generate_fix', required: true },
        { id: '2.2', name: 'Run tests', action: 'run_tests', required: true }
      ],
      blanks: [{ name: 'Files Modified', type: 'list' }],
      specialist: 'coding'
    },
    {
      id: '3',
      name: 'deploy',
      description: 'Commit and push immediately',
      substeps: [
        { id: '3.1', name: 'Commit with hotfix label', action: 'commit', required: true },
        { id: '3.2', name: 'Push to main', action: 'push', required: true }
      ],
      blanks: [{ name: 'Commit Hash', type: 'string' }],
      specialist: 'git'
    }
  ]
};

/**
 * Get workflow by name
 *
 * @param {string} name - Workflow name
 * @returns {object} Workflow definition
 */
export function getWorkflow(name) {
  const workflows = {
    'standard-development-task': STANDARD_SOP_WORKFLOW,
    'hotfix-workflow': HOTFIX_SOP_WORKFLOW
  };

  return workflows[name] || STANDARD_SOP_WORKFLOW;
}

/**
 * List all available workflows
 *
 * @returns {Array<object>} Array of workflow definitions
 */
export function listWorkflows() {
  return [
    STANDARD_SOP_WORKFLOW,
    HOTFIX_SOP_WORKFLOW
  ];
}
