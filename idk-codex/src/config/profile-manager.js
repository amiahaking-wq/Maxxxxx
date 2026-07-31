// Profile Manager — manages user profiles and memory
// Adapted to ESM
import fs from 'fs';
import path from 'path';
import { MAX_HOME } from './soul-loader.js';

export class ProfileManager {
  constructor() {
    this.profilesDir = path.join(MAX_HOME, 'profiles');
    fs.mkdirSync(this.profilesDir, { recursive: true });
  }
  getProfile(name = 'default') {
    const profileDir = path.join(this.profilesDir, name);
    const userPath = path.join(profileDir, 'USER.md');
    const memoryPath = path.join(profileDir, 'memories', 'MEMORY.md');
    let userProfile = '', memory = '';
    if (fs.existsSync(userPath)) userProfile = fs.readFileSync(userPath, 'utf-8');
    if (fs.existsSync(memoryPath)) memory = fs.readFileSync(memoryPath, 'utf-8');
    return { name, userProfile, memory, profileDir };
  }
  updateUserProfile(profileName, content) {
    const userPath = path.join(this.profilesDir, profileName, 'USER.md');
    fs.mkdirSync(path.dirname(userPath), { recursive: true });
    fs.writeFileSync(userPath, content);
  }
  updateMemory(profileName, content) {
    const memoryPath = path.join(this.profilesDir, profileName, 'memories', 'MEMORY.md');
    fs.mkdirSync(path.dirname(memoryPath), { recursive: true });
    fs.writeFileSync(memoryPath, content);
  }
}
