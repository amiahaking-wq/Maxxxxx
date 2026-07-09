/**
 * Layer 1: User Pushback & Clarification Engine (Anti-Slop Gate)
 * Purpose: Analyzes user prompts for ambiguity and forces clarification
 * Prevents "slop code" by refusing to proceed with vague requirements
 */

import Groq from 'groq-sdk';
import logger from '../../utils/logger.js';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

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

      // Use AI to detect missing specifications
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

      const options = {
        model: 'llama-3.3-70b-versatile',
        messages,
        temperature: 0.3,
        max_tokens: 1000,
        response_format: { type: 'json_object' },
        budgetManager
      };

      // Extract budgetManager from options before API call
      const { budgetManager: budget, ...requestOptions } = options;

      const completion = await groq.chat.completions.create(requestOptions);

      // Track token usage if budgetManager exists
      if (budget && completion.usage) {
        budget.addUsage(
          completion.usage.prompt_tokens,
          completion.usage.completion_tokens
        );
      }

      const analysis = JSON.parse(completion.choices[0].message.content);

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

      const options = {
        model: 'llama-3.3-70b-versatile',
        messages,
        temperature: 0.4,
        max_tokens: 1500,
        budgetManager
      };

      // Extract budgetManager from options before API call
      const { budgetManager: budget, ...requestOptions } = options;

      const completion = await groq.chat.completions.create(requestOptions);

      // Track token usage if budgetManager exists
      if (budget && completion.usage) {
        budget.addUsage(
          completion.usage.prompt_tokens,
          completion.usage.completion_tokens
        );
      }

      const menu = completion.choices[0].message.content;

      logger.info('Clarification menu generated', { menuLength: menu.length });

      return menu;
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
