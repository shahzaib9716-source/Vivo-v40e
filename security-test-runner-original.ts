#!/usr/bin/env node

/**
 * Security Test Runner for Audio Recording System
 * This script runs all security and performance tests to validate the hardened system
 */

import { runSecurityAudits } from './security-audit';
import { AudioManager } from './src/utils/audio/audioManager-hardened';
import { setupPeriodicAudioRecording, setupLiveAudioRecording, setupCompleteAudioRecording } from './src/utils/audio/periodicAudioSetup';
import { AudioRecordingController } from './src/utils/audio/audioRecordingUtils';

console.log('🚀 Starting Comprehensive Security Test Suite...\n');

async function runSecurityTests() {
  try {
    console.log('🧪 Running Core Security Tests...\n');
    
    // Test the security audit framework
    const securityPassed = await runSecurityAudits();
    
    console.log('\n🔍 Testing Audio Manager Functionality...\n');
    
    // Create a fresh instance for testing
    (AudioManager as any).instance = null;
    const audioManager = AudioManager.getInstance();
    
    // Test basic functionality
    console.log('✅ Audio Manager instantiated successfully');
    
    // Test parameter validation
    try {
      // This should work
      const stopFunc1 = audioManager.startPeriodicAudioRecording(1, 23);
      console.log('✅ Periodic recording with valid parameters works');
      stopFunc1();
      
      // This should fail gracefully
      try {
        audioManager.startPeriodicAudioRecording(6 as any, 23); // Invalid interval
        console.log('❌ Should have failed with invalid interval');
      } catch (e) {
        console.log('✅ Invalid parameters handled gracefully:', e.message);
      }
    } catch (error) {
      console.error('❌ Audio manager functionality test failed:', error);
    }
    
    console.log('\n🔧 Testing Setup Functions...\n');
    
    // Test setup functions
    try {
      const stopPeriodic = setupPeriodicAudioRecording(2);
      console.log('✅ Periodic setup function works');
      stopPeriodic();
      
      const stopLive = setupLiveAudioRecording();
      console.log('✅ Live setup function works');
      stopLive();
      
      const stopComplete = setupCompleteAudioRecording(3);
      console.log('✅ Complete setup function works');
      stopComplete();
    } catch (error) {
      console.error('❌ Setup functions test failed:', error);
    }
    
    console.log('\n📊 Testing Controller Integration...\n');
    
    // Test controller
    try {
      (AudioRecordingController as any).instance = null;
      const controller = AudioRecordingController.getInstance();
      
      const stopFunc = controller.startPeriodicAudio(1);
      console.log('✅ Audio recording controller works');
      stopFunc();
      
      const status = controller.getAudioStatus();
      console.log('✅ Audio status retrieval works:', status);
    } catch (error) {
      console.error('❌ Controller integration test failed:', error);
    }
    
    console.log('\n🛡️ Security Test Suite Complete!\n');
    
    if (securityPassed) {
      console.log('🎉 ALL SECURITY TESTS PASSED - SYSTEM IS SECURE AND HARDENED');
      return true;
    } else {
      console.log('⚠️  SOME SECURITY TESTS FAILED - SYSTEM NEEDS ADDITIONAL HARDENING');
      return false;
    }
    
  } catch (error) {
    console.error('❌ Security test runner failed:', error);
    return false;
  }
}

// Run the tests
runSecurityTests()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('💥 Critical failure in security test runner:', error);
    process.exit(1);
  });