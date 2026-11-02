/**
 * Sahayak Extension - Practice Sandbox Launcher
 *
 * Launches Google Chrome with the Sahayak Chrome Extension pre-loaded
 * and directly opens the practice internship form testbed.
 */

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// Find Google Chrome executable
function findChrome() {
  const platform = process.platform;

  if (platform === 'win32') {
    const candidates = [
      process.env['PROGRAMFILES'] && path.join(process.env['PROGRAMFILES'], 'Google/Chrome/Application/chrome.exe'),
      process.env['PROGRAMFILES(X86)'] && path.join(process.env['PROGRAMFILES(X86)'], 'Google/Chrome/Application/chrome.exe'),
      process.env['LOCALAPPDATA'] && path.join(process.env['LOCALAPPDATA'], 'Google/Chrome/Application/chrome.exe'),
      process.env['PROGRAMFILES(X86)'] && path.join(process.env['PROGRAMFILES(X86)'], 'Microsoft/Edge/Application/msedge.exe')
    ].filter(Boolean);

    for (const p of candidates) {
      if (fs.existsSync(p)) return p;
    }
  } else if (platform === 'darwin') {
    const p = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    if (fs.existsSync(p)) return p;
  } else {
    // Linux
    const linuxBins = ['google-chrome', 'google-chrome-stable', 'chromium-browser', 'chromium'];
    return linuxBins[0];
  }

  return null;
}

const chromeBin = findChrome();
if (!chromeBin) {
  console.error('❌ Could not locate Google Chrome executable automatically.');
  console.log('Please open Chrome manually and load unpacked extension from:');
  console.log(`   ${projectRoot}`);
  process.exit(1);
}

// Temporary profile dir for clean session
const profileDir = path.join(projectRoot, '.chrome-dev-profile');
if (!fs.existsSync(profileDir)) {
  fs.mkdirSync(profileDir, { recursive: true });
}

const practiceHtmlPath = path.join(projectRoot, 'assets', 'practice', 'internship-form.html');
const practiceUrl = pathToFileURL(practiceHtmlPath).href;

console.log('=====================================================');
console.log('      SAHAYAK AI ASSISTANT — PRACTICE SANDBOX        ');
console.log('=====================================================');
console.log(`🚀 Chrome Executable: ${chromeBin}`);
console.log(`📦 Extension Path:    ${projectRoot}`);
console.log(`🎯 Testbed Form:      ${practiceUrl}\n`);
console.log('💡 Quick Start:');
console.log('1. Click the Sahayak icon in Chrome toolbar to open Side Panel.');
console.log('2. Click "Profile" tab -> "⚡ Demo Data" -> "Save Profile".');
console.log('3. Switch to "Agent" tab -> Click "Fill from profile" chip.');
console.log('4. Click "Start Errand" to test safe step-by-step approval!');
console.log('=====================================================\n');

const args = [
  `--load-extension=${projectRoot}`,
  `--user-data-dir=${profileDir}`,
  '--no-first-run',
  '--no-default-browser-check',
  practiceUrl
];

const child = spawn(chromeBin, args, {
  detached: true,
  stdio: 'ignore'
});

child.unref();

console.log('✅ Chrome launched successfully with Sahayak extension enabled.');
process.exit(0);
