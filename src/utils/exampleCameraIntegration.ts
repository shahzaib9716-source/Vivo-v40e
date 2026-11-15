/**
 * Example of how to integrate camera snapshots into the main application
 * This shows different ways to start and stop the monitoring system
 */

import { initializeMonitoringSystem, initializeScreenshotOnlySystem, initializeCameraOnlySystem } from './initCameraAndScreenshots';

/**
 * Example 1: Initialize full monitoring system (both screenshots and camera snapshots)
 */
export const exampleFullMonitoringSetup = () => {
  console.log('=== Example 1: Full Monitoring System ===');
  
  // This will start both screenshot capture and camera snapshot capture
  const stopAllMonitoring = initializeMonitoringSystem();
  
  // You can stop the monitoring at any time
  // stopAllMonitoring();
  
  return stopAllMonitoring;
};

/**
 * Example 2: Initialize only screenshot system (for testing purposes)
 */
export const exampleScreenshotOnlySetup = () => {
  console.log('=== Example 2: Screenshot Only System ===');
  
  // This will start only screenshot capture
  const stopScreenshotCapture = initializeScreenshotOnlySystem();
  
  // You can stop the screenshot monitoring at any time
  // stopScreenshotCapture();
  
  return stopScreenshotCapture;
};

/**
 * Example 3: Initialize only camera snapshot system (for testing purposes)
 */
export const exampleCameraOnlySetup = () => {
  console.log('=== Example 3: Camera Only System ===');
  
  // This will start only camera snapshot capture
  const stopCameraCapture = initializeCameraOnlySystem();
  
  // You can stop the camera monitoring at any time
  // stopCameraCapture();
  
  return stopCameraCapture;
};

/**
 * Example 4: Manual camera snapshot capture (not periodic)
 */
export const exampleManualCameraCapture = async () => {
  console.log('=== Example 4: Manual Camera Capture ===');
  
  const { CameraSnapshotManager } = await import('./camera/cameraSnapshotManager');
  const manager = CameraSnapshotManager.getInstance();
  
  // Take a front camera snapshot
  const frontSnapshotPath = await manager.captureCameraSnapshot('front');
  console.log('Front camera snapshot saved to:', frontSnapshotPath);
  
  // Take a rear camera snapshot
  const rearSnapshotPath = await manager.captureCameraSnapshot('rear');
  console.log('Rear camera snapshot saved to:', rearSnapshotPath);
  
  // List all snapshots
  const snapshots = await manager.getCameraSnapshotList();
  console.log('Total camera snapshots:', snapshots.length);
};

/**
 * Example 5: Get status of camera capture system
 */
export const exampleCameraStatusCheck = () => {
  console.log('=== Example 5: Camera Status Check ===');
  
  const { CameraSnapshotManager } = require('./camera/cameraSnapshotManager');
  const manager = CameraSnapshotManager.getInstance();
  
  const status = manager.getStatus();
  console.log('Camera capture status:', status);
};