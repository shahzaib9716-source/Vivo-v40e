/** 
 * Enhanced Location Card Component for Haven Family Safety Application
 * Displays current location data and tracking status with touch interaction
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';

export interface LocationData {
  latitude: number;
  longitude: number;
  accuracy: number;
  altitude?: number;
  speed?: number;
  bearing?: number;
  timestamp: Date;
  batteryLevel: number;
}

interface EnhancedLocationCardProps {
  location: LocationData;
  onLocationPress?: () => void;
}

export const EnhancedLocationCard: React.FC<EnhancedLocationCardProps> = ({ location, onLocationPress }) => {
  const handlePress = () => {
    if (onLocationPress) {
      onLocationPress();
    }
  };

  return (
    <TouchableOpacity style={styles.container} onPress={handlePress}>
      <View style={styles.header}>
        <Text style={styles.title}>Current Location</Text>
        <Text style={styles.battery}>Battery: {location.batteryLevel}%</Text>
      </View>
      
      <View style={styles.content}>
        <View style={styles.locationInfo}>
          <Text style={styles.latitude}>Lat: {location.latitude.toFixed(6)}</Text>
          <Text style={styles.longitude}>Lng: {location.longitude.toFixed(6)}</Text>
          <Text style={styles.accuracy}>Accuracy: ±{location.accuracy.toFixed(1)}m</Text>
        </View>
        
        <View style={styles.statusInfo}>
          <Text style={styles.timestamp}>Last updated: {location.timestamp.toLocaleTimeString()}</Text>
          <Text style={styles.status}>Tracking Active</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'white',
    borderRadius: 8,
    margin: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  battery: {
    fontSize: 14,
    color: '#666',
  },
  content: {
    padding: 16,
  },
  locationInfo: {
    marginBottom: 12,
  },
  latitude: {
    fontSize: 14,
    color: '#333',
    marginBottom: 4,
  },
  longitude: {
    fontSize: 14,
    color: '#333',
    marginBottom: 4,
  },
  accuracy: {
    fontSize: 14,
    color: '#666',
  },
  statusInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  timestamp: {
    fontSize: 12,
    color: '#666',
  },
  status: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#007AFF',
  },
});