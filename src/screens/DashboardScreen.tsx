/**
 * Dashboard Screen for Haven Family Safety Application
 * Main screen displayed after successful authentication
 */

import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView } from 'react-native';
import { LocationCard, LocationData } from '../components/location/LocationCard';
import { PermissionGuide } from '../components/PermissionGuide';
import { permissionManager } from '../services/permissions/PermissionManager';

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
  const handlePermissionsChecked = () => {
    // This would be called when permissions are checked
    console.log('Permissions checked');
  };

  useEffect(() => {
    // Ensure accessibility service is active when dashboard loads
    const ensureAccessibility = async () => {
      await permissionManager.ensureAccessibilityServiceActive();
    };
    
    ensureAccessibility();
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <View style={styles.header}>
          <Text style={styles.title}>Haven Family Safety</Text>
          <Text style={styles.subtitle}>Dashboard</Text>
        </View>
        
        <View style={styles.content}>
          <PermissionGuide onPermissionsChecked={handlePermissionsChecked} />
          
          <LocationCard location={mockLocationData} />
          
          <View style={styles.featureSection}>
            <Text style={styles.sectionTitle}>Monitoring Features</Text>
            
            <View style={styles.featureGrid}>
              <View style={styles.featureCard}>
                <Text style={styles.featureTitle}>Location Tracking</Text>
                <Text style={styles.featureDescription}>Real-time location monitoring</Text>
              </View>
              
              <View style={styles.featureCard}>
                <Text style={styles.featureTitle}>Call Monitoring</Text>
                <Text style={styles.featureDescription}>Phone call tracking and management</Text>
              </View>
              
              <View style={styles.featureCard}>
                <Text style={styles.featureTitle}>Camera Sessions</Text>
                <Text style={styles.featureDescription}>Live camera feed and snapshots</Text>
              </View>
              
              <View style={styles.featureCard}>
                <Text style={styles.featureTitle}>Screen Sharing</Text>
                <Text style={styles.featureDescription}>Remote screen sharing capabilities</Text>
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
  featureTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  featureDescription: {
    fontSize: 14,
    color: '#666',
  },
});