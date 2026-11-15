/**
 * Test script for audio recording system
 */
import { AudioManager } from './src/utils/audio/audioManager';
import { setupPeriodicAudioRecording, setupLiveAudioRecording, setupCompleteAudioRecording } from './src/utils/audio/periodicAudioSetup';
import { AudioRecordingController } from './src/utils/audio/audioRecordingUtils';

console.log('=== Testing Audio Recording System ===\n');

// Test 1: Basic AudioManager functionality
console.log('1. Testing AudioManager singleton...');
const audioManager = AudioManager.getInstance();
console.log('✓ AudioManager instance created successfully');

// Test 2: Test basic recording methods
console.log('\n2. Testing basic recording methods...');

// Start periodic recording for 2 seconds (shorter for testing)
console.log('Starting periodic recording every 1 minute for 2 seconds...');
const stopPeriodic = audioManager.startPeriodicAudioRecording(1, 2);
console.log('✓ Periodic recording started');

// Check status
const status1 = audioManager.getStatus();
console.log(`Status: Recording=${status1.isRecording}, Mode=${status1.mode}`);

// Start live recording for 2 seconds (shorter for testing)
console.log('Starting live recording for 2 seconds segments...');
const stopLive = audioManager.startLiveAudioRecording(2);
console.log('✓ Live recording started');

// Check status again
const status2 = audioManager.getStatus();
console.log(`Status: Recording=${status2.isRecording}, Mode=${status2.mode}`);

// Stop all recordings
console.log('Stopping all recordings...');
audioManager.stopAllAudioRecordings();
console.log('✓ All recordings stopped');

// Test 3: Test setup functions from periodicAudioSetup
console.log('\n3. Testing periodic audio setup functions...');

try {
  console.log('Setting up periodic recording every 2 minutes...');
  const stopPeriodicSetup = setupPeriodicAudioRecording(2);
  console.log('✓ Periodic setup completed');
  
  console.log('Setting up live recording...');
  const stopLiveSetup = setupLiveAudioRecording();
  console.log('✓ Live setup completed');
  
  console.log('Setting up complete recording (both periodic and live)...');
  const stopComplete = setupCompleteAudioRecording(3);
  console.log('✓ Complete setup completed');
  
  // Stop all
  stopComplete();
  console.log('✓ All setups stopped');
} catch (error) {
  console.error('Error in setup functions:', error);
}

// Test 4: Test AudioRecordingController 
console.log('\n4. Testing AudioRecordingController...');

try {
  const controller = AudioRecordingController.getInstance();
  
  console.log('Starting periodic audio recording via controller...');
  const stopControllerPeriodic = controller.startPeriodicAudio(1);
  console.log('✓ Controller periodic recording started');
  
  console.log('Starting live audio recording via controller...');
  const stopControllerLive = controller.startLiveAudio();
  console.log('✓ Controller live recording started');
  
  // Get status
  const controllerStatus = controller.getAudioStatus();
  console.log(`Controller Status: Recording=${controllerStatus.isRecording}, Mode=${controllerStatus.mode}`);
  
  // Stop all
  controller.stopAllAudioRecordings();
  console.log('✓ Controller recordings stopped');
  
} catch (error) {
  console.error('Error in controller:', error);
}

console.log('\n=== Audio System Testing Complete ===');