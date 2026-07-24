/**
 * Layer 1: User Pushback & Clarification Engine (Anti-Slop Gate)
 * Purpose: Analyzes user prompts for ambiguity and forces clarification
 * Prevents "slop code" by refusing to proceed with vague requirements
 */

import { generateCompletion } from '../../groq/client.js';
import logger from '../../utils/logger.js';

/**
 * Analyzes user prompt for ambiguity and forces clarification
 * Prevents "slop code" by refusing to proceed with vague requirements
 */
export class PushbackEngine {
  constructor() {
    this.ambiguityTriggers = [
      'add login', 'fix bugs', 'make it better', 'optimize',
      'improve', 'refactor', 'update', 'change', 'add feature',
      'clean up', 'enhance', 'modify', 'adjust', 'tweak'
    ];
  }

  /**
   * Analyzes if prompt is too vague and requires clarification
   * @param {string} userPrompt - User's task description
   * @param {Object} budgetManager - Token budget manager (optional)
   * @returns {Promise<Object>} Analysis result
   */
  async analyzePrompt(userPrompt, budgetManager = null) {
    try {
      logger.info('Analyzing prompt for ambiguity', { promptLength: userPrompt.length });

      // Check for obvious vague triggers
      const isVague = this.ambiguityTriggers.some(trigger =>
        userPrompt.toLowerCase().includes(trigger)
      );

      const messages = [{
        role: 'system',
        content: `You are an expert software architect. Analyze if this user request has enough specificity to implement safely.

Requirements for NON-VAGUE prompt:
- Specific file names or locations mentioned
- Clear technical approach (REST API, WebSocket, etc.)
- Database schema details if data involved
- UI/UX specifications if frontend
- Error handling strategy
- Security considerations

Respond with JSON:
{
  "isVague": true/false,
  "missingDetails": ["detail1", "detail2"],
  "assumptions": ["assumption1", "assumption2"],
  "risks": ["risk1", "risk2"]
}`
      }, {
        role: 'user',
        content: userPrompt
      }];

      const result = await generateCompletion(messages, {
        temperature: 0.3,
        maxTokens: 1000,
        response_format: { type: 'json_object' },
        budgetManager
      });

      const analysis = JSON.parse(result.content);

      logger.info('Prompt analysis completed', {
        isVague: isVague || analysis.isVague,
        missingDetailsCount: analysis.missingDetails?.length || 0
      });

      return {
        needsClarification: isVague || analysis.isVague,
        analysis
      };
    } catch (error) {
      logger.error('Failed to analyze prompt', { error: error.message });
      // Fail open - if analysis fails, proceed with implementation
      return {
        needsClarification: false,
        analysis: {
          isVague: false,
          missingDetails: [],
          assumptions: [],
          risks: [],
          error: error.message
        }
      };
    }
  }

  /**
   * Generates structured clarification menu for user
   * @param {string} userPrompt - User's task description
   * @param {Object} analysis - Analysis from analyzePrompt
   * @param {Object} budgetManager - Token budget manager (optional)
   * @returns {Promise<string>} Formatted clarification menu
   */
  async generateClarificationMenu(userPrompt, analysis, budgetManager = null) {
    try {
      logger.info('Generating clarification menu');

      const messages = [{
        role: 'system',
        content: `Generate a clear, structured clarification menu for the user. Format as:

**To implement "${userPrompt}", I need to clarify:**

**Missing Details:**
${analysis.missingDetails.map((d, i) => `${i + 1}. ${d}`).join('\n')}

**Current Assumptions:**
${analysis.assumptions.map((a, i) => `${i + 1}. ${a}`).join('\n')}

**Potential Risks:**
${analysis.risks.map((r, i) => `${i + 1}. ${r}`).join('\n')}

**Suggested Approaches:**

**Option A: [Approach 1]**
- Description
- Pros: ...
- Cons: ...

**Option B: [Approach 2]**
- Description
- Pros: ...
- Cons: ...

**Option C: Minimal Viable Approach (Default)**
- I'll choose the simplest approach following CLAUDE.md standards
- Minimal changes, maximum safety
- Easy to iterate on

Please choose A, B, C, or provide more specific details.`
      }, {
        role: 'user',
        content: JSON.stringify({ prompt: userPrompt, analysis })
      }];

      const result = await generateCompletion(messages, {
        temperature: 0.4,
        maxTokens: 1500,
        budgetManager
      });

      logger.info('Clarification menu generated', { menuLength: result.content.length });

      return result.content;
    } catch (error) {
      logger.error('Failed to generate clarification menu', { error: error.message });
      // Provide a basic fallback menu
      return `**To implement "${userPrompt}", I need more details:**

**Missing Information:**
${analysis.missingDetails.map((d, i) => `${i + 1}. ${d}`).join('\n')}

Please provide:
- Specific file locations
- Technical approach
- Expected behavior
- Any constraints or requirements

Or respond with "proceed with minimal approach" to use the simplest implementation.`;
    }
  }
}

export default PushbackEngine;
