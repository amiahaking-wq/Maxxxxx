// Context Engine — builds the system prompt from soul, profile, memory, skills
// Adapted to ESM
import { loadSoul } from '../config/soul-loader.js';
import { ProfileManager } from '../config/profile-manager.js';

export class ContextEngine {
  constructor(profileName = 'default') {
    this.profileName = profileName;
    this.profileManager = new ProfileManager();
    this.soul = loadSoul(profileName);
  }
  async buildSystemPrompt(options = {}) {
    const { loadedSkills = [], mode = null, taskDomain = null } = options;
    const parts = [this.soul];
    const profile = this.profileManager.getProfile(this.profileName);
    if (profile.userProfile) parts.push(`## User Profile\n${this.truncate(profile.userProfile, 1375)}`);
    if (profile.memory) parts.push(`## Memory\n${this.truncate(profile.memory, 800)}`);
    if (loadedSkills.length > 0) {
      const skillIndex = loadedSkills.map(s => `- ${s.name}: ${s.description}`).join('\n');
      parts.push(`## Available Skills\n${skillIndex}\n\nUse /skill-name to load a skill.`);
    }
    if (mode) parts.push(`## Current Mode: ${mode.name}\n${mode.description}\nAllowed tools: ${mode.allowedTools?.join(', ') || 'all'}`);
    if (taskDomain) parts.push(`## Task Domain\nFocus on ${taskDomain}. Load relevant skills as needed.`);
    return parts.join('\n\n');
  }
  truncate(text, limit) {
    if (text.length <= limit) return text;
    return text.slice(0, limit) + '\n... [truncated]';
  }
}
