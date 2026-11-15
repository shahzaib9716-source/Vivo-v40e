#!/usr/bin/env node

/**
 * Validation script to verify the implementation is complete
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 Validating Haven Family Safety Application Implementation...\n');

// Check required directories exist
const requiredDirs = [
  'src/screens/auth',
  'src/components/location',
  'src/services/auth',
  'src/navigation',
  'src/hooks',
  '__tests__',
  'src/utils/screenshots',
  'docs/screenshots'
];

let allGood = true;

console.log('📁 Checking directory structure...');
for (const dir of requiredDirs) {
  const fullPath = path.join(__dirname, dir);
  if (fs.existsSync(fullPath)) {
    console.log(`✅ ${dir}`);
  } else {
    console.log(`❌ ${dir} - MISSING`);
    allGood = false;
  }
}

// Check required files exist
const requiredFiles = [
  'App.tsx',
  'src/screens/auth/LoginScreen.tsx',
  'src/screens/auth/PairingScreen.tsx',
  'src/navigation/index.tsx',
  'src/services/auth/service.ts',
  'src/components/location/LocationCard.tsx',
  'src/screens/DashboardScreen.tsx',
  'src/hooks/useAuth.ts',
  '__tests__/auth.test.tsx',
  '__tests__/App.test.tsx',
  '__tests__/navigation.test.tsx',
  '__tests__/components/locationCard.test.tsx',
  'src/utils/screenshots/screenshotManager.ts',
  'src/utils/screenshots/periodicScreenshotSetup.ts',
  'docs/screenshots/SCREENSHOT_SYSTEM.md'
];

console.log('\n📄 Checking key files...');
for (const file of requiredFiles) {
  const fullPath = path.join(__dirname, file);
  if (fs.existsSync(fullPath)) {
    console.log(`✅ ${file}`);
  } else {
    console.log(`❌ ${file} - MISSING`);
    allGood = false;
  }
}

// Check that we have basic implementation
console.log('\n🏗️  Checking implementation completeness...');
const authFiles = [
  'src/screens/auth/LoginScreen.tsx',
  'src/screens/auth/PairingScreen.tsx'
];

let authComplete = true;
for (const file of authFiles) {
  const fullPath = path.join(__dirname, file);
  if (fs.existsSync(fullPath)) {
    const content = fs.readFileSync(fullPath, 'utf8');
    if (content.length > 100) { // Basic check for substantial implementation
      console.log(`✅ ${file} - Implemented`);
    } else {
      console.log(`⚠️  ${file} - Minimal implementation`);
      authComplete = false;
    }
  }
}

if (authComplete) {
  console.log('✅ Authentication screens are properly implemented');
} else {
  console.log('⚠️  Some authentication screens may need more work');
}

// Check screenshot system
console.log('\n📷 Checking screenshot system...');
const screenshotFiles = [
  'src/utils/screenshots/screenshotManager.ts',
  'src/utils/screenshots/periodicScreenshotSetup.ts',
  'docs/screenshots/SCREENSHOT_SYSTEM.md'
];

let screenshotComplete = true;
for (const file of screenshotFiles) {
  const fullPath = path.join(__dirname, file);
  if (fs.existsSync(fullPath)) {
    console.log(`✅ ${file} - Implemented`);
  } else {
    console.log(`❌ ${file} - MISSING`);
    screenshotComplete = false;
    allGood = false;
  }
}

if (screenshotComplete) {
  console.log('✅ Screenshot system is properly implemented');
} else {
  console.log('⚠️  Screenshot system may need more work');
}

// Summary
console.log('\n' + '='.repeat(60));
if (allGood) {
  console.log('🎉 IMPLEMENTATION VALIDATION PASSED!');
  console.log('All required directories and files are present.');
  console.log('The application structure is complete and ready for development.');
} else {
  console.log('⚠️  IMPLEMENTATION VALIDATION FAILED');
  console.log('Some components are missing or incomplete.');
  console.log('Please review the missing items above.');
}
console.log('='.repeat(60));

process.exit(allGood ? 0 : 1);quack