/**
 * Quick test script for Cognitive Reflection System
 * Run with: node src/agent/reflection/test-cognitive-system.js
 */

import { PushbackEngine } from './pushback-engine.js';
import { AutoValidator } from '../validation/auto-validator.js';
import { ArchitectureWriter } from '../documentation/arch-writer.js';
import { CognitiveReflectionLoop } from './cognitive-loop.js';
import logger from '../../utils/logger.js';
import path from 'path';
import fs from 'fs';

// Set up test environment
process.env.ENABLE_PUSHBACK_ENGINE = 'true';
process.env.ENABLE_AUTO_VALIDATION = 'true';
process.env.ENABLE_ARCH_DOCUMENTATION = 'true';
process.env.SANDBOX_WORKSPACE = './sandbox-workspace';

console.log('\n🧪 Testing Cognitive Reflection System\n');

async function testPushbackEngine() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📋 Test 1: Pushback Engine');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const engine = new PushbackEngine();

  // Test with vague prompt
  const vaguePrompt = 'Add login to the app';
  console.log(`Analyzing vague prompt: "${vaguePrompt}"\n`);

  const analysis = await engine.analyzePrompt(vaguePrompt);

  console.log('Analysis Result:');
  console.log(`- Needs Clarification: ${analysis.needsClarification}`);
  console.log(`- Missing Details: ${analysis.analysis.missingDetails?.length || 0}`);

  if (analysis.needsClarification) {
    console.log('\n✅ PASS: Correctly detected vague prompt\n');

    const menu = await engine.generateClarificationMenu(vaguePrompt, analysis.analysis);
    console.log('Generated Clarification Menu:');
    console.log(menu.substring(0, 200) + '...\n');
  } else {
    console.log('\n❌ FAIL: Should have detected vague prompt\n');
  }

  // Test with clear prompt
  const clearPrompt = 'Update src/auth/jwt.js to use RS256 algorithm instead of HS256, regenerate keys in keys/ directory';
  console.log(`\nAnalyzing clear prompt: "${clearPrompt}"\n`);

  const clearAnalysis = await engine.analyzePrompt(clearPrompt);

  console.log('Analysis Result:');
  console.log(`- Needs Clarification: ${clearAnalysis.needsClarification}`);

  if (!clearAnalysis.needsClarification) {
    console.log('\n✅ PASS: Correctly identified clear prompt\n');
  } else {
    console.log('\n⚠️  WARN: Prompt might be flagged as vague (acceptable)\n');
  }
}

async function testAutoValidator() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔍 Test 2: Auto-Validator');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const validator = new AutoValidator();

  // Create a test directory
  const testDir = './test-validation';
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
  }

  // Test with valid JavaScript file
  const validFile = path.join(testDir, 'valid.js');
  fs.writeFileSync(validFile, 'const test = 123;\nmodule.exports = test;');

  console.log('Testing valid JavaScript file...');
  const validResult = await validator.validateFile(validFile);
  console.log(`- Valid: ${validResult.valid}`);
  console.log(`- Skipped: ${validResult.skipped}`);

  if (validResult.valid) {
    console.log('✅ PASS: Valid file passed validation\n');
  } else {
    console.log('❌ FAIL: Valid file should pass\n');
  }

  // Test with invalid JavaScript file
  const invalidFile = path.join(testDir, 'invalid.js');
  fs.writeFileSync(invalidFile, 'const test = ;'); // Syntax error

  console.log('Testing invalid JavaScript file...');
  const invalidResult = await validator.validateFile(invalidFile);
  console.log(`- Valid: ${invalidResult.valid}`);
  console.log(`- Error: ${invalidResult.error ? 'Detected' : 'None'}`);

  if (!invalidResult.valid && invalidResult.error) {
    console.log('✅ PASS: Invalid file correctly failed validation\n');
  } else {
    console.log('❌ FAIL: Invalid file should fail\n');
  }

  // Cleanup
  fs.rmSync(testDir, { recursive: true, force: true });
}

async function testArchitectureWriter() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📝 Test 3: Architecture Writer');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const testDir = './test-arch-writer';
  const writer = new ArchitectureWriter(testDir);

  const task = 'Implement JWT authentication system';
  const implementation = {
    modifiedFiles: ['src/auth/jwt.js', 'src/middleware/auth.js'],
    success: true
  };
  const reasoning = 'JWT chosen for stateless authentication and scalability';

  console.log('Documenting architecture decision...\n');

  const result = await writer.documentDecision(task, implementation, reasoning);

  console.log(`- Success: ${result.success}`);
  console.log(`- File Path: ${result.filePath}`);

  if (result.success && fs.existsSync(result.filePath)) {
    const content = fs.readFileSync(result.filePath, 'utf8');
    console.log('\nGenerated Documentation (first 300 chars):');
    console.log(content.substring(0, 300) + '...\n');

    if (content.includes(task) && content.includes('JWT')) {
      console.log('✅ PASS: Documentation generated successfully\n');
    } else {
      console.log('❌ FAIL: Documentation missing expected content\n');
    }

    // Cleanup
    fs.rmSync(testDir, { recursive: true, force: true });
  } else {
    console.log('❌ FAIL: Documentation file not created\n');
  }
}

async function testCognitiveLoop() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🧠 Test 4: Complete Cognitive Reflection Loop');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const testDir = './test-cognitive-loop';
  const loop = new CognitiveReflectionLoop(testDir);

  // Test with vague prompt
  const vagueTask = 'Add some features';

  console.log(`Testing with vague prompt: "${vagueTask}"\n`);

  const result = await loop.execute(vagueTask, async () => {
    console.log('(This should not be called for vague prompts)');
    return { success: false };
  });

  if (result.needsClarification) {
    console.log('✅ PASS: Loop correctly requested clarification\n');
  } else {
    console.log('❌ FAIL: Loop should have requested clarification\n');
  }

  // Cleanup
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
  }
}

async function runTests() {
  try {
    await testPushbackEngine();
    await testAutoValidator();
    await testArchitectureWriter();
    await testCognitiveLoop();

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ All tests completed!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  } catch (error) {
    console.error('\n❌ Test failed with error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runTests();
}

export { runTests };
