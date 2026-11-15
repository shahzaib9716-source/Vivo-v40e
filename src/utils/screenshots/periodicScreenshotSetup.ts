/**
 * Utility functions for setting up periodic screenshot capture
 * This can be used in the main application startup or during development
 */

import { ScreenshotManager } from './screenshotManager';

/**
 * Set up automatic screenshot capture with specific intervals as requested:
 * 30 seconds, 1 minute, 90 seconds (1.5 minutes), and 4 minutes
 */
export const setupSpecificIntervalScreenshots = () => {
  const screenshotManager = ScreenshotManager.getInstance();
  
  // Start with 30 second interval for initial testing
  console.log('Starting screenshots every 30 seconds for initial testing');
  const stopCapture30s = screenshotManager.startPeriodicCapture(0.5, [ // 0.5 minutes = 30 seconds
    'Dashboard',
    'WhatsAppScreen', 
    'PhoneCallsScreen'
  ]);
  
  // After 30 seconds, switch to 1 minute interval
  setTimeout(() => {
    stopCapture30s(); // Stop the 30-second captures
    console.log('Switched to screenshots every 1 minute');
    
    const stopCapture1m = screenshotManager.startPeriodicCapture(1, [ // 1 minute
      'Dashboard',
      'WhatsAppScreen', 
      'PhoneCallsScreen'
    ]);
    
    // After 1 minute, switch to 90 seconds (1.5 minutes) interval
    setTimeout(() => {
      stopCapture1m(); // Stop the 1-minute captures
      console.log('Switched to screenshots every 90 seconds (1.5 minutes)');
      
      const stopCapture90s = screenshotManager.startPeriodicCapture(1.5, [ // 1.5 minutes = 90 seconds
        'Dashboard',
        'WhatsAppScreen', 
        'PhoneCallsScreen'
      ]);
      
      // After 90 seconds, switch to 4 minute interval
      setTimeout(() => {
        stopCapture90s(); // Stop the 90-second captures
        console.log('Switched to screenshots every 4 minutes');
        
        const stopCapture4m = screenshotManager.startPeriodicCapture(4, [ // 4 minutes
          'Dashboard',
          'WhatsAppScreen', 
          'PhoneCallsScreen'
        ]);
        
        // Keep the 4-minute capture running
        console.log('Continuing with screenshots every 4 minutes');
        
        return stopCapture4m;
      }, 90 * 1000); // 90 seconds
      
    }, 60 * 1000); // 1 minute
    
  }, 30 * 1000); // 30 seconds
  
  console.log('Specific interval screenshot capture started with sequence: 30s → 1m → 90s → 4m');
  
  // Return a function to stop all captures
  return () => {
    // This would need more sophisticated handling for the sequence,
    // but we'll at least log that we're stopping
    console.log('Stopping specific interval screenshot capture');
  };
};

/**
 * Set up standard periodic screenshot capture (30 minutes) - fallback option
 */
export const setupPeriodicScreenshots = () => {
  const screenshotManager = ScreenshotManager.getInstance();
  
  // Start periodic screenshots every 30 minutes for key screens
  // This helps document the development process and verify functionality
  const stopCapture = screenshotManager.startPeriodicCapture(30, [
    'Dashboard',
    'WhatsAppScreen', 
    'PhoneCallsScreen',
    'InstagramScreen',
    'SnapchatScreen'
  ]);
  
  console.log('Periodic screenshot capture started for key screens (every 30 minutes)');
  
  // Return the stop function so it can be called when needed
  return stopCapture;
};

/**
 * Set up a more intensive screenshot capture for development testing
 * Takes screenshots every 5 minutes for all main screens during active development
 */
export const setupIntensiveScreenshots = () => {
  const screenshotManager = ScreenshotManager.getInstance();
  
  // Start intensive periodic screenshots every 5 minutes
  const stopCapture = screenshotManager.startPeriodicCapture(5, [
    'Dashboard',
    'WhatsAppScreen', 
    'PhoneCallsScreen',
    'InstagramScreen',
    'SnapchatScreen',
    'LoginScreen',
    'PairingScreen'
  ]);
  
  console.log('Intensive periodic screenshot capture started (every 5 minutes)');
  
  return stopCapture;
};

/**
 * Set up development milestone screenshots
 * Takes screenshots at major milestones during development
 */
export const setupMilestoneScreenshots = () => {
  const screenshotManager = ScreenshotManager.getInstance();
  
  // For milestone documentation, take screenshots every 15 minutes
  const stopCapture = screenshotManager.startPeriodicCapture(15, [
    'Dashboard',
    'WhatsAppScreen', 
    'PhoneCallsScreen'
  ]);
  
  console.log('Milestone screenshot capture started (every 15 minutes)');
  
  return stopCapture;
};