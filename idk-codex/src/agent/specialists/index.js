/**
 * Specialist Agents Registry Export
 *
 * Central export for all specialist agents and registry
 */

export { SpecialistAgent } from './base.js';
export { SpecialistRegistry } from './registry.js';
export { GitSpecialist } from './git-specialist.js';
export { CodingSpecialist } from './coding-specialist.js';
export { ContextSpecialist } from './context-specialist.js';
export { ReviewSpecialist } from './review-specialist.js';
export { QASpecialist } from './qa-specialist.js';

/**
 * Create and initialize a registry with all specialists
 *
 * @returns {Promise<SpecialistRegistry>} Initialized registry
 */
export async function createSpecialistRegistry() {
  const { SpecialistRegistry } = await import('./registry.js');
  const { GitSpecialist } = await import('./git-specialist.js');
  const { CodingSpecialist } = await import('./coding-specialist.js');
  const { ContextSpecialist } = await import('./context-specialist.js');
  const { ReviewSpecialist } = await import('./review-specialist.js');
  const { QASpecialist } = await import('./qa-specialist.js');

  const registry = new SpecialistRegistry();

  // Register all specialists
  registry.register(new GitSpecialist());
  registry.register(new CodingSpecialist());
  registry.register(new ContextSpecialist());
  registry.register(new ReviewSpecialist());
  registry.register(new QASpecialist());

  return registry;
}
