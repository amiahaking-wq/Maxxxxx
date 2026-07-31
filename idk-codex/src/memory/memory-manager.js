// Memory Manager — handles long-term memory and user profile
// Adapted to ESM
import fs from 'fs';
import path from 'path';
import { MAX_HOME } from '../config/soul-loader.js';

const MEMORY_CHAR_LIMIT = 2200;
const USER_CHAR_LIMIT = 1375;

export class MemoryManager {
  constructor(profileName = 'default') {
    this.profileDir = path.join(MAX_HOME, 'profiles', profileName);
    this.memoriesDir = path.join(this.profileDir, 'memories');
    this.memoryDir = path.join(this.profileDir, 'memory');
    fs.mkdirSync(this.memoriesDir, { recursive: true });
    fs.mkdirSync(this.memoryDir, { recursive: true });
    this.memoryPath = path.join(this.memoriesDir, 'MEMORY.md');
    this.userPath = path.join(this.profileDir, 'USER.md');
    // Eagerly create default files so ~/.max/profiles/<name>/ always has
    // SOUL.md (created by soul-loader), USER.md, and memories/MEMORY.md
    // present after the Harness instantiates this manager. Required by
    // Phase 4 Step 4.7 of the Hermes Engine port.
    this.getMemory();
    this.getUserProfile();
  }
  getMemory() {
    if (!fs.existsSync(this.memoryPath)) return this.createDefaultMemory();
    return fs.readFileSync(this.memoryPath, 'utf-8');
  }
  getUserProfile() {
    if (!fs.existsSync(this.userPath)) return this.createDefaultUserProfile();
    return fs.readFileSync(this.userPath, 'utf-8');
  }
  createDefaultMemory() {
    const defaultMemory = `# Memory Index
## Navigation
| Topic | File |
|-------|------|
| User Preferences | memory/preferences.md |
| Project Context | memory/projects.md |
| Important Rules | memory/rules.md |
## Quick Facts
- User prefers clean, well-documented code
- Always verify before destructive operations
`;
    fs.writeFileSync(this.memoryPath, defaultMemory);
    return defaultMemory;
  }
  createDefaultUserProfile() {
    const defaultUser = `# User Profile
## Identity
Name: User
Role: Developer
## Preferences
- Code style: Clean, documented
- Communication: Direct, technical
- Verification: Always confirm destructive actions
`;
    fs.writeFileSync(this.userPath, defaultUser);
    return defaultUser;
  }
  addMemory(content, type = 'fact') {
    const timestamp = new Date().toISOString();
    const entry = `\n§ [${timestamp}] ${type.toUpperCase()}: ${content}\n`;
    let current = this.getMemory() + entry;
    if (current.length > MEMORY_CHAR_LIMIT) current = this.compressMemory(current);
    fs.writeFileSync(this.memoryPath, current);
    return current;
  }
  compressMemory(content) {
    const lines = content.split('\n');
    const index = lines.filter(l => l.startsWith('#') || l.startsWith('|') || l.startsWith('§'));
    const recent = lines.filter(l => l.startsWith('§')).slice(-10);
    return `# Memory Index (Compressed)\n\n${index.slice(0, 20).join('\n')}\n\n## Recent\n${recent.join('\n')}`;
  }
  updateUserProfile(content) { fs.writeFileSync(this.userPath, content); }
  loadSubDocument(docName) {
    const docPath = path.join(this.memoryDir, `${docName}.md`);
    return fs.existsSync(docPath) ? fs.readFileSync(docPath, 'utf-8') : null;
  }
  saveSubDocument(docName, content) {
    fs.writeFileSync(path.join(this.memoryDir, `${docName}.md`), content);
  }
}
