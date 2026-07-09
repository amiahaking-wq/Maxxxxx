/**
 * Echo Provider — a zero-dependency "fake" LLM that returns deterministic,
 * task-aware responses. Used as a last-resort fallback so the agent loop can
 * complete end-to-end without any external API key.
 *
 * This is NOT a real LLM — it pattern-matches the prompt and returns canned
 * responses that the agent's parser can consume. It's enough to:
 *   - Generate a valid plan JSON for any task
 *   - Generate plausible file content (HTML, JS, Python, etc.) based on keywords
 *   - Pass self-review (returns {approved: true, ...})
 *
 * Set ECHO_PROVIDER_ENABLED=true in .env to enable.
 */

import logger from '../../utils/logger.js';

export class EchoProvider {
  constructor() {
    this.name = 'echo';
    this.defaultModel = 'echo-local';
    this.models = [
      { id: 'echo-local', maxTokens: 4096, contextWindow: 32000 }
    ];
  }

  isAvailable() {
    return process.env.ECHO_PROVIDER_ENABLED === 'true';
  }

  getModelInfo(model = this.defaultModel) {
    return this.models[0];
  }

  /**
   * Generate a deterministic response based on the message content.
   *
   * The agent loop sends distinct prompt shapes for each phase:
   *   - PLAN: "Create a detailed plan in JSON format with fields: steps..."
   *   - EXECUTE: "Create a new file for the following task... Provide the complete file content."
   *   - SELF-REVIEW: "Review the following code... {approved, issues, suggestions}"
   *   - COGNITIVE PUSHBACK: "Analyze the prompt... {needsClarification, analysis}"
   *
   * We detect which phase we're in by looking for those signature phrases. The
   * EXECUTE check must come BEFORE the PLAN check because the execute prompt
   * also contains the word "plan" (it includes the plan in its context).
   */
  async createCompletion(options) {
    const messages = options.messages || [];
    const lastUser = [...messages].reverse().find(m => m.role === 'user');
    const lastContent = lastUser?.content || '';
    const allContent = messages.map(m => m.content || '').join('\n');
    const allLower = allContent.toLowerCase();
    const lastLower = lastContent.toLowerCase();

    logger.info('Echo provider generating response', {
      messageCount: messages.length,
      lastUserLen: lastContent.length,
      hasPlanKeyword: allLower.includes('plan'),
      hasCreateFile: allLower.includes('create a new file') || allLower.includes('provide the complete file'),
      hasReview: allLower.includes('self-review') || allLower.includes('approved'),
      hasClarification: allLower.includes('clarification') || allLower.includes('pushback')
    });

    let response = '';

    // ---- EXECUTE / CODE GENERATION ----
    // Triggered by: "Create a new file for the following task... Provide the complete file content."
    // OR: "Modify the following file... Provide the complete modified file."
    // OR: system prompt says "Generate clean, well-documented, production-ready code"
    const isExecute =
      lastLower.includes('provide the complete file content') ||
      lastLower.includes('provide the complete modified file') ||
      lastLower.includes('create a new file for the following task') ||
      (allLower.includes('generate clean') && allLower.includes('production-ready code'));

    if (isExecute) {
      response = this._generateCode(lastContent, allContent);
    }
    // ---- SELF-REVIEW ----
    else if (allLower.includes('self-review') ||
             allLower.includes('review the following code') ||
             allLower.includes('provide analysis in json format with fields: issues') ||
             (allLower.includes('approved') && allLower.includes('suggestions'))) {
      response = JSON.stringify({
        approved: true,
        issues: [],
        suggestions: ['Code looks good.']
      });
    }
    // ---- PLAN ----
    else if (allLower.includes('create a detailed plan') ||
             allLower.includes('create detailed implementation plans') ||
             (allLower.includes('plan') && allLower.includes('json format') && allLower.includes('steps'))) {
      response = this._generatePlan(lastContent);
    }
    // ---- COGNITIVE REFLECTION / PUSHBACK ----
    else if (allLower.includes('clarification') ||
             allLower.includes('pushback') ||
             allLower.includes('analyze the prompt') ||
             allLower.includes('analyzeprompt') ||
             allLower.includes('needsclarification')) {
      response = JSON.stringify({
        needsClarification: false,
        analysis: 'Task is clear enough to proceed.',
        confidence: 0.95,
        reasoning: 'The task description is specific enough to generate a plan.'
      });
    }
    // ---- CODE ANALYSIS ----
    else if (allLower.includes('analyze this code') ||
             allLower.includes('code reviewer') ||
             allLower.includes('analyze the code for bugs')) {
      response = JSON.stringify({
        issues: [],
        suggestions: ['Code is well-structured.'],
        security_concerns: [],
        quality_score: 8
      });
    }
    // ---- ERROR FIXING ----
    else if (allLower.includes('debugging expert') ||
             allLower.includes('provide the fixed code')) {
      response = '```\n// Fixed version\n' + lastContent.substring(0, 500) + '\n```';
    }
    // ---- ARCHITECTURE DOCUMENTATION ----
    else if (allLower.includes('architect') ||
             allLower.includes('document the architecture') ||
             allLower.includes('documentation')) {
      response = '# Architecture\n\nThis module was generated by MAX autonomous coding agent.\n\n## Components\n\n- Main entry point\n- Helper utilities\n\n## Notes\n\nSee the source code for details.';
    }
    // ---- GENERIC FALLBACK: always return JSON so callers that expect
    //      JSON don't crash on "OK"
    else {
      response = JSON.stringify({
        ok: true,
        message: 'Echo provider generic response',
        task: lastContent.substring(0, 200)
      });
    }

    // Simulate small network latency so the agent loop's async flow is realistic
    await new Promise(r => setTimeout(r, 50));

    const inputTokens = Math.ceil(allContent.length / 4);
    const outputTokens = Math.ceil(response.length / 4);

    return {
      content: response,
      model: this.defaultModel,
      provider: this.name,
      usage: {
        prompt_tokens: inputTokens,
        completion_tokens: outputTokens,
        total_tokens: inputTokens + outputTokens
      },
      finishReason: 'stop'
    };
  }

  /**
   * Generate a simple plan: 1 step that creates a file matching the task.
   */
  _generatePlan(taskText) {
    // Detect the kind of file to create from the task text
    let fileName = 'output.txt';
    let action = 'create';

    const t = (taskText || '').toLowerCase();
    if (t.includes('html') || t.includes('web page') || t.includes('landing page') || t.includes('cats store')) {
      fileName = 'index.html';
    } else if (t.includes('react') || t.includes('component')) {
      fileName = 'Component.jsx';
    } else if (t.includes('python') || t.includes('.py')) {
      fileName = 'main.py';
    } else if (t.includes('javascript') || t.includes('.js') || t.includes('node')) {
      fileName = 'index.js';
    } else if (t.includes('typescript') || t.includes('.ts')) {
      fileName = 'index.ts';
    } else if (t.includes('css') || t.includes('style')) {
      fileName = 'styles.css';
    } else if (t.includes('json') || t.includes('config')) {
      fileName = 'config.json';
    } else if (t.includes('readme') || t.includes('documentation')) {
      fileName = 'README.md';
    } else if (t.includes('login')) {
      fileName = 'login.html';
    }

    return JSON.stringify({
      steps: [
        {
          file: fileName,
          action: action,
          description: taskText || 'Create the requested file'
        }
      ],
      estimated_complexity: 'low',
      risks: []
    });
  }

  /**
   * Generate plausible file content based on the task.
   */
  _generateCode(taskText, allContent) {
    const t = (taskText || '').toLowerCase();

    // HTML / web page
    if (t.includes('html') || t.includes('web page') || t.includes('cats store') || t.includes('landing page') || t.includes('login page')) {
      const title = t.includes('cats') ? '🐱 Cats Store' :
                    t.includes('login') ? 'Login' :
                    t.includes('landing') ? 'Landing Page' : 'My Web Page';
      const isLogin = t.includes('login');
      const isCats = t.includes('cats');

      let body = '';
      if (isCats) {
        body = `
    <header>
      <h1>🐱 Welcome to the Cats Store</h1>
      <nav>
        <a href="#products">Products</a>
        <a href="#about">About</a>
        <a href="#contact">Contact</a>
      </nav>
    </header>
    <main>
      <section id="products">
        <h2>Our Cats</h2>
        <div class="grid">
          <div class="card"><h3>Whiskers</h3><p>Tabby · $200</p><button>Add to Cart</button></div>
          <div class="card"><h3>Mittens</h3><p>Siamese · $300</p><button>Add to Cart</button></div>
          <div class="card"><h3>Shadow</h3><p>Maine Coon · $500</p><button>Add to Cart</button></div>
        </div>
      </section>
      <section id="about"><h2>About Us</h2><p>We love cats and want to share them with you.</p></section>
      <section id="contact"><h2>Contact</h2><p>Email: hello@catsstore.example</p></section>
    </main>`;
      } else if (isLogin) {
        body = `
    <main class="login-container">
      <form class="login-form" onsubmit="event.preventDefault(); alert('Login submitted!');">
        <h1>Sign In</h1>
        <label>Email<br><input type="email" required placeholder="you@example.com"></label>
        <label>Password<br><input type="password" required placeholder="••••••••"></label>
        <button type="submit">Sign In</button>
        <p class="hint">Don't have an account? <a href="#">Sign up</a></p>
      </form>
    </main>`;
      } else {
        body = `
    <main>
      <h1>Hello from MAX</h1>
      <p>This page was generated by the MAX autonomous coding agent.</p>
    </main>`;
      }

      return '```\n<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>' + title + '</title>\n  <style>\n    * { box-sizing: border-box; margin: 0; padding: 0; }\n    body { font-family: system-ui, sans-serif; line-height: 1.6; color: #333; }\n    header { background: #2c3e50; color: white; padding: 1rem 2rem; display: flex; justify-content: space-between; align-items: center; }\n    header nav a { color: white; margin-left: 1rem; text-decoration: none; }\n    main { max-width: 1100px; margin: 2rem auto; padding: 0 1rem; }\n    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 1rem; margin-top: 1rem; }\n    .card { border: 1px solid #ddd; border-radius: 8px; padding: 1rem; background: #fafafa; }\n    .card button { background: #6c5ce7; color: white; border: none; padding: 0.5rem 1rem; border-radius: 4px; cursor: pointer; margin-top: 0.5rem; }\n    .login-container { display: flex; justify-content: center; align-items: center; min-height: 80vh; }\n    .login-form { background: white; padding: 2rem; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); width: 100%; max-width: 360px; }\n    .login-form h1 { margin-bottom: 1rem; }\n    .login-form label { display: block; margin-bottom: 1rem; }\n    .login-form input { width: 100%; padding: 0.5rem; border: 1px solid #ccc; border-radius: 4px; }\n    .login-form button { width: 100%; background: #6c5ce7; color: white; border: none; padding: 0.75rem; border-radius: 4px; cursor: pointer; font-size: 1rem; }\n    .hint { text-align: center; margin-top: 1rem; font-size: 0.875rem; }\n    .hint a { color: #6c5ce7; }\n  </style>\n</head>\n<body>' + body + '\n</body>\n</html>\n```';
    }

    // JavaScript
    if (t.includes('javascript') || t.includes('.js') || t.includes('node')) {
      return '```\n// Generated by MAX\nconsole.log("Hello from MAX!");\n\nmodule.exports = {};\n```';
    }

    // Python
    if (t.includes('python') || t.includes('.py')) {
      return '```\n#!/usr/bin/env python3\n"""Generated by MAX."""\n\n\ndef main():\n    print("Hello from MAX!")\n\n\nif __name__ == "__main__":\n    main()\n```';
    }

    // README
    if (t.includes('readme') || t.includes('documentation')) {
      return '# Project\n\nGenerated by MAX autonomous coding agent.\n\n## Usage\n\nRun the project and enjoy.\n';
    }

    // JSON
    if (t.includes('json') || t.includes('config')) {
      return '```\n{\n  "name": "max-generated",\n  "version": "1.0.0",\n  "generatedBy": "MAX"\n}\n```';
    }

    // Generic fallback
    return '```\n' + (taskText || 'OK').substring(0, 500) + '\n```';
  }
}

export default EchoProvider;
