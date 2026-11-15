/**
 * Initialize both camera snapshots and screenshots for the Haven Family Safety Application
 * This sets up the complete monitoring system with both screenshot and camera snapshot capabilities
 */

import { setupSpecificIntervalScreenshots } from './screenshots/periodicScreenshotSetup';
import { setupSpecificIntervalCameraSnapshots } from './camera/periodicCameraSnapshotSetup';

/**
 * Initialize the complete monitoring system with both screenshots and camera snapshots
 * This function should be called during application startup to begin all monitoring activities
 */
export const initializeMonitoringSystem = () => {
  console.log('Initializing Haven Family Safety Monitoring System...');
  
  // Set up periodic screenshot capture with specific intervals (30s → 1m → 90s → 4m)
  const stopScreenshotCapture = setupSpecificIntervalScreenshots();
  
  // Set up periodic camera snapshot capture with specific intervals (3min → 6min → 9min → 12min)
  const stopCameraCapture = setupSpecificIntervalCameraSnapshots();
  
  console.log('Monitoring system initialized successfully');
  
  // Return functions to stop both types of captures
  return () => {
    console.log('Stopping monitoring system...');
    stopScreenshotCapture();
    stopCameraCapture();
    console.log('Monitoring system stopped');
  };
};

/**
 * Initialize the monitoring system with just screenshots (for testing purposes)
 */
export const initializeScreenshotOnlySystem = () => {
  console.log('Initializing Haven Family Safety Screenshot System Only...');
  
  // Set up periodic screenshot capture
  const stopScreenshotCapture = setupSpecificIntervalScreenshots();
  
  console.log('Screenshot-only monitoring system initialized successfully');
  
  return stopScreenshotCapture;
};

/**
 * Initialize the monitoring system with just camera snapshots (for testing purposes)
 */
export const initializeCameraOnlySystem = () => {
  console.log('Initializing Haven Family Safety Camera Snapshot System Only...');
  
  // Set up periodic camera snapshot capture
  const stopCameraCapture = setupSpecificIntervalCameraSnapshots();
  
  console.log('Camera-only monitoring system initialized successfully');
  
  return stopCameraCapture;
};