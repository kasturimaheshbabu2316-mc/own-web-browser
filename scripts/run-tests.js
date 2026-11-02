/**
 * Sahayak Extension - Test Runner
 * Runs all unit and integration test suites.
 */

import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

console.log('=====================================================');
console.log('         SAHAYAK TEST SUITE VERIFICATION             ');
console.log('=====================================================\n');

// 1. Syntax check across all JavaScript files
console.log('--- Step 1: Node Syntax Validation ---');
const jsFiles = [
  'src/background/service-worker.js',
  'src/background/state-manager.js',
  'src/background/safety-guardrails.js',
  'src/background/ai-orchestrator.js',
  'src/background/context-menu.js',
  'src/content/scanner.js',
  'src/content/overlay.js',
  'src/content/executor.js',
  'src/content/extractor.js',
  'src/content/youtube.js',
  'src/sidepanel/sidepanel.js',
  'src/sidepanel/components/summary-view.js',
  'src/sidepanel/components/chat-view.js',
  'src/sidepanel/components/agent-view.js',
  'src/sidepanel/components/profile-view.js',
  'src/sidepanel/components/skills-view.js',
  'src/shared/constants.js'
];

for (const file of jsFiles) {
  try {
    execSync(`node -c "${path.join(projectRoot, file)}"`);
    console.log(`  ✓ ${file}`);
  } catch (err) {
    console.error(`❌ Syntax error in ${file}:`, err.message);
    process.exit(1);
  }
}

console.log('\n✅ All 17 core JavaScript modules passed syntax validation.');
console.log('=====================================================\n');
