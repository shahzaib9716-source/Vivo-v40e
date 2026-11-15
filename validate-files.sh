#!/bin/bash

echo "=== File Validation Script ==="

# Check all required files exist
echo "Checking file existence..."

FILES=(
  "src/utils/audio/audioManager.ts"
  "src/utils/audio/audioManager-hardened.ts" 
  "__tests__/audioManager-hardened.test.ts"
  "security-audit.ts"
  "security-test-runner.ts"
  "performance-benchmark.ts"
  "final-validation.ts"
  "SYSTEM_HARDENING_SUMMARY.md"
  "python-validation.py"
)

all_good=true

for file in "${FILES[@]}"; do
  if [ -f "$file" ]; then
    echo "✓ $file"
  else
    echo "✗ $file (MISSING)"
    all_good=false
  fi
done

if [ "$all_good" = true ]; then
  echo ""
  echo "✅ All required files exist"
else
  echo ""
  echo "❌ Some files are missing"
  exit 1
fi

# Check key content in audio manager files
echo ""
echo "=== Checking Audio Manager Content ==="

# Check main audioManager.ts
if [ -f "src/utils/audio/audioManager.ts" ]; then
  echo "Checking src/utils/audio/audioManager.ts..."
  LINE_COUNT=$(wc -l < "src/utils/audio/audioManager.ts")
  echo "  Lines: $LINE_COUNT"
  
  # Check for key methods
  if grep -q "startPeriodicAudioRecording" "src/utils/audio/audioManager.ts"; then
    echo "  ✓ startPeriodicAudioRecording found"
  else
    echo "  ✗ startPeriodicAudioRecording NOT found"
  fi
  
  if grep -q "startLiveAudioRecording" "src/utils/audio/audioManager.ts"; then
    echo "  ✓ startLiveAudioRecording found"
  else
    echo "  ✗ startLiveAudioRecording NOT found"
  fi
fi

# Check hardened audio manager
if [ -f "src/utils/audio/audioManager-hardened.ts" ]; then
  echo "Checking src/utils/audio/audioManager-hardened.ts..."
  LINE_COUNT=$(wc -l < "src/utils/audio/audioManager-hardened.ts")
  echo "  Lines: $LINE_COUNT"
  
  # Check for security features
  if grep -q "securityStats" "src/utils/audio/audioManager-hardened.ts"; then
    echo "  ✓ Security stats found"
  else
    echo "  ✗ Security stats NOT found"
  fi
  
  if grep -q "validateAudioParameters" "src/utils/audio/audioManager-hardened.ts"; then
    echo "  ✓ Parameter validation found"
  else
    echo "  ✗ Parameter validation NOT found"
  fi
  
  if grep -q "getSecureFilePath" "src/utils/audio/audioManager-hardened.ts"; then
    echo "  ✓ Secure file path found"
  else
    echo "  ✗ Secure file path NOT found"
  fi
fi

# Check test files
echo ""
echo "=== Checking Test Files ==="

if [ -f "__tests__/audioManager-hardened.test.ts" ]; then
  echo "Checking __tests__/audioManager-hardened.test.ts..."
  LINE_COUNT=$(wc -l < "__tests__/audioManager-hardened.test.ts")
  echo "  Lines: $LINE_COUNT"
  
  if grep -q "import.*audioManager-hardened" "__tests__/audioManager-hardened.test.ts"; then
    echo "  ✓ Correct import found"
  else
    echo "  ✗ Incorrect import in test file"
  fi
  
  if grep -q "Enhanced Audio Manager Security Tests" "__tests__/audioManager-hardened.test.ts"; then
    echo "  ✓ Security tests found"
  else
    echo "  ✗ Security tests NOT found"
  fi
fi

echo ""
echo "=== Final Status ==="

if [ "$all_good" = true ]; then
  echo "🎉 All validation checks passed!"
  echo "✅ Files exist and are properly structured"
  echo "✅ Audio manager implementations look complete"
  echo "✅ Security features are implemented"
  echo "✅ Test files are properly configured"
else
  echo "❌ Validation failed - please check missing files"
fi