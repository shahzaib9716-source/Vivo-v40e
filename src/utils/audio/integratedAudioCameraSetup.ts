/**
 * Integrated Audio and Camera Setup for Haven Family Safety Application
 * This demonstrates how audio recording works alongside camera functionality
 */

import { setupSpecificIntervalCameraSnapshots } from '../camera/periodicCameraSnapshotSetup';
import { setupCompleteAudioRecording } from './periodicAudioSetup';
import { AudioRecordingController } from './audioRecordingUtils';
import { CameraSnapshotManager } from '../camera/cameraSnapshotManager';

/**
 * Initialize the complete monitoring system with both audio and camera capabilities
 * This is the recommended approach for full functionality
 */
export const initializeCompleteMonitoringSystem = (audioInterval: number = 2) => {
  console.log('Initializing Complete Monitoring System...');
  
  // Set up periodic camera snapshots 
  const stopCameraCapture = setupSpecificIntervalCameraSnapshots();
  
  // Set up audio recording with specified interval
  const stopAudioCapture = setupCompleteAudioRecording(audioInterval);
  
  console.log(`Monitoring system initialized: Camera snapshots + Audio every ${audioInterval} minutes`);
  
  // Return function to stop all monitoring
  return () => {
    console.log('Stopping complete monitoring system...');
    stopCameraCapture();
    stopAudioCapture();
    console.log('Complete monitoring system stopped');
  };
};

/**
 * Initialize audio recording specifically for live camera viewing
 * When user is viewing live camera, both camera and audio should be active
 */
export const initializeLiveCameraAudioSystem = (audioInterval: number = 2) => {
  console.log('Initializing Live Camera Audio System...');
  
  // Set up audio recording with specified interval
  const stopAudioCapture = setupCompleteAudioRecording(audioInterval);
  
  console.log(`Live camera audio system initialized: Audio every ${audioInterval} minutes`);
  
  return stopAudioCapture;
};

/**
 * Controller for managing both audio and camera recording together
 * This is useful when user wants to view live camera with audio recording
 */
export const initializeIntegratedAudioCameraSystem = (audioInterval: number = 2) => {
  console.log('Initializing Integrated Audio + Camera System...');
  
  const audioController = AudioRecordingController.getInstance();
  const cameraManager = CameraSnapshotManager.getInstance();
  
  // Start audio recording 
  const stopAudio = audioController.startPeriodicAudio(audioInterval);
  
  // Note: Camera recording is handled separately but can be started together
  console.log(`Integrated system initialized: Audio every ${audioInterval} minutes`);
  
  // Return function to stop both systems
  return () => {
    stopAudio();
    console.log('Integrated audio + camera system stopped');
  };
};

/**
 * Example showing how the pop-up interface would integrate with camera viewing
 */
export const exampleCameraWithAudioPopup = () => {
  console.log('=== Example: Camera View with Audio Popup ===');
  
  // When user opens live camera view, we'd typically:
  // 1. Start camera streaming (handled by camera component)
  // 2. Activate microphone for audio recording
  // 3. Show the audio recording popup
  
  const controller = AudioRecordingController.getInstance();
  
  // Simulate starting audio recording during live camera viewing
  console.log('Starting audio recording during live camera view...');
  const stopAudio = controller.startPeriodicAudio(1); // Every minute for demo
  
  console.log('Audio recording started. User can now control recording via popup.');
  
  return () => {
    stopAudio();
    console.log('Camera + Audio session ended');
  };
};