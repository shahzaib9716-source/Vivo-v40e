/**
 * Example of how to integrate audio recording into the Haven Family Safety Application
 * This demonstrates usage of both periodic and live recording capabilities
 */

import { setupPeriodicAudioRecording, setupLiveAudioRecording, setupCompleteAudioRecording } from './periodicAudioSetup';
import { AudioRecordingController } from './audioRecordingUtils';

/**
 * Example 1: Setup periodic audio recording every 2 minutes for 23 seconds
 */
export const examplePeriodicAudioSetup = () => {
  console.log('=== Example 1: Periodic Audio Recording ===');
  
  // This will start recording every 2 minutes for 23 seconds
  const stopRecording = setupPeriodicAudioRecording(2);
  
  // You can stop the recording at any time
  // stopRecording();
  
  return stopRecording;
};

/**
 * Example 2: Setup live audio recording (continuous)
 */
export const exampleLiveAudioSetup = () => {
  console.log('=== Example 2: Live Audio Recording ===');
  
  // This will start continuous live recording
  const stopRecording = setupLiveAudioRecording();
  
  // You can stop the recording at any time
  // stopRecording();
  
  return stopRecording;
};

/**
 * Example 3: Setup both periodic and live audio recording simultaneously
 */
export const exampleCompleteAudioSetup = () => {
  console.log('=== Example 3: Complete Audio Recording ===');
  
  // This will start both periodic (every 3 minutes) and live recording
  const stopAllRecording = setupCompleteAudioRecording(3);
  
  // You can stop all recordings at any time
  // stopAllRecording();
  
  return stopAllRecording;
};

/**
 * Example 4: Manual audio recording using the controller
 */
export const exampleManualAudioControl = () => {
  console.log('=== Example 4: Manual Audio Control ===');
  
  const controller = AudioRecordingController.getInstance();
  
  // Start periodic recording every 1 minute for 23 seconds
  const stopPeriodic = controller.startPeriodicAudio(1);
  console.log('Started periodic audio recording every 1 minute');
  
  // Start live recording (this can run alongside periodic)
  const stopLive = controller.startLiveAudio();
  console.log('Started live audio recording');
  
  // Check current status
  const status = controller.getAudioStatus();
  console.log('Audio status:', status);
  
  // Later you can stop both
  // stopPeriodic();
  // stopLive();
  
  return () => {
    stopPeriodic();
    stopLive();
  };
};

/**
 * Example 5: Get audio recording list and cleanup
 */
export const exampleAudioListAndCleanup = async () => {
  console.log('=== Example 5: Audio List and Cleanup ===');
  
  const controller = AudioRecordingController.getInstance();
  
  // Get list of all recordings
  const recordings = await controller.getAudioRecordings();
  console.log(`Found ${recordings.length} audio recordings`);
  
  // Show info about first recording if available
  if (recordings.length > 0) {
    const firstRecording = recordings[0];
    console.log('First recording:', {
      name: firstRecording.name,
      timestamp: firstRecording.timestamp,
      duration: firstRecording.duration
    });
  }
  
  // Clean up old recordings (keep only 10 most recent)
  await controller.cleanupOldAudioRecordings(10);
  console.log('Cleaned up old audio recordings');
};