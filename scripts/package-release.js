/**
 * Sahayak Extension - Production Release Packager (Phase 4, Slice 4.4)
 *
 * Packages a clean, distribution-ready ZIP archive of the extension:
 * - Includes: manifest.json, src/, assets/, README.md, LICENSE
 * - Excludes: .env, src/shared/env.js, .venv, doc/, scripts/, git files, caches
 * - Audits that zero secrets or development environment files are included
 * - Generates both:
 *     1. Staged directory: dist/sahayak-ai-browser/
 *     2. Release ZIP:     dist/sahayak-ai-browser-v1.0.0.zip
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const DIST_DIR = path.join(projectRoot, 'dist');
const STAGE_DIR = path.join(DIST_DIR, 'sahayak-ai-browser');
const ZIP_OUTPUT = path.join(DIST_DIR, 'sahayak-ai-browser-v1.0.0.zip');

console.log('=====================================================');
console.log('   SAHAYAK EXTENSION — RELEASE PACKAGING ENGINE      ');
console.log('=====================================================\n');

// 1. Read manifest to verify version and validity
const manifestPath = path.join(projectRoot, 'manifest.json');
if (!fs.existsSync(manifestPath)) {
  console.error('❌ ERROR: manifest.json not found in project root!');
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
console.log(`📦 Packaging Extension: ${manifest.name} (v${manifest.version})`);
console.log(`🎯 Manifest Version:    MV${manifest.manifest_version}`);

// 2. Prepare clean dist directories
if (fs.existsSync(DIST_DIR)) {
  fs.rmSync(DIST_DIR, { recursive: true, force: true });
}
fs.mkdirSync(STAGE_DIR, { recursive: true });

// 3. Define files and directories to copy
const itemsToCopy = [
  { src: 'manifest.json', dest: 'manifest.json' },
  { src: 'README.md', dest: 'README.md' },
  { src: 'LICENSE', dest: 'LICENSE' },
  { src: 'assets', dest: 'assets' },
  { src: 'src', dest: 'src' }
];

// Files strictly excluded from distribution
const EXCLUDED_PATTERNS = [
  /[\\/]env\.js$/i,           // NEVER package local secret env.js
  /[\\/]\.env/i,              // NEVER package .env files
  /[\\/]\.git/i,
  /[\\/]\.venv/i,
  /[\\/]\.cursor/i,
  /[\\/]\.idea/i,
  /[\\/]\.vscode/i,
  /[\\/]__pycache__/i,
  /\.pyc$/i,
  /\.DS_Store$/i,
  /Thumbs\.db$/i
];

function isExcluded(filePath) {
  return EXCLUDED_PATTERNS.some(regex => regex.test(filePath));
}

let copiedFilesCount = 0;

function copyRecursive(srcPath, destPath) {
  const stat = fs.statSync(srcPath);

  if (stat.isDirectory()) {
    if (isExcluded(srcPath)) return;
    if (!fs.existsSync(destPath)) {
      fs.mkdirSync(destPath, { recursive: true });
    }
    const children = fs.readdirSync(srcPath);
    for (const child of children) {
      copyRecursive(path.join(srcPath, child), path.join(destPath, child));
    }
  } else {
    if (isExcluded(srcPath)) {
      console.log(`🛡️  Sanitizing secret/excluded file: ${path.relative(projectRoot, srcPath)}`);
      return;
    }
    const parentDir = path.dirname(destPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }
    fs.copyFileSync(srcPath, destPath);
    copiedFilesCount++;
  }
}

console.log('\n--- Copying Clean Production Assets ---');
for (const item of itemsToCopy) {
  const source = path.join(projectRoot, item.src);
  const target = path.join(STAGE_DIR, item.dest);
  if (fs.existsSync(source)) {
    copyRecursive(source, target);
    console.log(`  ✓ Copied: ${item.src}`);
  } else {
    console.warn(`  ⚠️  Optional item missing: ${item.src}`);
  }
}

// 4. Sanity audit on staged files
console.log('\n--- Running Security & Sanitation Audit ---');
function auditDirectory(dirPath) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      auditDirectory(fullPath);
    } else {
      if (isExcluded(fullPath)) {
        console.error(`❌ SECURITY AUDIT FAILED: Prohibited file found in staging: ${fullPath}`);
        process.exit(1);
      }
      // Check for hardcoded API keys in text files
      if (entry.name.endsWith('.js') || entry.name.endsWith('.json')) {
        const content = fs.readFileSync(fullPath, 'utf8');
        if (/AQ\.[A-Za-z0-9_-]{40,}/.test(content) || /gsk_[A-Za-z0-9]{30,}/.test(content)) {
          console.error(`❌ SECURITY AUDIT FAILED: Hardcoded API key detected in ${fullPath}!`);
          process.exit(1);
        }
      }
    }
  }
}

auditDirectory(STAGE_DIR);
console.log('✅ Audit Passed: Zero secrets, API keys, or development files found in staging.');

// 5. Generate ZIP archive
console.log('\n--- Creating Distribution ZIP Archive ---');
try {
  // Use PowerShell Compress-Archive on Windows with single-quoted paths for spaces
  const psCommand = `Compress-Archive -Path '${STAGE_DIR}\\*' -DestinationPath '${ZIP_OUTPUT}' -Force`;
  execSync(`powershell.exe -NoProfile -Command "${psCommand}"`, { stdio: 'inherit' });

  const zipStats = fs.statSync(ZIP_OUTPUT);
  const zipSizeKB = (zipStats.size / 1024).toFixed(1);

  console.log(`\n🎉 SUCCESS! Release package generated:`);
  console.log(`   📂 Staged Directory: ${STAGE_DIR}`);
  console.log(`   📦 Release ZIP:      ${ZIP_OUTPUT} (${zipSizeKB} KB, ${copiedFilesCount} files)`);
  console.log('\n--- Verification Steps ---');
  console.log('1. Open chrome://extensions/');
  console.log('2. Enable Developer mode');
  console.log(`3. Click "Load unpacked" and select: ${STAGE_DIR}`);
  console.log('4. Verify all tabs (Summary, Chat, Agent, Skills, Profile, Settings) load with zero warnings.');
} catch (err) {
  console.error('❌ Failed to create ZIP archive:', err.message);
  process.exit(1);
}
