// Skill Manager — auto-generates and loads reusable skills
// Adapted to ESM
import fs from 'fs';
import path from 'path';
import yaml from 'yaml';
import { MAX_HOME } from '../config/soul-loader.js';

const SKILLS_DIR = path.join(MAX_HOME, 'skills');

export class SkillManager {
  constructor() {
    fs.mkdirSync(SKILLS_DIR, { recursive: true });
    this.skills = new Map();
    this.loadedSkills = new Set();
    this.loadAllSkills();
  }
  loadAllSkills() {
    if (!fs.existsSync(SKILLS_DIR)) return;
    const entries = fs.readdirSync(SKILLS_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const skillPath = path.join(SKILLS_DIR, entry.name, 'SKILL.md');
        if (fs.existsSync(skillPath)) {
          const skill = this.parseSkill(skillPath, entry.name);
          this.skills.set(entry.name, skill);
        }
      }
    }
  }
  parseSkill(skillPath, name) {
    const content = fs.readFileSync(skillPath, 'utf-8');
    let frontmatter = {}, body = content;
    if (content.startsWith('---')) {
      const endIdx = content.indexOf('---', 3);
      if (endIdx !== -1) {
        const yamlContent = content.slice(3, endIdx).trim();
        body = content.slice(endIdx + 3).trim();
        try { frontmatter = yaml.parse(yamlContent) || {}; } catch (e) { /* ignore */ }
      }
    }
    return {
      name: frontmatter.name || name, description: frontmatter.description || '',
      tags: frontmatter.tags || [], tools: frontmatter.tools || [],
      version: frontmatter.version || '1.0.0', author: frontmatter.author || '',
      content: body, raw: content, installed: true,
    };
  }
  getSkill(name) { return this.skills.get(name); }
  getAllSkills() { return Array.from(this.skills.values()); }
  loadSkill(name) {
    const skill = this.skills.get(name);
    if (!skill) return null;
    this.loadedSkills.add(name);
    return skill;
  }
  unloadSkill(name) { this.loadedSkills.delete(name); }
  getLoadedSkillsContent() {
    const contents = [];
    for (const name of this.loadedSkills) {
      const skill = this.skills.get(name);
      if (skill) contents.push(`## Skill: ${skill.name}\n${skill.content}`);
    }
    return contents.join('\n\n');
  }
  async createSkill(taskDescription, conversationHistory, toolCalls, reflection) {
    const skillName = this.generateSkillName(taskDescription);
    const skillDir = path.join(SKILLS_DIR, skillName);
    const existing = this.findSimilarSkill(taskDescription);
    if (existing && existing.similarity > 0.85) {
      return this.updateSkill(existing.skill.name, taskDescription, conversationHistory, toolCalls, reflection);
    }
    fs.mkdirSync(skillDir, { recursive: true });
    const skillContent = this.generateSkillMarkdown(taskDescription, conversationHistory, toolCalls, reflection);
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), skillContent);
    this.loadAllSkills();
    return skillName;
  }
  generateSkillName(description) {
    return description.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50);
  }
  findSimilarSkill(description) {
    const keywords1 = description.toLowerCase().split(/\s+/);
    for (const [name, skill] of this.skills) {
      const keywords2 = skill.description.toLowerCase().split(/\s+/);
      const overlap = keywords1.filter(k => keywords2.includes(k)).length;
      const similarity = overlap / Math.max(keywords1.length, keywords2.length);
      if (similarity > 0.5) return { skill, similarity };
    }
    return null;
  }
  generateSkillMarkdown(taskDescription, history, toolCalls, reflection) {
    const toolsUsed = [...new Set(toolCalls.map(tc => tc.name))];
    const name = this.generateSkillName(taskDescription);
    const title = name.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    return `---
name: "${name}"
description: "${taskDescription.slice(0, 200)}"
tags: [${toolsUsed.map(t => `"${t}"`).join(', ')}]
tools: [${toolsUsed.map(t => `"${t}"`).join(', ')}]
version: "1.0.0"
author: "MAX Auto-Generated"
metadata:
  max:
    auto_created: true
    created_at: "${new Date().toISOString()}"
    success_rate: "1/1"
---
# ${title}
## Context
${taskDescription}
## Procedure
${reflection?.procedure || '1. Analyze the request\n2. Use appropriate tools\n3. Verify results'}
## Tools Required
${toolsUsed.map(t => `- ${t}`).join('\n')}
## Common Pitfalls
${reflection?.pitfalls || '- Verify inputs before execution\n- Check for edge cases'}
## Verification
${reflection?.verification || '- Results are correct and complete'}
`;
  }
  updateSkill(name, taskDescription, history, toolCalls, reflection) {
    const skill = this.skills.get(name);
    if (!skill) return null;
    const skillPath = path.join(SKILLS_DIR, name, 'SKILL.md');
    const updated = skill.raw + `\n\n## Update (${new Date().toISOString()})\n${reflection?.lessons || 'Refined based on new experience.'}`;
    fs.writeFileSync(skillPath, updated);
    this.loadAllSkills();
    return name;
  }
}
