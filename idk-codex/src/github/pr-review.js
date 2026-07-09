import { octokit, REPO_OWNER, REPO_NAME } from './octokit.js';
import { generateCompletion } from '../groq/client.js';
import { buildPRReviewContext } from '../groq/prompts.js';
import { getFileContent } from './octokit.js';
import logger from '../utils/logger.js';

/**
 * Get pull request data
 * @param {number} prNumber - Pull request number
 * @returns {Promise<Object>} PR data
 */
export async function getPullRequest(prNumber) {
  try {
    const { data } = await octokit.pulls.get({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      pull_number: prNumber
    });

    logger.info('Fetched pull request', {
      number: prNumber,
      title: data.title,
      state: data.state
    });

    return data;
  } catch (error) {
    logger.error('Failed to fetch pull request', { prNumber, error: error.message });
    throw error;
  }
}

/**
 * Get pull request diff
 * @param {number} prNumber - Pull request number
 * @returns {Promise<string>} PR diff
 */
export async function getPRDiff(prNumber) {
  try {
    const { data } = await octokit.pulls.get({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      pull_number: prNumber,
      mediaType: {
        format: 'diff'
      }
    });

    return data;
  } catch (error) {
    logger.error('Failed to fetch PR diff', { prNumber, error: error.message });
    throw error;
  }
}

/**
 * Get PR files changed
 * @param {number} prNumber - Pull request number
 * @returns {Promise<Array>} List of changed files
 */
export async function getPRFiles(prNumber) {
  try {
    const { data } = await octokit.pulls.listFiles({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      pull_number: prNumber
    });

    return data;
  } catch (error) {
    logger.error('Failed to fetch PR files', { prNumber, error: error.message });
    throw error;
  }
}

/**
 * Detect malicious patterns in code
 * @param {string} code - Code to analyze
 * @returns {Array} Array of detected issues
 */
function detectMaliciousPatterns(code) {
  const issues = [];

  // Hardcoded credentials patterns
  const credentialPatterns = [
    { pattern: /api[_-]?key\s*=\s*['"][^'"]{20,}['"]/, message: 'Possible hardcoded API key' },
    { pattern: /password\s*=\s*['"][^'"]+['"]/, message: 'Hardcoded password detected' },
    { pattern: /secret\s*=\s*['"][^'"]{20,}['"]/, message: 'Hardcoded secret detected' },
    { pattern: /token\s*=\s*['"][^'"]{20,}['"]/, message: 'Hardcoded token detected' },
    { pattern: /sk-[a-zA-Z0-9]{20,}/, message: 'OpenAI API key detected' },
    { pattern: /ghp_[a-zA-Z0-9]{36}/, message: 'GitHub personal access token detected' },
    { pattern: /gho_[a-zA-Z0-9]{36}/, message: 'GitHub OAuth token detected' },
  ];

  for (const { pattern, message } of credentialPatterns) {
    if (pattern.test(code)) {
      issues.push({ type: 'security', severity: 'critical', message });
    }
  }

  // Suspicious network operations
  const networkPatterns = [
    { pattern: /fetch\(['"]https?:\/\/(?!api\.github\.com|api\.groq\.com)[^'"]+['"]/, message: 'Suspicious external API call' },
    { pattern: /axios\.(?:get|post)\(['"]https?:\/\/(?!api\.github\.com|api\.groq\.com)[^'"]+['"]/, message: 'Suspicious external API call' },
    { pattern: /XMLHttpRequest/, message: 'Use of XMLHttpRequest (potentially suspicious)' },
  ];

  for (const { pattern, message } of networkPatterns) {
    if (pattern.test(code)) {
      issues.push({ type: 'security', severity: 'high', message });
    }
  }

  // Code injection vulnerabilities
  const injectionPatterns = [
    { pattern: /eval\s*\(/, message: 'Use of eval() detected (dangerous)' },
    { pattern: /Function\s*\(/, message: 'Dynamic function creation detected' },
    { pattern: /exec\s*\(/, message: 'Use of exec() with shell=true' },
    { pattern: /child_process\.exec\([^,]+,\s*\{[^}]*shell\s*:\s*true/, message: 'Shell execution with shell:true (dangerous)' },
  ];

  for (const { pattern, message } of injectionPatterns) {
    if (pattern.test(code)) {
      issues.push({ type: 'security', severity: 'critical', message });
    }
  }

  // Obfuscated code
  if (code.match(/\\x[0-9a-f]{2}/gi)?.length > 10) {
    issues.push({ type: 'security', severity: 'high', message: 'Obfuscated code detected (hex encoding)' });
  }

  if (code.match(/\\u[0-9a-f]{4}/gi)?.length > 10) {
    issues.push({ type: 'security', severity: 'high', message: 'Obfuscated code detected (unicode encoding)' });
  }

  // Suspicious file operations
  const filePatterns = [
    { pattern: /fs\.(?:unlink|rmdir|rm)\(['"]\//, message: 'Deletion of absolute path files' },
    { pattern: /fs\.chmod\([^,]+,\s*0o?777/, message: 'Setting dangerous file permissions (777)' },
  ];

  for (const { pattern, message } of filePatterns) {
    if (pattern.test(code)) {
      issues.push({ type: 'security', severity: 'high', message });
    }
  }

  return issues;
}

/**
 * Review pull request
 * @param {number} prNumber - Pull request number
 * @returns {Promise<Object>} Review result
 */
export async function reviewPullRequest(prNumber) {
  try {
    logger.info('Starting PR review', { prNumber });

    // Fetch PR data
    const prData = await getPullRequest(prNumber);
    const diff = await getPRDiff(prNumber);
    const files = await getPRFiles(prNumber);

    // Get claude.md if exists
    let claudeMdContent = null;
    try {
      claudeMdContent = await getFileContent('claude.md', prData.base.ref);
    } catch (error) {
      logger.info('No claude.md found in repository');
    }

    // Quick security scan on changed files
    const securityIssues = [];
    for (const file of files) {
      if (file.status === 'removed') continue;

      const fileIssues = detectMaliciousPatterns(file.patch || '');
      if (fileIssues.length > 0) {
        securityIssues.push({
          file: file.filename,
          issues: fileIssues
        });
      }
    }

    // AI-powered review
    const messages = buildPRReviewContext(prData, diff, claudeMdContent);
    const aiReview = await generateCompletion(messages, {
      temperature: 0.3,
      maxTokens: 4000
    });

    // Parse AI review
    let reviewData = {
      approved: false,
      security_issues: [],
      code_quality_issues: [],
      suggestions: [],
      risk_level: 'low'
    };

    try {
      const jsonMatch = aiReview.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        reviewData = JSON.parse(jsonMatch[0]);
      }
    } catch (error) {
      logger.warn('Failed to parse AI review JSON', { error: error.message });
      // Use raw content as suggestion
      reviewData.suggestions = [aiReview.content];
    }

    // Combine security scan with AI review
    if (securityIssues.length > 0) {
      reviewData.security_issues = [
        ...reviewData.security_issues,
        ...securityIssues
      ];
      reviewData.risk_level = 'critical';
      reviewData.approved = false;
    }

    logger.info('PR review completed', {
      prNumber,
      approved: reviewData.approved,
      riskLevel: reviewData.risk_level,
      issuesFound: reviewData.security_issues.length + reviewData.code_quality_issues.length
    });

    return {
      pr: {
        number: prNumber,
        title: prData.title,
        author: prData.user.login,
        state: prData.state
      },
      review: reviewData,
      files_changed: files.length,
      additions: prData.additions,
      deletions: prData.deletions
    };
  } catch (error) {
    logger.error('Failed to review pull request', { prNumber, error: error.message });
    throw error;
  }
}

/**
 * Post review comment on PR
 * @param {number} prNumber - Pull request number
 * @param {string} body - Comment body
 * @returns {Promise<Object>} Comment data
 */
export async function postReviewComment(prNumber, body) {
  try {
    const { data } = await octokit.issues.createComment({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      issue_number: prNumber,
      body
    });

    logger.info('Posted PR review comment', { prNumber });
    return data;
  } catch (error) {
    logger.error('Failed to post review comment', { prNumber, error: error.message });
    throw error;
  }
}

/**
 * Format review result as HTML for Telegram
 * @param {Object} reviewResult - Review result
 * @returns {string} Formatted HTML
 */
export function formatReviewResult(reviewResult) {
  let html = `<b>Pull Request Review</b>\n\n`;
  html += `<b>PR #${reviewResult.pr.number}</b>: ${reviewResult.pr.title}\n`;
  html += `<b>Author</b>: ${reviewResult.pr.author}\n`;
  html += `<b>Files Changed</b>: ${reviewResult.files_changed} (+${reviewResult.additions} -${reviewResult.deletions})\n\n`;

  html += `<b>Review Status</b>\n\n`;
  html += `- <b>Approved</b>: ${reviewResult.review.approved ? '✅ Yes' : '❌ No'}\n`;
  html += `- <b>Risk Level</b>: ${reviewResult.review.risk_level.toUpperCase()}\n\n`;

  if (reviewResult.review.security_issues.length > 0) {
    html += `<b>🔒 Security Issues</b>\n\n`;
    for (const issue of reviewResult.review.security_issues) {
      if (issue.file) {
        html += `<b>${issue.file}</b>\n`;
        for (const i of issue.issues) {
          html += `- [${i.severity.toUpperCase()}] ${i.message}\n`;
        }
      } else {
        html += `- ${issue}\n`;
      }
    }
    html += `\n`;
  }

  if (reviewResult.review.code_quality_issues.length > 0) {
    html += `<b>📝 Code Quality Issues</b>\n\n`;
    for (const issue of reviewResult.review.code_quality_issues) {
      html += `- ${issue}\n`;
    }
    html += `\n`;
  }

  if (reviewResult.review.suggestions.length > 0) {
    html += `<b>💡 Suggestions</b>\n\n`;
    for (const suggestion of reviewResult.review.suggestions) {
      html += `- ${suggestion}\n`;
    }
    html += `\n`;
  }

  return html;
}

export default {
  getPullRequest,
  getPRDiff,
  getPRFiles,
  reviewPullRequest,
  postReviewComment,
  formatReviewResult
};
