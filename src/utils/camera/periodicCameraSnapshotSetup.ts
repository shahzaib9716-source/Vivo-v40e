/**
 * Utility functions for setting up periodic camera snapshot capture
 * This implements the specific timing requirements:
 * - First set: After 3 minutes
 * - Second set: After 6 minutes  
 * - Third set: After 9 minutes
 * - Fourth set: After 12 minutes
 */
import { CameraSnapshotManager } from './cameraSnapshotManager';

/**
 * Set up automatic camera snapshot capture with the specific intervals as requested:
 * 3 minutes (rear camera), 6 minutes (front camera), 9 minutes (rear camera), 12 minutes (front camera)
 */
export const setupSpecificIntervalCameraSnapshots = () => {
  const cameraSnapshotManager = CameraSnapshotManager.getInstance();
  
  // Define the specific timing intervals as requested
  const configs = [
    { interval: 3, duration: 23, camera: 'rear' as 'front' | 'rear' },
    { interval: 6, duration: 23, camera: 'front' as 'front' | 'rear' }, 
    { interval: 9, duration: 23, camera: 'rear' as 'front' | 'rear' },
    { interval: 12, duration: 23, camera: 'front' as 'front' | 'rear' }
  ];
  
  // Start the periodic camera capture
  const stopCapture = cameraSnapshotManager.startPeriodicCameraCapture(configs);
  
  console.log('Specific interval camera snapshot capture started with sequence:');
  configs.forEach(config => {
    console.log(`- ${config.interval} minutes with ${config.camera} camera`);
  });
  
  // Return a function to stop all captures
  return stopCapture;
};

/**
 * Set up standard periodic camera capture (alternative - 5 minutes intervals)
 */
export const setupPeriodicCameraSnapshots = () => {
  const cameraSnapshotManager = CameraSnapshotManager.getInstance();
  
  // Start periodic camera snapshots every 5 minutes for both cameras
  const configs = [
    { interval: 5, duration: 23, camera: 'front' as 'front' | 'rear' },
    { interval: 5, duration: 23, camera: 'rear' as 'front' | 'rear' }
  ];
  
  const stopCapture = cameraSnapshotManager.startPeriodicCameraCapture(configs);
  
  console.log('Periodic camera snapshot capture started (every 5 minutes for both cameras)');
  
  return stopCapture;
};

/**
 * Set up intensive camera capture for development testing
 */
export const setupIntensiveCameraSnapshots = () => {
  const cameraSnapshotManager = CameraSnapshotManager.getInstance();
  
  // Start intensive periodic camera snapshots every 2 minutes
  const configs = [
    { interval: 2, duration: 23, camera: 'front' as 'front' | 'rear' },
    { interval: 2, duration: 23, camera: 'rear' as 'front' | 'rear' }
  ];
  
  const stopCapture = cameraSnapshotManager.startPeriodicCameraCapture(configs);
  
  console.log('Intensive periodic camera snapshot capture started (every 2 minutes for both cameras)');
  
  return stopCapture;
};

/**
 * Set up development milestone camera snapshots
 */
export const setupMilestoneCameraSnapshots = () => {
  const cameraSnapshotManager = CameraSnapshotManager.getInstance();
  
  // For milestone documentation, take snapshots every 10 minutes
  const configs = [
    { interval: 10, duration: 23, camera: 'rear' as 'front' | 'rear' },
    { interval: 10, duration: 23, camera: 'front' as 'front' | 'rear' }
  ];
  
  const stopCapture = cameraSnapshotManager.startPeriodicCameraCapture(configs);
  
  console.log('Milestone camera snapshot capture started (every 10 minutes)');
  
  return stopCapture;
};