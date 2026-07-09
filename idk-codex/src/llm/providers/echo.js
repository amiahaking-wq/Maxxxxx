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
   * Generate a simple plan: 1+ steps that create files matching the task.
   *
   * Detects:
   *  - "HTML and CSS and JavaScript" → 3 files (index.html, styles.css, script.js)
   *  - "HTML and CSS" → 2 files (index.html, styles.css)
   *  - "HTML and JavaScript" → 2 files (index.html, script.js)
   *  - just HTML → 1 file (index.html)
   *  - Python / JS / etc → 1 file
   *  - README / docs → 1 file
   */
  _generatePlan(taskText) {
    const t = (taskText || '').toLowerCase();
    const steps = [];

    const wantsHTML = t.includes('html') || t.includes('web page') || t.includes('landing page') || t.includes('cats store') || t.includes('login page');
    const wantsCSS = t.includes('css') || t.includes('style');
    const wantsJS = t.includes('javascript') || t.includes('js ') || t.includes('.js') || t.includes('js file') || t.includes('js,');
    const wantsPython = t.includes('python') || t.includes('.py');
    const wantsReact = t.includes('react') || t.includes('component') || t.includes('jsx');
    const wantsTypeScript = t.includes('typescript') || t.includes('.ts') || t.includes('tsx');
    const wantsREADME = t.includes('readme') || t.includes('documentation');
    const wantsJSON = t.includes('json') || t.includes('config');

    // IMPORTANT: include the original task text in each step.description so
    // the execute phase (which only sees step.description, not the original
    // task) knows what to generate. Without this, the Echo provider can't
    // tell that the user asked for "cats store" or "10 different types".
    const taskSummary = (taskText || '').substring(0, 200);

    // Multi-file web app: HTML + CSS + JS
    if (wantsHTML && (wantsCSS || wantsJS)) {
      steps.push({ file: 'index.html', action: 'create', description: `Create the main HTML page. Task: ${taskSummary}` });
      if (wantsCSS) {
        steps.push({ file: 'styles.css', action: 'create', description: `Create the CSS stylesheet. Task: ${taskSummary}` });
      }
      if (wantsJS) {
        steps.push({ file: 'script.js', action: 'create', description: `Create the JavaScript file for interactivity. Task: ${taskSummary}` });
      }
    }
    // Single HTML file with inline CSS/JS
    else if (wantsHTML) {
      steps.push({ file: 'index.html', action: 'create', description: `Create a self-contained HTML page with inline CSS and JavaScript. Task: ${taskSummary}` });
    }
    // React component
    else if (wantsReact) {
      const ext = wantsTypeScript ? 'tsx' : 'jsx';
      steps.push({ file: `Component.${ext}`, action: 'create', description: `Create a React component. Task: ${taskSummary}` });
    }
    // Python
    else if (wantsPython) {
      steps.push({ file: 'main.py', action: 'create', description: `Create a Python script. Task: ${taskSummary}` });
    }
    // Plain JavaScript
    else if (wantsJS && !wantsHTML) {
      steps.push({ file: 'index.js', action: 'create', description: `Create a JavaScript module. Task: ${taskSummary}` });
    }
    // TypeScript
    else if (wantsTypeScript) {
      steps.push({ file: 'index.ts', action: 'create', description: `Create a TypeScript module. Task: ${taskSummary}` });
    }
    // README
    else if (wantsREADME) {
      steps.push({ file: 'README.md', action: 'create', description: `Create project documentation. Task: ${taskSummary}` });
    }
    // JSON config
    else if (wantsJSON) {
      steps.push({ file: 'config.json', action: 'create', description: `Create a JSON configuration file. Task: ${taskSummary}` });
    }
    // Fallback: plain text
    else {
      steps.push({ file: 'output.txt', action: 'create', description: taskText || 'Generated output' });
    }

    return JSON.stringify({
      steps,
      estimated_complexity: steps.length > 1 ? 'medium' : 'low',
      risks: []
    });
  }

  /**
   * Generate plausible file content based on the task and the target file name.
   *
   * The execute-phase prompt always contains "File: <filename>" — we parse
   * the extension from that to decide what kind of content to generate.
   * This lets us produce correct content for each file in a multi-file plan
   * (e.g. HTML for index.html, CSS for styles.css, JS for script.js).
   *
   * We also read the task text for hints:
   *   - "10 different types" / "more than 10" → generate 10+ items
   *   - "cats store" → cats catalog
   *   - "login page" → login form
   *   - etc.
   */
  _generateCode(taskText, allContent) {
    const t = (taskText || '').toLowerCase();
    const allLower = (allContent || '').toLowerCase();

    // Extract the target filename from the execute prompt.
    // The execute phase prompt contains "File: <filename>".
    let targetFile = '';
    const fileMatch = allContent.match(/\nFile:\s*([^\s\n]+\.[a-zA-Z0-9]+)/i);
    if (fileMatch) {
      targetFile = fileMatch[1].toLowerCase();
    }
    // Fallback: look for any filename mentioned in the task
    if (!targetFile) {
      const taskFileMatch = t.match(/\b([a-z0-9_]+\.(html|css|js|jsx|ts|tsx|py|json|md|txt))\b/);
      if (taskFileMatch) targetFile = taskFileMatch[1];
    }

    const ext = targetFile.split('.').pop();

    // Detect quantity hints ("10 different types", "more than 10", "at least 15", etc.)
    let requestedCount = 3; // default
    const moreThanMatch = t.match(/more than\s+(\d+)/);
    const atLeastMatch = t.match(/at least\s+(\d+)/);
    const countTypesMatch = t.match(/(\d+)\s+different\s+types/);
    const countCatsMatch = t.match(/(\d+)\s+(?:cats|types|items|products|cards)/);
    if (moreThanMatch) requestedCount = Math.max(requestedCount, parseInt(moreThanMatch[1], 10) + 1);
    else if (atLeastMatch) requestedCount = Math.max(requestedCount, parseInt(atLeastMatch[1], 10));
    else if (countTypesMatch) requestedCount = Math.max(requestedCount, parseInt(countTypesMatch[1], 10));
    else if (countCatsMatch) requestedCount = Math.max(requestedCount, parseInt(countCatsMatch[1], 10));
    // Cap at 50 to keep response size reasonable
    requestedCount = Math.min(requestedCount, 50);

    // ---- CSS file ----
    if (ext === 'css') {
      return this._generateCSS(t);
    }

    // ---- JavaScript file ----
    if (ext === 'js' || ext === 'mjs') {
      return this._generateJS(t, allLower);
    }

    // ---- TypeScript file ----
    if (ext === 'ts' || ext === 'tsx') {
      return this._generateTS(t);
    }

    // ---- Python file ----
    if (ext === 'py') {
      return this._generatePython(t);
    }

    // ---- JSON file ----
    if (ext === 'json') {
      return this._generateJSON(t, requestedCount);
    }

    // ---- Markdown file ----
    if (ext === 'md') {
      return this._generateMarkdown(t);
    }

    // ---- HTML file ----
    if (ext === 'html' || t.includes('html') || t.includes('web page') || t.includes('cats store') || t.includes('landing page') || t.includes('login page')) {
      return this._generateHTML(t, requestedCount, !!allLower.includes('styles.css'), !!allLower.includes('script.js'));
    }

    // ---- Generic fallback ----
    return '```\n' + (taskText || 'OK').substring(0, 500) + '\n```';
  }

  /**
   * Generate an HTML page. If the plan also includes styles.css and script.js,
   * the HTML will link to them externally; otherwise it inlines everything.
   *
   * Detects the animal type from the task (cats, dogs, birds, fish, etc.)
   * and generates an appropriate store catalog.
   */
  _generateHTML(t, requestedCount, hasExternalCSS, hasExternalJS) {
    const isLogin = t.includes('login');
    const isLanding = t.includes('landing');

    // Detect animal type from the task
    const animalType = this._detectAnimalType(t);

    let title = 'My Web Page';
    if (animalType) title = `${animalType.emoji} ${animalType.label} Store`;
    else if (isLogin) title = 'Login';
    else if (isLanding) title = 'Landing Page';

    // Build the right <head> — external links or inline <style>
    let head = `<meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>${title}</title>`;
    if (hasExternalCSS) {
      head += '\n  <link rel="stylesheet" href="styles.css">';
    } else {
      head += '\n  <style>\n' + this._generateInlineCSS() + '\n  </style>';
    }
    if (hasExternalJS) {
      head += '\n  <script src="script.js" defer></script>';
    }

    // Build the body
    let body = '';
    if (animalType) {
      const items = this._generateAnimalsArray(animalType.id, requestedCount);
      const cards = items.map(c => `          <div class="card">\n            <div class="cat-emoji">${c.emoji}</div>\n            <h3>${c.name}</h3>\n            <p class="breed">${c.breed}</p>\n            <p class="age">${c.age} old</p>\n            <p class="price">$${c.price}</p>\n            <button class="add-to-cart" data-name="${c.name}" data-price="${c.price}">Add to Cart</button>\n          </div>`).join('\n');
      const aType = animalType.label.toLowerCase();
      const aPlural = aType.endsWith('s') ? aType : aType + 's';
      body = `    <header>\n      <h1>${animalType.emoji} Welcome to the ${animalType.label} Store</h1>\n      <nav>\n        <a href="#products">Products</a>\n        <a href="#cart">Cart (<span id="cart-count">0</span>)</a>\n        <a href="#about">About</a>\n        <a href="#contact">Contact</a>\n      </nav>\n    </header>\n    <main>\n      <section id="products">\n        <h2>Our ${animalType.label}s (${items.length} available)</h2>\n        <div class="grid">\n${cards}\n        </div>\n      </section>\n      <section id="cart">\n        <h2>Your Cart</h2>\n        <ul id="cart-items"><li>(empty)</li></ul>\n        <p>Total: $<span id="cart-total">0</span></p>\n        <button id="checkout-btn">Checkout</button>\n      </section>\n      <section id="about"><h2>About Us</h2><p>We love ${aPlural} and want to share them with you. Every ${aType} is healthy, vaccinated, and ready for a loving home.</p></section>\n      <section id="contact"><h2>Contact</h2><p>Email: hello@${aType}store.example · Phone: +1 (555) 123-4567</p></section>\n    </main>\n    <footer>\n      <p>&copy; 2026 ${animalType.label} Store · Made with 🐾 by MAX</p>\n    </footer>`;
    } else if (isLogin) {
      body = `    <main class="login-container">\n      <form class="login-form" id="login-form">\n        <h1>Sign In</h1>\n        <label>Email<br><input type="email" id="email" required placeholder="you@example.com"></label>\n        <label>Password<br><input type="password" id="password" required placeholder="••••••••"></label>\n        <button type="submit">Sign In</button>\n        <p class="hint">Don't have an account? <a href="#">Sign up</a></p>\n      </form>\n    </main>`;
    } else if (isLanding) {
      body = `    <header>\n      <h1>Welcome to Our Product</h1>\n      <p>The simplest way to get things done.</p>\n      <button>Get Started</button>\n    </header>\n    <main>\n      <section><h2>Features</h2><ul><li>Fast</li><li>Easy</li><li>Reliable</li></ul></section>\n      <section><h2>Pricing</h2><p>Free to start.</p></section>\n    </main>`;
    } else {
      body = `    <main>\n      <h1>Hello from MAX</h1>\n      <p>This page was generated by the MAX autonomous coding agent.</p>\n    </main>`;
    }

    return '```\n<!DOCTYPE html>\n<html lang="en">\n<head>\n  ' + head + '\n</head>\n<body>\n' + body + '\n</body>\n</html>\n```';
  }

  /**
   * Detect the animal type from the task text.
   * Returns { id, label, emoji } or null if no animal is mentioned.
   */
  _detectAnimalType(t) {
    if (t.includes('cat')) return { id: 'cats', label: 'Cat', emoji: '🐱' };
    if (t.includes('dog')) return { id: 'dogs', label: 'Dog', emoji: '🐶' };
    if (t.includes('bird')) return { id: 'birds', label: 'Bird', emoji: '🐦' };
    if (t.includes('fish')) return { id: 'fish', label: 'Fish', emoji: '🐟' };
    if (t.includes('rabbit') || t.includes('bunny')) return { id: 'rabbits', label: 'Rabbit', emoji: '🐰' };
    if (t.includes('hamster')) return { id: 'hamsters', label: 'Hamster', emoji: '🐹' };
    if (t.includes('reptile') || t.includes('lizard') || t.includes('snake') || t.includes('turtle')) return { id: 'reptiles', label: 'Reptile', emoji: '🦎' };
    if (t.includes('horse')) return { id: 'horses', label: 'Horse', emoji: '🐴' };
    if (t.includes('pet')) return { id: 'pets', label: 'Pet', emoji: '🐾' };
    return null;
  }

  /**
   * Build an array of N animal objects for the given animal type.
   * Each animal has: name, breed, emoji, age, price.
   */
  _generateAnimalsArray(type, count) {
    const pools = {
      cats: [
        { name: 'Whiskers', breed: 'Tabby', emoji: '🐱', age: '2 years', price: 200 },
        { name: 'Mittens', breed: 'Siamese', emoji: '😺', age: '1 year', price: 300 },
        { name: 'Shadow', breed: 'Maine Coon', emoji: '🌑', age: '3 years', price: 500 },
        { name: 'Luna', breed: 'Persian', emoji: '🌙', age: '2 years', price: 450 },
        { name: 'Oliver', breed: 'Bengal', emoji: '🐯', age: '1 year', price: 700 },
        { name: 'Bella', breed: 'Russian Blue', emoji: '💙', age: '4 years', price: 400 },
        { name: 'Simba', breed: 'Savannah', emoji: '🦁', age: '2 years', price: 1200 },
        { name: 'Nala', breed: 'Scottish Fold', emoji: '👂', age: '1 year', price: 800 },
        { name: 'Coco', breed: 'Sphynx', emoji: '🎀', age: '3 years', price: 900 },
        { name: 'Leo', breed: 'British Shorthair', emoji: '👑', age: '2 years', price: 600 },
        { name: 'Milo', breed: 'Abyssinian', emoji: '🔴', age: '1 year', price: 550 },
        { name: 'Cleo', breed: 'Burmese', emoji: '👸', age: '2 years', price: 480 },
        { name: 'Felix', breed: 'Tuxedo', emoji: '🐧', age: '3 years', price: 350 },
        { name: 'Zoe', breed: 'Turkish Angora', emoji: '⚪', age: '2 years', price: 650 },
        { name: 'Max', breed: 'Norwegian Forest', emoji: '🌲', age: '4 years', price: 520 },
        { name: 'Lily', breed: 'Ragdoll', emoji: '🌸', age: '1 year', price: 750 },
        { name: 'Tigger', breed: 'Egyptian Mau', emoji: '🐆', age: '2 years', price: 680 },
        { name: 'Ginger', breed: 'Ginger Tabby', emoji: '🦊', age: '3 years', price: 280 },
        { name: 'Pearl', breed: 'Himalayan', emoji: '💎', age: '2 years', price: 620 },
        { name: 'Oscar', breed: 'American Shorthair', emoji: '🇺🇸', age: '1 year', price: 420 }
      ],
      dogs: [
        { name: 'Buddy', breed: 'Golden Retriever', emoji: '🐕', age: '2 years', price: 800 },
        { name: 'Bella', breed: 'Labrador', emoji: '🐶', age: '1 year', price: 700 },
        { name: 'Max', breed: 'German Shepherd', emoji: '🐕‍🦺', age: '3 years', price: 1000 },
        { name: 'Lucy', breed: 'Beagle', emoji: '🐩', age: '2 years', price: 500 },
        { name: 'Charlie', breed: 'Poodle', emoji: '🐩', age: '1 year', price: 900 },
        { name: 'Daisy', breed: 'Bulldog', emoji: '🐶', age: '3 years', price: 1200 },
        { name: 'Rocky', breed: 'Boxer', emoji: '🐕', age: '2 years', price: 750 },
        { name: 'Lola', breed: 'Chihuahua', emoji: '🐕', age: '1 year', price: 400 },
        { name: 'Milo', breed: 'Husky', emoji: '🐺', age: '2 years', price: 1100 },
        { name: 'Sadie', breed: 'Dachshund', emoji: '🌭', age: '3 years', price: 550 },
        { name: 'Tucker', breed: 'Rottweiler', emoji: '🐕', age: '4 years', price: 850 },
        { name: 'Molly', breed: 'Shih Tzu', emoji: '🐶', age: '2 years', price: 650 },
        { name: 'Duke', breed: 'Doberman', emoji: '🐕', age: '3 years', price: 950 },
        { name: 'Rosie', breed: 'Pomeranian', emoji: '🐶', age: '1 year', price: 600 },
        { name: 'Bear', breed: 'Bernese Mountain', emoji: '🐻', age: '2 years', price: 1400 },
        { name: 'Ruby', breed: 'Cocker Spaniel', emoji: '🐕', age: '1 year', price: 720 },
        { name: 'Cooper', breed: 'Border Collie', emoji: '🐶', age: '2 years', price: 880 },
        { name: 'Lily', breed: 'Cavalier King Charles', emoji: '👑', age: '1 year', price: 1300 },
        { name: 'Zeus', breed: 'Great Dane', emoji: '🐕', age: '3 years', price: 1500 },
        { name: 'Zoe', breed: 'Yorkshire Terrier', emoji: '🐶', age: '2 years', price: 680 }
      ],
      birds: [
        { name: 'Kiwi', breed: 'Parakeet', emoji: '🦜', age: '1 year', price: 80 },
        { name: 'Mango', breed: 'Cockatiel', emoji: '🐤', age: '2 years', price: 150 },
        { name: 'Sunny', breed: 'Canary', emoji: '🐤', age: '1 year', price: 100 },
        { name: 'Sky', breed: 'Lovebird', emoji: '💕', age: '2 years', price: 120 },
        { name: 'Indigo', breed: 'Macaw', emoji: '🦜', age: '5 years', price: 1200 },
        { name: 'Pepper', breed: 'African Grey', emoji: '🦜', age: '4 years', price: 2000 },
        { name: 'Comet', breed: 'Cockatoo', emoji: '🦜', age: '3 years', price: 1800 },
        { name: 'Jade', breed: 'Conure', emoji: '🟢', age: '2 years', price: 400 },
        { name: 'Storm', breed: 'Finch', emoji: '🐤', age: '1 year', price: 60 },
        { name: 'Rainbow', breed: 'Lorikeet', emoji: '🌈', age: '2 years', price: 500 },
        { name: 'Echo', breed: 'Eclectus', emoji: '🦜', age: '3 years', price: 900 },
        { name: 'Pearl', breed: 'Dove', emoji: '🕊️', age: '1 year', price: 70 }
      ],
      fish: [
        { name: 'Bubbles', breed: 'Goldfish', emoji: '🐟', age: '6 months', price: 15 },
        { name: 'Flash', breed: 'Betta', emoji: '🐠', age: '1 year', price: 25 },
        { name: 'Shadow', breed: 'Angelfish', emoji: '🐟', age: '1 year', price: 40 },
        { name: 'Neon', breed: 'Tetra', emoji: '🐠', age: '6 months', price: 10 },
        { name: 'Stripes', breed: 'Danio', emoji: '🐟', age: '8 months', price: 8 },
        { name: 'Spot', breed: 'Guppy', emoji: '🐠', age: '4 months', price: 5 },
        { name: 'Crimson', breed: 'Discus', emoji: '🐟', age: '2 years', price: 120 },
        { name: 'Cobalt', breed: 'Gourami', emoji: '🐠', age: '1 year', price: 30 },
        { name: 'Sunny', breed: 'Cichlid', emoji: '🐟', age: '1 year', price: 50 },
        { name: 'Pearl', breed: 'Pearlscale', emoji: '🐠', age: '1 year', price: 35 }
      ],
      rabbits: [
        { name: 'Cottontail', breed: 'Holland Lop', emoji: '🐰', age: '1 year', price: 60 },
        { name: 'Snowball', breed: 'Netherland Dwarf', emoji: '🐰', age: '8 months', price: 80 },
        { name: 'Hops', breed: 'Mini Rex', emoji: '🐰', age: '1 year', price: 50 },
        { name: 'Thumper', breed: 'Flemish Giant', emoji: '🐰', age: '2 years', price: 150 },
        { name: 'Cocoa', breed: 'Lionhead', emoji: '🐰', age: '1 year', price: 70 },
        { name: 'Hazel', breed: 'Dutch', emoji: '🐰', age: '9 months', price: 45 }
      ],
      hamsters: [
        { name: 'Pip', breed: 'Syrian', emoji: '🐹', age: '6 months', price: 15 },
        { name: 'Waffle', breed: 'Roborovski', emoji: '🐹', age: '4 months', price: 20 },
        { name: 'Cookie', breed: 'Winter White', emoji: '🐹', age: '5 months', price: 18 },
        { name: 'Peanut', breed: 'Campbell', emoji: '🐹', age: '6 months', price: 16 },
        { name: 'Marshmallow', breed: 'Chinese', emoji: '🐹', age: '7 months', price: 22 }
      ],
      reptiles: [
        { name: 'Spike', breed: 'Bearded Dragon', emoji: '🦎', age: '2 years', price: 200 },
        { name: 'Slither', breed: 'Ball Python', emoji: '🐍', age: '3 years', price: 300 },
        { name: 'Shell', breed: 'Box Turtle', emoji: '🐢', age: '5 years', price: 150 },
        { name: 'Gecko', breed: 'Leopard Gecko', emoji: '🦎', age: '1 year', price: 120 },
        { name: 'Iggie', breed: 'Iguana', emoji: '🦎', age: '2 years', price: 180 }
      ],
      horses: [
        { name: 'Thunder', breed: 'Arabian', emoji: '🐴', age: '5 years', price: 5000 },
        { name: 'Spirit', breed: 'Mustang', emoji: '🐴', age: '4 years', price: 3500 },
        { name: 'Blaze', breed: 'Quarter Horse', emoji: '🐴', age: '6 years', price: 4500 },
        { name: 'Star', breed: 'Appaloosa', emoji: '🐴', age: '3 years', price: 4000 },
        { name: 'Duke', breed: 'Clydesdale', emoji: '🐴', age: '7 years', price: 8000 }
      ],
      pets: [
        { name: 'Companion', breed: 'Mixed', emoji: '🐾', age: '2 years', price: 100 },
        { name: 'Buddy', breed: 'Mixed', emoji: '🐾', age: '1 year', price: 80 },
        { name: 'Lucky', breed: 'Mixed', emoji: '🐾', age: '3 years', price: 90 }
      ]
    };

    const pool = pools[type] || pools.pets;
    return pool.slice(0, Math.min(count, pool.length));
  }

  /**
   * Generate inline CSS for a self-contained HTML file.
   */
  _generateInlineCSS() {
    return `    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, sans-serif; line-height: 1.6; color: #333; background: #f5f5f5; }
    header { background: #2c3e50; color: white; padding: 1rem 2rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem; }
    header h1 { font-size: 1.5rem; }
    header nav a { color: white; margin-left: 1rem; text-decoration: none; }
    header nav a:hover { text-decoration: underline; }
    main { max-width: 1200px; margin: 2rem auto; padding: 0 1rem; }
    section { background: white; padding: 1.5rem; margin-bottom: 1.5rem; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.06); }
    h2 { margin-bottom: 1rem; color: #2c3e50; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 1rem; }
    .card { border: 1px solid #eee; border-radius: 8px; padding: 1rem; background: #fff; transition: transform 0.15s, box-shadow 0.15s; }
    .card:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
    .cat-emoji { font-size: 3rem; text-align: center; margin-bottom: 0.5rem; }
    .card h3 { color: #2c3e50; margin-bottom: 0.25rem; }
    .card .breed { color: #6c5ce7; font-weight: 600; font-size: 0.9rem; }
    .card .age { color: #666; font-size: 0.85rem; }
    .card .price { color: #27ae60; font-weight: 700; font-size: 1.1rem; margin: 0.5rem 0; }
    .card button { background: #6c5ce7; color: white; border: none; padding: 0.5rem 1rem; border-radius: 4px; cursor: pointer; width: 100%; font-size: 0.95rem; }
    .card button:hover { background: #5b4dd1; }
    .login-container { display: flex; justify-content: center; align-items: center; min-height: 80vh; }
    .login-form { background: white; padding: 2rem; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); width: 100%; max-width: 360px; }
    .login-form h1 { margin-bottom: 1rem; }
    .login-form label { display: block; margin-bottom: 1rem; }
    .login-form input { width: 100%; padding: 0.5rem; border: 1px solid #ccc; border-radius: 4px; font-size: 1rem; }
    .login-form button { width: 100%; background: #6c5ce7; color: white; border: none; padding: 0.75rem; border-radius: 4px; cursor: pointer; font-size: 1rem; }
    .hint { text-align: center; margin-top: 1rem; font-size: 0.875rem; }
    .hint a { color: #6c5ce7; }
    footer { text-align: center; padding: 1.5rem; color: #666; font-size: 0.875rem; background: #2c3e50; color: #ccc; margin-top: 2rem; }
    #cart-items { list-style: none; padding: 0; }
    #cart-items li { padding: 0.5rem 0; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; }
    #checkout-btn { background: #27ae60; color: white; border: none; padding: 0.75rem 1.5rem; border-radius: 4px; cursor: pointer; font-size: 1rem; margin-top: 1rem; }`;
  }

  /**
   * Generate a CSS file (when the plan asks for styles.css as a separate file).
   */
  _generateCSS(t) {
    return '```\n' + this._generateInlineCSS() + '\n```';
  }

  /**
   * Generate a JavaScript file (when the plan asks for script.js as a separate file).
   * For animal-store tasks, includes add-to-cart / cart-count / checkout logic.
   */
  _generateJS(t, allLower) {
    const animal = this._detectAnimalType(t) || this._detectAnimalType(allLower);
    if (animal) {
      const labelLower = animal.label.toLowerCase();
      return '```\n// ' + animal.label + ' Store — cart interactivity\n// Generated by MAX autonomous coding agent\n\nconst cart = [];\nconst cartItemsEl = document.getElementById("cart-items");\nconst cartCountEl = document.getElementById("cart-count");\nconst cartTotalEl = document.getElementById("cart-total");\nconst checkoutBtn = document.getElementById("checkout-btn");\n\nfunction renderCart() {\n  if (cart.length === 0) {\n    cartItemsEl.innerHTML = "<li>(empty)</li>";\n  } else {\n    cartItemsEl.innerHTML = cart.map(item => `<li>${item.name} — $${item.price}</li>`).join("");\n  }\n  cartCountEl.textContent = cart.length;\n  const total = cart.reduce((sum, item) => sum + item.price, 0);\n  cartTotalEl.textContent = total;\n}\n\ndocument.querySelectorAll(".add-to-cart").forEach(btn => {\n  btn.addEventListener("click", () => {\n    const name = btn.dataset.name;\n    const price = parseInt(btn.dataset.price, 10);\n    cart.push({ name, price });\n    renderCart();\n    btn.textContent = "Added ✓";\n    btn.disabled = true;\n    setTimeout(() => { btn.textContent = "Add to Cart"; btn.disabled = false; }, 1000);\n  });\n});\n\nif (checkoutBtn) {\n  checkoutBtn.addEventListener("click", () => {\n    if (cart.length === 0) {\n      alert("Your cart is empty!");\n    } else {\n      const total = cart.reduce((sum, item) => sum + item.price, 0);\n      alert(`Thank you for adopting ${cart.length} ' + labelLower + '(s)! Total: $${total}`);\n      cart.length = 0;\n      renderCart();\n    }\n  });\n}\n\nconsole.log("' + animal.label + ' store script loaded");\n```';
    }

    if (t.includes('login')) {
      return '```\n// Login form handler\nconst form = document.getElementById("login-form");\nif (form) {\n  form.addEventListener("submit", (e) => {\n    e.preventDefault();\n    const email = document.getElementById("email").value;\n    alert(`Welcome back, ${email}!`);\n  });\n}\n```';
    }

    return '```\n// Generated by MAX\nconsole.log("Page script loaded");\n```';
  }

  /**
   * Generate a TypeScript file.
   */
  _generateTS(t) {
    return '```\n// Generated by MAX\n\nexport function main(): void {\n  console.log("Hello from MAX!");\n}\n\nmain();\n```';
  }

  /**
   * Generate a Python file.
   */
  _generatePython(t) {
    return '```\n#!/usr/bin/env python3\n"""Generated by MAX autonomous coding agent."""\n\n\ndef main() -> None:\n    print("Hello from MAX!")\n\n\nif __name__ == "__main__":\n    main()\n```';
  }

  /**
   * Generate a JSON file (e.g. for animal-store tasks, return an animals array).
   */
  _generateJSON(t, requestedCount) {
    const animal = this._detectAnimalType(t);
    if (animal) {
      const items = this._generateAnimalsArray(animal.id, requestedCount);
      return '```\n{\n  "store": "' + animal.label + ' Store",\n  "' + animal.id + '": ' + JSON.stringify(items, null, 2).replace(/\n/g, '\n  ') + '\n}\n```';
    }
    return '```\n{\n  "name": "max-generated",\n  "version": "1.0.0",\n  "generatedBy": "MAX"\n}\n```';
  }

  /**
   * Generate a Markdown file.
   */
  _generateMarkdown(t) {
    return '# Project\n\nGenerated by MAX autonomous coding agent.\n\n## Usage\n\nRun the project and enjoy.\n\n## License\n\nMIT\n';
  }

  /**
   * Build an array of N cat objects. Uses a pool of realistic cat names,
   * breeds, emojis, ages, and prices so each cat is unique.
   */
  _generateCatsArray(count) {
    const pool = [
      { name: 'Whiskers',   breed: 'Tabby',          emoji: '🐱', age: '2 years',  price: 200 },
      { name: 'Mittens',    breed: 'Siamese',        emoji: '😺', age: '1 year',   price: 300 },
      { name: 'Shadow',     breed: 'Maine Coon',     emoji: '🌑', age: '3 years',  price: 500 },
      { name: 'Luna',       breed: 'Persian',        emoji: '🌙', age: '2 years',  price: 450 },
      { name: 'Oliver',     breed: 'Bengal',         emoji: '🐯', age: '1 year',   price: 700 },
      { name: 'Bella',      breed: 'Russian Blue',   emoji: '💙', age: '4 years',  price: 400 },
      { name: 'Simba',      breed: 'Savannah',       emoji: '🦁', age: '2 years',  price: 1200 },
      { name: 'Nala',       breed: 'Scottish Fold',  emoji: '👂', age: '1 year',   price: 800 },
      { name: 'Coco',       breed: 'Sphynx',         emoji: '🎀', age: '3 years',  price: 900 },
      { name: 'Leo',        breed: 'British Shorthair', emoji: '👑', age: '2 years', price: 600 },
      { name: 'Milo',       breed: 'Abyssinian',     emoji: '🔴', age: '1 year',   price: 550 },
      { name: 'Cleo',       breed: 'Burmese',        emoji: '👸', age: '2 years',  price: 480 },
      { name: 'Felix',      breed: 'Tuxedo',         emoji: '🐧', age: '3 years',  price: 350 },
      { name: 'Zoe',        breed: 'Turkish Angora', emoji: '⚪', age: '2 years',  price: 650 },
      { name: 'Max',        breed: 'Norwegian Forest', emoji: '🌲', age: '4 years', price: 520 },
      { name: 'Lily',       breed: 'Ragdoll',        emoji: '🌸', age: '1 year',   price: 750 },
      { name: 'Tigger',     breed: 'Egyptian Mau',   emoji: '🐆', age: '2 years',  price: 680 },
      { name: 'Ginger',     breed: 'Ginger Tabby',   emoji: '🦊', age: '3 years',  price: 280 },
      { name: 'Pearl',      breed: 'Himalayan',      emoji: '💎', age: '2 years',  price: 620 },
      { name: 'Oscar',      breed: 'American Shorthair', emoji: '🇺🇸', age: '1 year', price: 420 }
    ];
    return pool.slice(0, Math.min(count, pool.length));
  }
}

export default EchoProvider;
