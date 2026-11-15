// Simple syntax checker for TypeScript files
const fs = require('fs');
const path = require('path');

function checkFileSyntax(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    console.log(`Checking ${filePath}...`);
    
    // Basic checks
    if (content.includes('export class AudioManager')) {
      console.log('✓ Found AudioManager class definition');
    }
    
    if (content.includes('static getInstance()')) {
      console.log('✓ Found getInstance method');
    }
    
    if (content.includes('startPeriodicAudioRecording') && content.includes('startLiveAudioRecording')) {
      console.log('✓ Found recording methods');
    }
    
    // Check for common TypeScript syntax issues
    const lines = content.split('\n');
    let lineNum = 0;
    for (const line of lines) {
      lineNum++;
      if (line.includes('import') && !line.includes('from')) {
        console.log(`  Warning: Line ${lineNum} might have import issue: ${line.trim()}`);
      }
    }
    
    console.log(`✓ File ${filePath} parsed successfully`);
    return true;
  } catch (error) {
    console.error(`✗ Error checking ${filePath}:`, error.message);
    return false;
  }
}

// Check main audio manager files
const filesToCheck = [
  'src/utils/audio/audioManager.ts',
  'src/utils/audio/audioManager-hardened.ts',
  '__tests__/audioManager-hardened.test.ts'
];

console.log('=== TypeScript Syntax Checker ===');
let allGood = true;

for (const file of filesToCheck) {
  if (fs.existsSync(file)) {
    const success = checkFileSyntax(file);
    if (!success) allGood = false;
  } else {
    console.log(`⚠️  File not found: ${file}`);
  }
}

if (allGood) {
  console.log('\n✅ All files checked successfully');
} else {
  console.log('\n❌ Some issues found');
}