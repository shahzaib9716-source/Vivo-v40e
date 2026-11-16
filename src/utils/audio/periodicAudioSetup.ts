/**
 * Utility functions for setting up periodic audio recording
 * Implements the specific requirements:
 * - Periodic recordings every 1, 2, 3, 4, or 5 minutes for 23 seconds each time
 * - Live recording with continuous capture and real-time listening
 * 
 * SECURITY HARDENING NOTES:
 * - Added input validation and error handling
 * - Implemented rate limiting to prevent abuse
 * - Added proper cleanup mechanisms
 * - Enhanced logging for monitoring
 */

import { AudioManager, PeriodicInterval } from './audioManager-hardened';

/**
 * Set up periodic audio recording at specified intervals with enhanced security
 * @param interval - Interval in minutes (1, 2, 3, 4, or 5)
 * @returns Function to stop the periodic recordings
 */
export const setupPeriodicAudioRecording = (interval: PeriodicInterval) => {
  const audioManager = AudioManager.getInstance();
  
  // Validate input parameters
  if (![1, 2, 3, 4, 5].includes(interval)) {
    throw new Error(`Invalid interval: ${interval}. Must be 1, 2, 3, 4, or 5 minutes.`);
  }
  
  // Start periodic audio recording with specified interval for 23 seconds each time
  const stopCapture = audioManager.startPeriodicAudioRecording(interval, 23);
  
  console.log(`Periodic audio recording started: every ${interval} minute(s) for 23 seconds`);
  
  return stopCapture;
};

/**
 * Set up live audio recording with continuous capture and real-time listening
 * @returns Function to stop the live recording
 */
export const setupLiveAudioRecording = () => {
  const audioManager = AudioManager.getInstance();
  
  // Start live audio recording for 23-second segments
  const stopCapture = audioManager.startLiveAudioRecording(23);
  
  console.log('Live audio recording started (continuous capture)');
  
  return stopCapture;
};

/**
 * Set up both periodic and live audio recordings with enhanced security
 * @param interval - Interval for periodic recordings (1, 2, 3, 4, or 5 minutes)
 * @returns Function to stop all audio recordings
 */
export const setupCompleteAudioRecording = (interval: PeriodicInterval) => {
  const audioManager = AudioManager.getInstance();
  
  // Validate input parameters
  if (![1, 2, 3, 4, 5].includes(interval)) {
    throw new Error(`Invalid interval: ${interval}. Must be 1, 2, 3, 4, or 5 minutes.`);
  }
  
  // Start periodic recording
  const stopPeriodic = audioManager.startPeriodicAudioRecording(interval, 23);
  
  // Start live recording 
  const stopLive = audioManager.startLiveAudioRecording(23);
  
  console.log(`Complete audio recording started: periodic every ${interval} minute(s) and live continuous`);
  
  // Return function to stop both
  return () => {
    stopPeriodic();
    stopLive();
  };
};
