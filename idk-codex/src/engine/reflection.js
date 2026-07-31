// Reflection Engine — analyzes completed tasks and produces structured reflection
// Adapted to ESM
import logger from '../utils/logger.js';

export class ReflectionEngine {
  constructor(llmAdapter) { this.adapter = llmAdapter; }
  async reflect(task, conversation, toolCalls, success) {
    const reflectionPrompt = `Analyze this completed task and produce structured reflection:

TASK: ${task}
SUCCESS: ${success}
TOOL_CALLS: ${JSON.stringify(toolCalls.map(tc => ({ name: tc.name, status: tc.status })))}

Produce JSON with:
- procedure: step-by-step that worked
- pitfalls: mistakes to avoid
- verification: how to verify correctness
- lessons: key lessons
- gaps: missing capabilities
- skill_worthy: true if reusable (5+ tool calls or complex)

Return ONLY valid JSON.`;
    try {
      const response = await this.adapter.generateCompletion({
        messages: [{ role: 'user', content: reflectionPrompt }],
        model: 'openrouter/auto', temperature: 0.2, max_tokens: 2000,
      });
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) return JSON.parse(jsonMatch[0]);
    } catch (e) { logger.warn('Reflection failed:', { error: e.message }); }
    return {
      procedure: 'Standard approach', pitfalls: 'None recorded',
      verification: 'Manual review', lessons: 'None', gaps: [],
      skill_worthy: toolCalls.length >= 5,
    };
  }
}
